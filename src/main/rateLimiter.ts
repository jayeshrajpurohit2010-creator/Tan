type RateLimiterOptions = {
  maxRequests: number;
  windowMs: number;
};

export class RateLimiter {
  private timestamps: number[] = [];
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(options: RateLimiterOptions) {
    this.maxRequests = options.maxRequests;
    this.windowMs = options.windowMs;
  }

  tryAcquire(): boolean {
    const now = Date.now();
    this.timestamps = this.timestamps.filter(t => now - t < this.windowMs);

    if (this.timestamps.length >= this.maxRequests) {
      return false;
    }

    this.timestamps.push(now);
    return true;
  }

  async waitUntilReady(): Promise<void> {
    while (!this.tryAcquire()) {
      const oldest = this.timestamps[0];
      const waitMs = this.windowMs - (Date.now() - oldest) + 10;
      await new Promise(resolve => setTimeout(resolve, Math.max(waitMs, 50)));
    }
  }

  get currentRate(): number {
    const now = Date.now();
    return this.timestamps.filter(t => now - t < this.windowMs).length;
  }

  get remaining(): number {
    const now = Date.now();
    const active = this.timestamps.filter(t => now - t < this.windowMs).length;
    return Math.max(0, this.maxRequests - active);
  }

  reset(): void {
    this.timestamps = [];
  }
}

export const CDP_RATE_LIMITER = new RateLimiter({
  maxRequests: 30,
  windowMs: 1000,
});

export const STEALTH_INJECT_LIMITER = new RateLimiter({
  maxRequests: 5,
  windowMs: 1000,
});

export const CAPTURE_RATE_LIMITER = new RateLimiter({
  maxRequests: 50,
  windowMs: 1000,
});
