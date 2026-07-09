import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const MOCK_TEMP_DIR = join(tmpdir(), 'tan-test-temp');
const MOCK_DOWNLOADS_DIR = join(tmpdir(), 'tan-test-downloads');

// Mock electron before importing the module under test
vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'downloads') return MOCK_DOWNLOADS_DIR;
      if (name === 'temp') return MOCK_TEMP_DIR;
      return tmpdir();
    },
    isPackaged: false,
    getAppPath: () => tmpdir(),
  },
}));

// Mock worker_threads so the Worker constructor fires a done message
vi.mock('node:worker_threads', () => {
  const EventEmitter = require('node:events');
  return {
    Worker: class MockWorker extends EventEmitter {
      constructor(_scriptPath: string, _opts?: unknown) {
        super();
        // Simulate worker completing successfully on next tick
        process.nextTick(() => {
          this.emit('message', { type: 'done', success: true });
          this.emit('exit', 0);
        });
      }
    },
  };
});

const { StreamReconstitutionEngine, createConcatFile } = await import('../src/main/stream-reconstitution');
import type { ReconstitutionEvent } from '../src/main/stream-reconstitution';

const FIXTURE_DIR = join(tmpdir(), 'tan-test-reconstitution');

function makeTsFile(dir: string, name: string, content?: Buffer): string {
  const filePath = join(dir, name);
  const data = content ?? Buffer.concat([Buffer.from([0x47]), Buffer.alloc(187, 0)]);
  writeFileSync(filePath, data);
  return filePath;
}

describe('stream-reconstitution', () => {
  beforeEach(() => {
    mkdirSync(FIXTURE_DIR, { recursive: true });
    mkdirSync(MOCK_TEMP_DIR, { recursive: true });
    mkdirSync(MOCK_DOWNLOADS_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(FIXTURE_DIR)) rmSync(FIXTURE_DIR, { recursive: true, force: true });
    if (existsSync(MOCK_TEMP_DIR)) rmSync(MOCK_TEMP_DIR, { recursive: true, force: true });
    if (existsSync(MOCK_DOWNLOADS_DIR)) rmSync(MOCK_DOWNLOADS_DIR, { recursive: true, force: true });
  });

  describe('createConcatFile', () => {
    it('creates a concat file with correct format', async () => {
      const seg1 = makeTsFile(FIXTURE_DIR, 'seg0.ts');
      const seg2 = makeTsFile(FIXTURE_DIR, 'seg1.ts');
      const concatPath = await createConcatFile([seg1, seg2]);

      expect(existsSync(concatPath)).toBe(true);
      const content = readFileSync(concatPath, 'utf8');
      expect(content).toContain("file '");
      expect(content).toContain('seg0.ts');
      expect(content).toContain('seg1.ts');
      const lines = content.split('\n');
      expect(lines).toHaveLength(2);

      if (existsSync(concatPath)) rmSync(concatPath);
    });

    it('escapes single quotes in file paths', async () => {
      const weirdName = "it's a file.ts";
      makeTsFile(FIXTURE_DIR, weirdName);
      const weirdPath = join(FIXTURE_DIR, weirdName);

      const concatPath = await createConcatFile([weirdPath]);
      const content = readFileSync(concatPath, 'utf8');
      expect(content).toContain("'\\''");

      if (existsSync(concatPath)) rmSync(concatPath);
    });

    it('normalizes backslashes to forward slashes', async () => {
      const seg = makeTsFile(FIXTURE_DIR, 'seg0.ts');
      const concatPath = await createConcatFile([seg]);
      const content = readFileSync(concatPath, 'utf8');
      const lines = content.split('\n');
      for (const line of lines) {
        if (line.startsWith('file ')) {
          const pathPart = line.slice(6, -1);
          expect(pathPart).not.toMatch(/\\/);
        }
      }

      if (existsSync(concatPath)) rmSync(concatPath);
    });
  });

  describe('StreamReconstitutionEngine', () => {
    it('registers .ts segment files', () => {
      const events: ReconstitutionEvent[] = [];
      const engine = new StreamReconstitutionEngine((e) => events.push(e));

      const seg1 = makeTsFile(FIXTURE_DIR, 'stream_001.ts');
      const seg2 = makeTsFile(FIXTURE_DIR, 'stream_002.ts');

      engine.registerSegment(seg1);
      engine.registerSegment(seg2);
      expect(events).toHaveLength(0);
    });

    it('ignores non-segment file extensions', () => {
      const events: ReconstitutionEvent[] = [];
      const engine = new StreamReconstitutionEngine((e) => events.push(e));

      engine.registerSegment(makeTsFile(FIXTURE_DIR, 'readme.txt', Buffer.from('hello')));
      engine.registerSegment(makeTsFile(FIXTURE_DIR, 'notes.md', Buffer.from('# notes')));
      expect(events).toHaveLength(0);
    });

    it('accepts .m4s segment files', () => {
      const events: ReconstitutionEvent[] = [];
      const engine = new StreamReconstitutionEngine((e) => events.push(e));

      const m4s = join(FIXTURE_DIR, 'seg0.m4s');
      const ftypHeader = Buffer.alloc(20, 0);
      ftypHeader.writeUInt32BE(20, 0);
      ftypHeader.write('ftyp', 4, 'ascii');
      writeFileSync(m4s, ftypHeader);

      engine.registerSegment(m4s);
      expect(events).toHaveLength(0);
    });

    it('routes audio segments to audioSegments array', () => {
      const events: ReconstitutionEvent[] = [];
      const engine = new StreamReconstitutionEngine((e) => events.push(e));

      const audioSeg = makeTsFile(FIXTURE_DIR, 'audio_001.ts');
      const videoSeg = makeTsFile(FIXTURE_DIR, 'video_001.ts');

      engine.registerSegment(audioSeg);
      engine.registerSegment(videoSeg);
      expect(events).toHaveLength(0);
    });

    it('handles various audio filename patterns', () => {
      const events: ReconstitutionEvent[] = [];
      const engine = new StreamReconstitutionEngine((e) => events.push(e));

      const patterns = [
        'audio_001.ts',
        'seg_a1.ts',
        'audioonly.ts',
        'track.aac.ts',
        'music.mp3.ts',
      ];

      for (const name of patterns) {
        engine.registerSegment(makeTsFile(FIXTURE_DIR, name));
      }
      expect(events).toHaveLength(0);
    });

    it('setEndpoint and clearEndpoint do not throw', () => {
      const engine = new StreamReconstitutionEngine(() => {});
      engine.setEndpoint('https://example.com/api');
      engine.clearEndpoint();
    });

    it('start/stop lifecycle is idempotent', () => {
      const engine = new StreamReconstitutionEngine(() => {});
      engine.start();
      engine.start();
      engine.stop();
      engine.stop();
    });

    it('flushAll reconstitutes pending streams', async () => {
      const events: ReconstitutionEvent[] = [];
      const engine = new StreamReconstitutionEngine((e) => events.push(e));

      engine.registerSegment(makeTsFile(FIXTURE_DIR, 'stream_001.ts'));

      await engine.flushAll();
      // The mocked Worker fires a 'done' success message, so reconstitute completes
      expect(events).toHaveLength(1);
      expect(events[0].segments).toBe(1);
    });
  });
});
