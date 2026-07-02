import { describe, expect, it } from 'vitest';
import {
  generateMousePath,
  generateScrollSequence,
  generateKeystrokeTimings,
  generateInteractionSequence,
  DEFAULT_HLI_CONFIG,
} from '../src/main/hli-engine';

describe('hli-engine', () => {
  it('1. generateMousePath produces points from start to end', () => {
    const points = generateMousePath(100, 100, 400, 300);
    expect(points.length).toBeGreaterThan(2);
    expect(points[0].x).toBeCloseTo(100, 0);
    expect(points[0].y).toBeCloseTo(100, 0);
    const last = points[points.length - 1];
    expect(last.x).toBeCloseTo(400, -1);
    expect(last.y).toBeCloseTo(300, -1);
  });

  it('2. Mouse path timestamps are monotonically increasing', () => {
    const points = generateMousePath(0, 0, 500, 500);
    for (let i = 1; i < points.length; i++) {
      expect(points[i].timestamp).toBeGreaterThanOrEqual(points[i - 1].timestamp);
    }
  });

  it('3. Mouse path adds jitter for realism', () => {
    const path1 = generateMousePath(0, 0, 200, 200);
    const path2 = generateMousePath(0, 0, 200, 200);
    // With jitter, paths should differ slightly
    const mid1 = path1[Math.floor(path1.length / 2)];
    const mid2 = path2[Math.floor(path2.length / 2)];
    const differs = mid1.x !== mid2.x || mid1.y !== mid2.y;
    expect(differs).toBe(true);
  });

  it('4. generateScrollSequence produces scroll events', () => {
    const events = generateScrollSequence(0, 500);
    expect(events.length).toBeGreaterThan(0);
    const totalDelta = events.reduce((sum, e) => sum + Math.abs(e.deltaY), 0);
    expect(totalDelta).toBeGreaterThanOrEqual(500);
  });

  it('5. Scroll delays are positive', () => {
    const events = generateScrollSequence(0, 300);
    for (const event of events) {
      expect(event.delay).toBeGreaterThan(0);
    }
  });

  it('6. generateKeystrokeTimings produces correct count', () => {
    const text = 'hello';
    const timings = generateKeystrokeTimings(text);
    expect(timings.length).toBe(5);
  });

  it('7. Keystroke timings are positive', () => {
    const timings = generateKeystrokeTimings('test message');
    for (const t of timings) {
      expect(t).toBeGreaterThan(0);
    }
  });

  it('8. Keystroke timings vary (not all identical)', () => {
    const timings = generateKeystrokeTimings('abcdef');
    const unique = new Set(timings);
    expect(unique.size).toBeGreaterThan(1);
  });

  it('9. generateInteractionSequence returns all components', () => {
    const result = generateInteractionSequence(393, 852);
    expect(result.mousePath.length).toBeGreaterThan(0);
    expect(result.scrollEvents.length).toBeGreaterThan(0);
    expect(result.keystrokeTimings.length).toBeGreaterThan(0);
  });

  it('10. DEFAULT_HLI_CONFIG has reasonable values', () => {
    expect(DEFAULT_HLI_CONFIG.mouseSpeed).toBeGreaterThan(0);
    expect(DEFAULT_HLI_CONFIG.scrollSpeed).toBeGreaterThan(0);
    expect(DEFAULT_HLI_CONFIG.keystrokeInterval).toBeGreaterThan(0);
    expect(DEFAULT_HLI_CONFIG.jitter).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_HLI_CONFIG.jitter).toBeLessThanOrEqual(1);
  });
});
