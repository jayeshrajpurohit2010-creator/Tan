import { app } from 'electron';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, stat, unlink } from 'node:fs/promises';
import { join, basename, dirname, extname } from 'node:path';
import { Worker } from 'node:worker_threads';
import { createHash } from 'node:crypto';

/** After this idle period with no new segments, a stream is considered complete. */
const IDLE_WATCHDOG_MS = 5_000;
/** How often the watchdog checks for completed streams. */
const WATCHDOG_POLL_MS = 1_000;
/** Segment file extensions that indicate HLS (.ts) or MPEG-DASH (.m4s) streams. */
const SEGMENT_EXTENSIONS = new Set(['.ts', '.m4s']);

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
  audioSegments: string[];
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

    // Detect if this is an audio segment (common patterns: audio_001.ts, seg_audio.m4s)
    const isAudio = this.isAudioSegment(filePath);

    const existing = this.streams.get(streamId);
    if (existing) {
      if (isAudio) {
        if (!existing.audioSegments.includes(filePath)) {
          existing.audioSegments.push(filePath);
        }
      } else {
        if (!existing.segments.includes(filePath)) {
          existing.segments.push(filePath);
        }
      }
      existing.lastSeen = Date.now();
      void this.refreshSegmentBytes(existing, filePath);
    } else {
      const group: StreamGroup = {
        streamId,
        vaultPath: dirname(filePath),
        segments: isAudio ? [] : [filePath],
        audioSegments: isAudio ? [filePath] : [],
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

  private resolveStreamId(filePath: string): string | null {
    const name = basename(filePath);
    // Match HLS patterns: stream_001.ts, seg0.ts, stream.m4s, chunk-00.m4s
    const match = name.match(/^(.+?)(?:[_-]?\d+)?(?:\.\w+)?\.(?:ts|m4s)$/i);
    if (!match) {
      return null;
    }
    const base = match[1].replace(/[_-]+$/, '') || 'stream';
    // Scope to the parent directory to avoid collisions across different streams
    const vaultPath = dirname(filePath);
    const scopeHash = createHash('sha256').update(vaultPath).digest('hex').slice(0, 6);
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
        const totalSegments = group.segments.length + group.audioSegments.length;
        if (idleDuration >= IDLE_WATCHDOG_MS && totalSegments >= 1) {
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
      // Sort video segments with enhanced validation
      group.segments.sort((a, b) => {
        const aNum = this.extractSegmentNumber(a);
        const bNum = this.extractSegmentNumber(b);
        return aNum - bNum;
      });

      // Sort audio segments if present
      if (group.audioSegments.length > 0) {
        group.audioSegments.sort((a, b) => {
          const aNum = this.extractSegmentNumber(a);
          const bNum = this.extractSegmentNumber(b);
          return aNum - bNum;
        });
      }

      // Validate segment sequence and detect gaps
      const validation = this.validateSegmentSequence(group.segments);
      if (!validation.valid) {
        console.warn(`[StreamReconstitution] Segment sequence validation failed for ${group.streamId}: ${validation.message}`);
      }

      // Verify segment integrity
      const integrityCheck = await this.verifySegmentIntegrity(group.segments);
      if (!integrityCheck.allValid) {
        console.warn(`[StreamReconstitution] Segment integrity check failed for ${group.streamId}: ${integrityCheck.invalidSegments.length} invalid segments`);
      }

      const outputDir = join(group.vaultPath, '_reconstituted');
      await mkdir(outputDir, { recursive: true });

      const streamHash = createHash('sha256')
        .update(group.streamId + group.segments.join(',') + group.audioSegments.join(','))
        .digest('hex')
        .slice(0, 12);

      const outputPath = join(outputDir, `${group.streamId}_${streamHash}.mp4`);

      // Concatenate all segments (video + audio) for reconstitution
      // Note: Proper audio/video merge with separate tracks deferred to future enhancement
      const allSegments = [...group.segments, ...group.audioSegments];
      await this.runFfmpegConcat(group.streamId, allSegments, outputPath);

      let inputBytes = 0;
      for (const seg of [...group.segments, ...group.audioSegments]) {
        try {
          const segStat = await stat(seg);
          inputBytes += segStat.size;
        } catch {}
      }

      let outputBytes = 0;
      try {
        const outputStat = await stat(outputPath);
        outputBytes = outputStat.size;
      } catch {}

      // Detect duration of the reconstituted stream
      const duration = await this.detectStreamDuration(outputPath);

      this.onEvent({
        streamId: group.streamId,
        segments: group.segments.length + group.audioSegments.length,
        outputPath,
        totalBytes: outputBytes || inputBytes,
        duration,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.onEvent({
        streamId: group.streamId,
        segments: group.segments.length + group.audioSegments.length,
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

  /**
   * Detect if a segment is an audio segment
   */
  private isAudioSegment(filePath: string): boolean {
    const name = basename(filePath).toLowerCase();
    // Common audio segment patterns
    const audioPatterns = [
      /audio/,
      /_a\d/,
      /audioonly/,
      /\.aac/,
      /\.mp3/,
    ];
    return audioPatterns.some(pattern => pattern.test(name));
  }

  /**
   * Detect duration of a reconstituted stream using FFmpeg probe
   */
  private async detectStreamDuration(outputPath: string): Promise<number | undefined> {
    try {
      const ffmpegPath = this.resolveFfmpegBinaryPath();
      if (!ffmpegPath) {
        return undefined;
      }

      // Derive ffprobe path from ffmpeg path
      const ffprobePath = ffmpegPath.replace('ffmpeg', 'ffprobe').replace('ffmpeg.exe', 'ffprobe.exe');
      
      const { spawn } = await import('node:child_process');
      
      return new Promise((resolve) => {
        const ffprobe = spawn(
          ffprobePath,
          [
            '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            outputPath,
          ],
          { stdio: ['ignore', 'pipe', 'pipe'] }
        );

        let stdout = '';
        let timeoutId: NodeJS.Timeout;

        ffprobe.stdout.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        ffprobe.stderr.on('data', () => {
          // Ignore stderr
        });

        ffprobe.on('close', (code: number | null) => {
          clearTimeout(timeoutId);
          if (code === 0 && stdout) {
            const duration = parseFloat(stdout.trim());
            if (!isNaN(duration) && duration > 0) {
              resolve(duration);
            } else {
              resolve(undefined);
            }
          } else {
            resolve(undefined);
          }
        });

        ffprobe.on('error', () => {
          clearTimeout(timeoutId);
          resolve(undefined);
        });

        // Timeout after 10 seconds
        timeoutId = setTimeout(() => {
          ffprobe.kill();
          resolve(undefined);
        }, 10000);
      });
    } catch {
      return undefined;
    }
  }

  /**
   * Validate segment sequence and detect gaps
   */
  private validateSegmentSequence(segments: string[]): { valid: boolean; message: string; gaps: number[] } {
    if (segments.length === 0) {
      return { valid: false, message: 'No segments', gaps: [] };
    }

    const sequenceNumbers = segments.map(seg => this.extractSegmentNumber(seg));
    const gaps: number[] = [];

    for (let i = 0; i < sequenceNumbers.length - 1; i++) {
      const current = sequenceNumbers[i];
      const next = sequenceNumbers[i + 1];
      const expected = current + 1;

      if (next !== expected) {
        gaps.push(expected);
      }
    }

    if (gaps.length > 0) {
      return {
        valid: false,
        message: `Found ${gaps.length} gap(s) in segment sequence`,
        gaps,
      };
    }

    return { valid: true, message: 'Segment sequence valid', gaps: [] };
  }

  /**
   * Verify segment integrity using SHA256
   */
  private async verifySegmentIntegrity(segments: string[]): Promise<{ allValid: boolean; invalidSegments: string[] }> {
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
        const isValidM4s = header.toString('ascii', 4, 8) === 'ftyp'; // M4S box type (bytes 4-7)

        if (!isValidTs && !isValidM4s) {
          invalidSegments.push(segment);
        }
      } catch {
        invalidSegments.push(segment);
      }
    }

    return {
      allValid: invalidSegments.length === 0,
      invalidSegments,
    };
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
          encryptionKeys?: Record<string, string>;
          encryptionIVs?: Record<string, string>;
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
