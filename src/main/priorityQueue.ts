/**
 * Priority Queue for Ephemeral Media Handling
 * 
 * Handles time-sensitive Snapchat media (self-destructing content) with higher priority
 * to ensure capture before expiration. Uses a priority queue based on capture priority levels.
 */

export type PriorityTask = {
  id: string;
  priority: number;
  task: () => Promise<void>;
  timestamp: number;
  expiresAt?: number;
};

export class PriorityQueue {
  private queue: PriorityTask[] = [];
  private processing = false;
  private maxConcurrent = 3;
  private activeCount = 0;

  constructor(maxConcurrent = 3) {
    this.maxConcurrent = maxConcurrent;
  }

  enqueue(task: PriorityTask): void {
    this.queue.push(task);
    this.sortQueue();
    void this.process();
  }

  private sortQueue(): void {
    // Sort by priority (higher first), then by expiration time (soonest first)
    this.queue.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority; // Higher priority first
      }
      // If both have expiration times, sort by earliest expiration
      if (a.expiresAt && b.expiresAt) {
        return a.expiresAt - b.expiresAt;
      }
      // If only one has expiration, prioritize it
      if (a.expiresAt) return -1;
      if (b.expiresAt) return 1;
      // Otherwise, sort by timestamp (older first)
      return a.timestamp - b.timestamp;
    });
  }

  private async process(): Promise<void> {
    if (this.processing || this.activeCount >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0 && this.activeCount < this.maxConcurrent) {
      const task = this.queue.shift();
      if (!task) break;

      // Check if task has expired
      if (task.expiresAt && Date.now() > task.expiresAt) {
        console.warn(`[PriorityQueue] Task ${task.id} expired, skipping`);
        continue;
      }

      this.activeCount++;
      this.executeTask(task).catch((error) => {
        console.error(`[PriorityQueue] Task ${task.id} failed:`, error);
      }).finally(() => {
        this.activeCount--;
        void this.process();
      });
    }

    this.processing = false;
  }

  private async executeTask(task: PriorityTask): Promise<void> {
    try {
      await task.task();
    } catch (error) {
      console.error(`[PriorityQueue] Task ${task.id} execution failed:`, error);
      throw error;
    }
  }

  get size(): number {
    return this.queue.length;
  }

  get active(): number {
    return this.activeCount;
  }

  clear(): void {
    this.queue = [];
  }

  async flush(timeoutMs = 30000): Promise<void> {
    const startTime = Date.now();
    while (this.queue.length > 0 || this.activeCount > 0) {
      if (Date.now() - startTime > timeoutMs) {
        console.warn(`[PriorityQueue] Flush timeout after ${timeoutMs}ms`);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

/**
 * Create a priority task for ephemeral media capture
 */
export function createPriorityTask(
  id: string,
  task: () => Promise<void>,
  priority: number,
  ttlMs?: number,
): PriorityTask {
  const timestamp = Date.now();
  const expiresAt = ttlMs ? timestamp + ttlMs : undefined;
  
  return {
    id,
    priority,
    task,
    timestamp,
    expiresAt,
  };
}

/**
 * Singleton priority queue instance for the application
 */
let globalPriorityQueue: PriorityQueue | undefined;

export function getPriorityQueue(): PriorityQueue {
  if (!globalPriorityQueue) {
    globalPriorityQueue = new PriorityQueue(3);
  }
  return globalPriorityQueue;
}
