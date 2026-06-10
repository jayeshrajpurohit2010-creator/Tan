import { app } from 'electron';
import { existsSync } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { join, basename, dirname, extname } from 'node:path';
import { Worker } from 'node:worker_threads';
import { createHash } from 'node:crypto';

/** After this idle period with no new segments, a stream is considered complete. */
const IDLE_WATCHDOG_MS = 5_000;
/** How often the watchdog checks for completed streams. */
const WATCHDOG_POLL_MS = 1_000;
/** Segment file extensions that indicate HLS (.ts) or MPEG-DASH (.m4s / .fmp4) streams. */
const SEGMENT_EXTENSIONS = new Set(['.ts', '.m4s', '.fmp4']);

export type ReconstitutionEvent = {
  streamId: string;
  segments: number;
  outputPath: string;
  totalBytes: number;
  duration?: number;
  error?: string;
  timestamp: string;
};

export type ReconstitutionProgressEvent = {
  streamId: string;
  percent: number;
  timestamp: string;
};

export type StreamGroup = {
  streamId: string;
  vaultPath: string;
  segments: string[];
  firstSeen: number;
  lastSeen: number;
  totalBytes: number;
  finalizing: boolean;
};

export class StreamReconstitutionEngine {
  private streams = new Map<string, StreamGroup>();
  private vaultRoot: string;
  private timer: NodeJS.Timeout | undefined;
  private onEvent: (event: ReconstitutionEvent) => void;
  private onProgress: ((event: ReconstitutionProgressEvent) => void) | undefined;
  private activeEndpoint: string | undefined;
  private processing = false;

  constructor(
    onEvent: (event: ReconstitutionEvent) => void,
    onProgress?: (event: ReconstitutionProgressEvent) => void,
  ) {
    this.vaultRoot = join(app.getPath('downloads'), 'Tan');
    this.onEvent = onEvent;
    this.onProgress = onProgress;
  }

  setEndpoint(endpointUrl: string): void {
    this.activeEndpoint = endpointUrl;
  }

  clearEndpoint(): void {
    this.activeEndpoint = undefined;
  }

  registerSegment(filePath: string): void {
    const ext = extname(filePath).toLowerCase();
    if (!SEGMENT_EXTENSIONS.has(ext)) {
      return;
    }

    const streamId = this.resolveStreamId(filePath);
    if (!streamId) {
      return;
    }

    const existing = this.streams.get(streamId);
    if (existing) {
      if (!existing.segments.includes(filePath)) {
        existing.segments.push(filePath);
      }
      existing.lastSeen = Date.now();
      void this.refreshSegmentBytes(existing, filePath);
    } else {
      const group: StreamGroup = {
        streamId,
        vaultPath: dirname(filePath),
        segments: [filePath],
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        totalBytes: 0,
        finalizing: false,
      };
      this.streams.set(streamId, group);
      void this.refreshSegmentBytes(group, filePath);
    }
  }

