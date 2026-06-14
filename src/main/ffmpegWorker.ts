/**
 * FFmpeg reconstitution worker — runs in a Node.js worker_thread.
 * Must NOT import anything that touches Electron APIs (app, BrowserWindow, etc.)
 * because worker_threads run in an isolated context without access to the main
 * Electron process.
 */
import { parentPort, workerData } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import { writeFile, unlink, readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

interface WorkerInput {
  segments: string[];
  outputPath: string;
  videoSegments?: string[];
  audioSegments?: string[];
  ffmpegPath?: string;
}

type WorkerMessage =
  | { type: 'progress'; percent: number }
  | { type: 'done'; success: true }
  | { type: 'done'; success: false; error: string };

function post(msg: WorkerMessage): void {
  parentPort?.postMessage(msg);
}

const MAX_RETRIES = 3;
const TIMEOUT_MS = 300000; // 5 minutes

/**
 * Build FFmpeg concat demuxer file content.
 * Uses forward slashes on all platforms (required by FFmpeg on Windows too).
 */
function buildConcatContent(segments: string[]): string {
  return segments
    .map((seg) => {
      const normalized = seg.replace(/\\/g, '/');
      // Escape single quotes for the concat demuxer file format
      const escaped = normalized.replace(/'/g, "'\\''");
      return `file '${escaped}'`;
    })
    .join('\n');
}

async function createConcatFile(segments: string[]): Promise<string> {
  const content = buildConcatContent(segments);
  const hash = createHash('md5').update(content).digest('hex').slice(0, 8);
  const concatPath = join(tmpdir(), `tan_concat_${hash}.txt`);
  await writeFile(concatPath, content, 'utf8');
  return concatPath;
}

/**
 * Resolve the ffmpeg binary path without using Electron APIs.
 * Tries ffmpeg-static package first, then falls back to system binary.
 */
function resolveFfmpegBinary(): string {
  // Try ffmpeg-static npm package
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ffmpegStatic = require('ffmpeg-static') as string | null;
    if (typeof ffmpegStatic === 'string' && existsSync(ffmpegStatic)) {
      return ffmpegStatic;
    }
  } catch {
    // Package not installed — fall through
  }

  // Try asar-unpacked path for production builds (passed via workerData if available)
  const { ffmpegPath } = workerData as WorkerInput & { ffmpegPath?: string };
  if (ffmpegPath && existsSync(ffmpegPath)) {
    return ffmpegPath;
  }

  return process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
}

/**
 * Validate segment files before concatenation
 */
async function validateSegments(segments: string[]): Promise<{ valid: boolean; invalidSegments: string[] }> {
  const invalidSegments: string[] = [];

  for (const segment of segments) {
    try {
      const buffer = readFileSync(segment);
      if (buffer.length === 0) {
        invalidSegments.push(segment);
        continue;
      }

      // Verify the file is not corrupted by checking if it's a valid TS/M4S file
      const header = buffer.slice(0, 8);
      const isValidTs = header[0] === 0x47; // TS sync byte
      const isValidM4s = buffer.toString('ascii', 4, 8) === 'ftyp'; // M4S box type

      if (!isValidTs && !isValidM4s) {
        invalidSegments.push(segment);
      }
    } catch {
      invalidSegments.push(segment);
    }
  }

  return {
    valid: invalidSegments.length === 0,
    invalidSegments,
  };
}

/**
 * Wrap an async function with timeout and retry logic
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = MAX_RETRIES,
  timeout = TIMEOUT_MS,
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      // Add timeout to the operation
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Operation timed out after ${timeout}ms`)), timeout),
        ),
      ]);
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < retries - 1) {
        // Wait before retry with exponential backoff
        await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
      }
    }
  }

  throw lastError || new Error('Operation failed after retries');
}

// fluent-ffmpeg is a CommonJS module; dynamic import() may wrap it in a `.default`.
// We need the callable factory function and the static setFfmpegPath method.
type FfmpegFactory = import('fluent-ffmpeg').FfmpegCommand & {
  setFfmpegPath(path: string): void;
};
type FfmpegModule = {
  default?: FfmpegFactory;
} & FfmpegFactory;

function getFactory(mod: FfmpegModule): FfmpegFactory {
  return (mod.default ?? mod) as FfmpegFactory;
}

/**
 * Attempt stream-copy concatenation (fastest, lossless).
 */
async function tryCopyConcat(
  factory: FfmpegFactory,
  concatFile: string,
  outputPath: string,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let lastPct = 0;

    (factory as unknown as () => import('fluent-ffmpeg').FfmpegCommand)()
      .input(concatFile)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .outputOptions([
        '-c', 'copy',
        '-movflags', '+faststart',
      ])
      .output(outputPath)
      .on('progress', (progress: { percent?: number }) => {
        const pct = Math.min(99, Math.round(progress.percent ?? 0));
        if (pct > lastPct) {
          lastPct = pct;
          post({ type: 'progress', percent: pct });
        }
      })
      .on('end', () => resolve())
      .on('error', (err: Error) => reject(err))
      .run();
  });
}

/**
 * Transcode fallback with H.264 + AAC.
 * Used when stream copy fails (codec incompatibilities, mixed segment formats).
 */
async function tryTranscodeConcat(
  factory: FfmpegFactory,
  concatFile: string,
  outputPath: string,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let lastPct = 0;

    (factory as unknown as () => import('fluent-ffmpeg').FfmpegCommand)()
      .input(concatFile)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .outputOptions([
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '20',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
      ])
      .output(outputPath)
      .on('progress', (progress: { percent?: number }) => {
        const pct = Math.min(99, Math.round(progress.percent ?? 0));
        if (pct > lastPct) {
          lastPct = pct;
          post({ type: 'progress', percent: pct });
        }
      })
      .on('end', () => resolve())
      .on('error', (err: Error) => reject(err))
      .run();
  });
}

async function run(): Promise<void> {
  try {
    const { segments, outputPath } = workerData as WorkerInput;

    if (!Array.isArray(segments) || segments.length === 0) {
      throw new Error('No segments provided for reconstitution.');
    }

    // Validate segments before processing
    post({ type: 'progress', percent: 1 });
    const validation = await validateSegments(segments);
    if (!validation.valid) {
      throw new Error(`Segment validation failed: ${validation.invalidSegments.length} invalid segments`);
    }

    const ffmpegPath = resolveFfmpegBinary();
    const raw = await import('fluent-ffmpeg') as unknown as FfmpegModule;
    const factory = getFactory(raw);
    factory.setFfmpegPath(ffmpegPath);

    const concatFile = await createConcatFile(segments);

    post({ type: 'progress', percent: 5 });

    // Use retry logic with timeout for FFmpeg operations
    try {
      await withRetry(() => tryCopyConcat(factory, concatFile, outputPath));
    } catch (copyError) {
      // Stream copy failed — likely mixed codecs or corrupted headers.
      // Erase any partial output and retry with full transcode.
      await unlink(outputPath).catch(() => {});
      post({ type: 'progress', percent: 15 });
      
      try {
        await withRetry(() => tryTranscodeConcat(factory, concatFile, outputPath));
      } catch (transcodeError) {
        // Both attempts failed
        throw new Error(
          `FFmpeg failed: copy (${copyError instanceof Error ? copyError.message : 'unknown'}) and transcode (${transcodeError instanceof Error ? transcodeError.message : 'unknown'})`
        );
      }
    }

    await unlink(concatFile).catch(() => {});

    post({ type: 'progress', percent: 100 });
    post({ type: 'done', success: true });
  } catch (error) {
    post({
      type: 'done',
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

run();
