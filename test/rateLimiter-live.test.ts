import { describe, it, expect } from 'vitest';
import { RateLimiter } from '../src/main/rateLimiter';

describe('RateLimiter Live Demo', () => {
  it('acquires slots up to limit, denies when full, and re-acquires after window expires', async () => {
    const limiter = new RateLimiter({ maxRequests: 3, windowMs: 500 });

    expect(limiter.remaining).toBe(3);
    expect(limiter.currentRate).toBe(0);

    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.remaining).toBe(0);
    expect(limiter.currentRate).toBe(3);

    expect(limiter.tryAcquire()).toBe(false);

    await new Promise(r => setTimeout(r, 550));

    expect(limiter.remaining).toBe(3);
    expect(limiter.tryAcquire()).toBe(true);
  });

  it('waitUntilReady blocks then resolves when window expires', async () => {
    const limiter = new RateLimiter({ maxRequests: 2, windowMs: 300 });

    limiter.tryAcquire();
    limiter.tryAcquire();

    const start = Date.now();
    await limiter.waitUntilReady();
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(280);
    expect(limiter.tryAcquire()).toBe(true);
  });

  it('burst throttles correctly over time', async () => {
    const limiter = new RateLimiter({ maxRequests: 3, windowMs: 1000 });
    const timestamps: number[] = [];
    const start = Date.now();

    for (let i = 0; i < 7; i++) {
      await limiter.waitUntilReady();
      limiter.tryAcquire();
      timestamps.push(Date.now() - start);
    }

    expect(timestamps[0]).toBeLessThan(100);
    expect(timestamps[3]).toBeGreaterThanOrEqual(900);
    expect(timestamps[6]).toBeGreaterThanOrEqual(1800);
  });

  it('reset clears all state', () => {
    const limiter = new RateLimiter({ maxRequests: 1, windowMs: 60000 });

    limiter.tryAcquire();
    expect(limiter.tryAcquire()).toBe(false);
    expect(limiter.remaining).toBe(0);

    limiter.reset();
    expect(limiter.remaining).toBe(1);
    expect(limiter.currentRate).toBe(0);
    expect(limiter.tryAcquire()).toBe(true);
  });
});