  start(): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      void this.processStreams();
    }, WATCHDOG_POLL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async flushAll(): Promise<void> {
    const pending = Array.from(this.streams.values()).filter((group) => !group.finalizing);
    this.streams.clear();
    for (const group of pending) {
      await this.reconstitute(group);
    }
  }

  private async refreshSegmentBytes(group: StreamGroup, filePath: string): Promise<void> {
    try {
      const segStat = await stat(filePath);
      group.totalBytes += segStat.size;
    } catch {
      // Transient stat failures during segment registration are expected.
    }
  }

  // Cache scope hashes to avoid re-hashing the same vault directory on every segment.
  private readonly scopeHashCache = new Map<string, string>();

  private resolveStreamId(filePath: string): string | null {
    const name = basename(filePath);
    // Match HLS/DASH patterns: stream_001.ts, seg0.ts, stream.m4s, chunk-00.m4s, init.fmp4
    const match = name.match(/^(.+?)(?:[_-]?\d+)?(?:\.\w+)?\.(?:ts|m4s|fmp4)$/i);
    if (!match) {
      return null;
    }
    const base = match[1].replace(/[_-]+$/, '') || 'stream';
    // Scope to the parent directory to avoid collisions across different streams
    const vaultPath = dirname(filePath);
    let scopeHash = this.scopeHashCache.get(vaultPath);
    if (!scopeHash) {
      scopeHash = createHash('sha256').update(vaultPath).digest('hex').slice(0, 6);
      this.scopeHashCache.set(vaultPath, scopeHash);
    }
    return `${base}_${scopeHash}`;
  }

  private async processStreams(): Promise<void> {
    if (this.processing) {
      return;
    }

    this.processing = true;
    try {
      const now = Date.now();
      const ready: string[] = [];

      for (const [streamId, group] of this.streams) {
        if (group.finalizing) {
          continue;
        }

        const idleDuration = now - group.lastSeen;
        if (idleDuration >= IDLE_WATCHDOG_MS && group.segments.length >= 1) {
          ready.push(streamId);
        }
      }

      for (const streamId of ready) {
        const group = this.streams.get(streamId);
        if (!group || group.finalizing) {
          continue;
        }
        group.finalizing = true;
        this.streams.delete(streamId);
        // Process sequentially to avoid saturating the CPU with concurrent workers.
        await this.reconstitute(group);
      }
    } finally {
      this.processing = false;
    }
  }

  private async reconstitute(group: StreamGroup): Promise<void> {
    try {
      group.segments.sort((a, b) => {
        const aNum = this.extractSegmentNumber(a);
        const bNum = this.extractSegmentNumber(b);
        return aNum - bNum;
      });

      const outputDir = join(group.vaultPath, '_reconstituted');
      await mkdir(outputDir, { recursive: true });

      const streamHash = createHash('sha256')
        .update(group.streamId + group.segments.join(','))
        .digest('hex')
        .slice(0, 12);

      const outputPath = join(outputDir, `${group.streamId}_${streamHash}.mp4`);

      await this.runFfmpegConcat(group.streamId, group.segments, outputPath);

      // Use the already-accumulated segment byte count rather than re-statting every file.
      let outputBytes = 0;
      try {
        const outputStat = await stat(outputPath);
        outputBytes = outputStat.size;
      } catch {}

      this.onEvent({
        streamId: group.streamId,
        segments: group.segments.length,
        outputPath,
        totalBytes: outputBytes || group.totalBytes,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.onEvent({
        streamId: group.streamId,
        segments: group.segments.length,
        outputPath: '',
        totalBytes: group.totalBytes,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      });
    }
  }

  private extractSegmentNumber(filePath: string): number {
    const name = basename(filePath);
    // Match trailing numbers before extension: seg_003.ts, chunk-007.m4s
    const match = name.match(/[_-]?(\d+)\.[a-z0-9]+$/i);
    if (match) {
      return parseInt(match[1], 10);
    }
    // Fallback: any sequence of digits in the filename
    const digits = name.match(/(\d+)/g);
    if (digits && digits.length > 0) {
      return parseInt(digits[digits.length - 1], 10);
    }
    return 0;
  }

  private resolveWorkerPath(): string {
    const candidates = [
      join(__dirname, 'ffmpegWorker.js'),
      join(__dirname, '../main/ffmpegWorker.js'),
    ];
    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }
    return join(__dirname, 'ffmpegWorker.js');
  }

  private resolveFfmpegBinaryPath(): string | undefined {
    if (app.isPackaged) {
      const bin = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
      const candidate = join(
        process.resourcesPath,
        'app.asar.unpacked',
        'node_modules',
        'ffmpeg-static',
        bin,
      );
      if (existsSync(candidate)) {
        return candidate;
      }
    } else {
      const bin = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
      const candidate = join(app.getAppPath(), 'node_modules', 'ffmpeg-static', bin);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
    return undefined;
  }

  private async runFfmpegConcat(
    streamId: string,
    segments: string[],
    outputPath: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error): void => {
        if (settled) {
          return;
        }
        settled = true;
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };

      try {
        const workerData: {
          segments: string[];
          outputPath: string;
          ffmpegPath?: string;
        } = {
          segments,
          outputPath,
          ffmpegPath: this.resolveFfmpegBinaryPath(),
        };

        const worker = new Worker(this.resolveWorkerPath(), { workerData });

        worker.on('message', (msg: { type: string; percent?: number; success?: boolean; error?: string }) => {
          if (msg.type === 'progress' && typeof msg.percent === 'number') {
            this.onProgress?.({
              streamId,
              percent: msg.percent,
              timestamp: new Date().toISOString(),
            });
          } else if (msg.type === 'done') {
            if (msg.success) {
              finish();
            } else {
              finish(new Error(msg.error ?? 'FFmpeg worker failed'));
            }
          }
        });

        worker.on('error', (error) => finish(error));
        worker.on('exit', (code) => {
          if (!settled && code !== 0) {
            finish(new Error(`FFmpeg worker exited with code ${code}`));
          }
        });
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }
}

/**
 * Create an FFmpeg concat demuxer file listing the given segment paths.
 * Used only from the main process (has access to Electron's app module).
 * The worker has its own inline version that uses os.tmpdir().
 */
export async function createConcatFile(segments: string[]): Promise<string> {
  const lines = segments.map((segment) => {
    const normalized = segment.replace(/\\/g, '/');
    const escaped = normalized.replace(/'/g, "'\\''");
    return `file '${escaped}'`;
  });
  const content = lines.join('\n');
  const hash = createHash('md5').update(content).digest('hex').slice(0, 8);
  const concatPath = join(app.getPath('temp'), `tan_concat_${hash}.txt`);
  const { writeFile } = await import('node:fs/promises');
  await writeFile(concatPath, content, 'utf8');
  return concatPath;
}
