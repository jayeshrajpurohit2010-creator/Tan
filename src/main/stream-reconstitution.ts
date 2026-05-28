import { app } from 'electron';
import { existsSync } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { join, basename, dirname, extname } from 'node:path';
import { Worker } from 'node:worker_threads';
import { createHash } from 'node:crypto';

const STREAM_WINDOW_MS = 30_000;
const RECONSTITUTION_INTERVAL_MS = 10_000;

export type ReconstitutionEvent = {
  streamId: string;
  segments: number;
  outputPath: string;
  totalBytes: number;
  duration?: number;
  error?: string;
  timestamp: string;
};

export type StreamGroup = {
  streamId: string;
  vaultPath: string;
  segments: string[];
  firstSeen: number;
  lastSeen: number;
  totalBytes: number;
};

export class StreamReconstitutionEngine {
  private streams = new Map<string, StreamGroup>();
  private vaultRoot: string;
  private timer: NodeJS.Timeout | undefined;
  private onEvent: (event: ReconstitutionEvent) => void;
  private activeEndpoint: string | undefined;

  constructor(onEvent: (event: ReconstitutionEvent) => void) {
    this.vaultRoot = join(app.getPath('downloads'), 'Tan');
    this.onEvent = onEvent;
  }

  setEndpoint(endpointUrl: string): void {
    this.activeEndpoint = endpointUrl;
  }

  clearEndpoint(): void {
    this.activeEndpoint = undefined;
  }

  registerSegment(filePath: string): void {
    if (extname(filePath).toLowerCase() !== '.ts') {
      return;
    }

    const streamId = this.resolveStreamId(filePath);
    if (!streamId) {
      return;
    }

    const existing = this.streams.get(streamId);
    if (existing) {
      existing.segments.push(filePath);
      existing.lastSeen = Date.now();
      existing.totalBytes += 0;
    } else {
      this.streams.set(streamId, {
        streamId,
        vaultPath: dirname(filePath),
        segments: [filePath],
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        totalBytes: 0,
      });
    }
  }

  start(): void {
    this.timer = setInterval(() => this.processStreams(), RECONSTITUTION_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async flushAll(): Promise<void> {
    const pending = Array.from(this.streams.values());
    this.streams.clear();
    for (const group of pending) {
      await this.reconstitute(group);
    }
  }

  private resolveStreamId(filePath: string): string | null {
    const name = basename(filePath);
    const match = name.match(/^(.+?)(?:_\d+)?\.ts$/);
    if (!match) {
      return null;
    }
    return match[1];
  }

  private async processStreams(): Promise<void> {
    const now = Date.now();
    const ready: string[] = [];

    for (const [streamId, group] of this.streams) {
      if (now - group.lastSeen > STREAM_WINDOW_MS && group.segments.length >= 2) {
        ready.push(streamId);
      }
    }

    for (const streamId of ready) {
      const group = this.streams.get(streamId);
      if (!group) {
        continue;
      }
      this.streams.delete(streamId);
      await this.reconstitute(group);
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

      await this.runFfmpegConcat(group.segments, outputPath);

      let totalBytes = 0;
      for (const seg of group.segments) {
        try {
          const segStat = await stat(seg);
          totalBytes += segStat.size;
        } catch {}
      }

      const event: ReconstitutionEvent = {
        streamId: group.streamId,
        segments: group.segments.length,
        outputPath,
        totalBytes,
        timestamp: new Date().toISOString(),
      };

      this.onEvent(event);
    } catch (error) {
      this.onEvent({
        streamId: group.streamId,
        segments: group.segments.length,
        outputPath: '',
        totalBytes: 0,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      });
    }
  }

  private extractSegmentNumber(filePath: string): number {
    const name = basename(filePath);
    const match = name.match(/_(\d+)\.ts$/);
    if (match) {
      return parseInt(match[1], 10);
    }
    const nMatch = name.match(/(\d+)\.ts$/);
    if (nMatch) {
      return parseInt(nMatch[1], 10);
    }
    return 0;
  }

  private resolveWorkerPath(): string {
    const candidates = [
      join(__dirname, 'ffmpegWorker.js'),
      join(__dirname, 'ffmpegWorker.ts'),
      join(__dirname, '../main/ffmpegWorker.js'),
      join(__dirname, '../main/ffmpegWorker.ts'),
    ];
    for (const p of candidates) {
      if (existsSync(p)) return p;
    }
    return join(__dirname, 'ffmpegWorker.js');
  }

  private async runFfmpegConcat(segments: string[], outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const workerPath = this.resolveWorkerPath();
        const worker = new Worker(workerPath, {
          workerData: { segments, outputPath },
        });
        worker.on('message', (msg: { success: boolean; error?: string }) => {
          if (msg.success) {
            resolve();
          } else {
            reject(new Error(msg.error ?? 'FFmpeg worker failed'));
          }
        });
        worker.on('error', reject);
        worker.on('exit', (code) => {
          if (code !== 0) {
            reject(new Error(`FFmpeg worker exited with code ${code}`));
          } else {
            resolve();
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }
}

export async function createConcatFile(segments: string[]): Promise<string> {
  const lines = segments.map((s) => `file '${s.replace(/'/g, "'\\''")}'`);
  const content = lines.join('\n');
  const hash = createHash('md5').update(content).digest('hex').slice(0, 8);
  const concatPath = join(app.getPath('temp'), `tan_concat_${hash}.txt`);
  const { writeFile } = await import('node:fs/promises');
  await writeFile(concatPath, content, 'utf8');
  return concatPath;
}
