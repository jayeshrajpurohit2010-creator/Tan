export type QueueSnapshot = {
  depth: number;
  active: boolean;
};

export class NoDropWriteQueue {
  private readonly queue: Array<() => Promise<void>> = [];
  private processing = false;
  private idleResolvers: Array<() => void> = [];

  constructor(private readonly onChange?: (snapshot: QueueSnapshot) => void) {}

  get depth(): number {
    return this.queue.length + (this.processing ? 1 : 0);
  }

  enqueue(task: () => Promise<void>): void {
    this.queue.push(task);
    this.emitChange();
    void this.process();
  }

  async flush(): Promise<void> {
    if (this.depth === 0) {
      return;
    }

    await new Promise<void>((resolve) => {
      this.idleResolvers.push(resolve);
    });
  }

  private async process(): Promise<void> {
    if (this.processing) {
      return;
    }

    this.processing = true;
    this.emitChange();

    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (!task) {
        continue;
      }

      try {
        await task();
      } catch {
        // Individual persistence tasks are responsible for manifesting errors.
      } finally {
        this.emitChange();
      }
    }

    this.processing = false;
    this.emitChange();
    const resolvers = this.idleResolvers.splice(0);
    for (const resolve of resolvers) {
      resolve();
    }
  }

  private emitChange(): void {
    this.onChange?.({ depth: this.depth, active: this.processing });
  }
}
