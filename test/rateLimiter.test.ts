import { describe, expect, it, vi, afterEach } from 'vitest';
import { RateLimiter, CDP_RATE_LIMITER, STEALTH_INJECT_LIMITER, CAPTURE_RATE_LIMITER } from '../src/main/rateLimiter';

describe('RateLimiter', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('1. tryAcquire allows requests within limit', () => {
    const limiter = new RateLimiter({ maxRequests: 3, windowMs: 1000 });

    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(true);
  });

  it('2. tryAcquire rejects when limit exceeded', () => {
    const limiter = new RateLimiter({ maxRequests: 2, windowMs: 1000 });

    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(false);
  });

  it('3. Window expiration allows new requests', async () => {
    vi.useFakeTimers();
    const limiter = new RateLimiter({ maxRequests: 1, windowMs: 100 });

    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(false);

    vi.advanceTimersByTime(101);

    expect(limiter.tryAcquire()).toBe(true);
  });

  it('4. waitUntilReady resolves when slot opens', async () => {
    vi.useFakeTimers();
    const limiter = new RateLimiter({ maxRequests: 1, windowMs: 100 });

    limiter.tryAcquire();

    let resolved = false;
    const promise = limiter.waitUntilReady().then(() => { resolved = true; });

    vi.advanceTimersByTime(150);
    await promise;

    expect(resolved).toBe(true);
  });

  it('5. currentRate tracks active requests', () => {
    const limiter = new RateLimiter({ maxRequests: 5, windowMs: 1000 });

    expect(limiter.currentRate).toBe(0);
    limiter.tryAcquire();
    limiter.tryAcquire();
    expect(limiter.currentRate).toBe(2);
  });

  it('6. remaining returns correct count', () => {
    const limiter = new RateLimiter({ maxRequests: 3, windowMs: 1000 });

    expect(limiter.remaining).toBe(3);
    limiter.tryAcquire();
    expect(limiter.remaining).toBe(2);
  });

  it('7. reset clears all timestamps', () => {
    const limiter = new RateLimiter({ maxRequests: 2, windowMs: 1000 });

    limiter.tryAcquire();
    limiter.tryAcquire();
    expect(limiter.tryAcquire()).toBe(false);

    limiter.reset();
    expect(limiter.tryAcquire()).toBe(true);
  });

  it('8. CDP_RATE_LIMITER is defined with correct config', () => {
    expect(CDP_RATE_LIMITER).toBeInstanceOf(RateLimiter);
    expect(CDP_RATE_LIMITER.remaining).toBe(30);
  });

  it('9. STEALTH_INJECT_LIMITER is defined with correct config', () => {
    expect(STEALTH_INJECT_LIMITER).toBeInstanceOf(RateLimiter);
    expect(STEALTH_INJECT_LIMITER.remaining).toBe(5);
  });

  it('10. CAPTURE_RATE_LIMITER is defined with correct config', () => {
    expect(CAPTURE_RATE_LIMITER).toBeInstanceOf(RateLimiter);
    expect(CAPTURE_RATE_LIMITER.remaining).toBe(50);
  });
});
