/**
 * FFmpeg reconstitution worker — runs in a Node.js worker_thread.
 * Must NOT import anything that touches Electron APIs (app, BrowserWindow, etc.)
 * because worker_threads run in an isolated context without access to the main
 * Electron process.
 */
import { parentPort, workerData } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import { writeFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

interface WorkerInput {
  segments: string[];
  outputPath: string;
}

type WorkerMessage =
  | { type: 'progress'; percent: number }
  | { type: 'done'; success: true }
  | { type: 'done'; success: false; error: string };

function post(msg: WorkerMessage): void {
  parentPort?.postMessage(msg);
}

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

    const ffmpegPath = resolveFfmpegBinary();
    const raw = await import('fluent-ffmpeg') as unknown as FfmpegModule;
    const factory = getFactory(raw);
    factory.setFfmpegPath(ffmpegPath);

    const concatFile = await createConcatFile(segments);

    post({ type: 'progress', percent: 1 });

    try {
      await tryCopyConcat(factory, concatFile, outputPath);
    } catch {
      // Stream copy failed — likely mixed codecs or corrupted headers.
      // Erase any partial output and retry with full transcode.
      await unlink(outputPath).catch(() => {});
      post({ type: 'progress', percent: 10 });
      await tryTranscodeConcat(factory, concatFile, outputPath);
    }

    await unlink(concatFile).catch(() => {});

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
