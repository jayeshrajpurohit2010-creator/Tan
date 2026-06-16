import { describe, expect, it, vi, afterEach } from 'vitest';
import { PriorityQueue, createPriorityTask, getPriorityQueue } from '../src/main/priorityQueue';

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

const flushAllMicrotasks = () => new Promise<void>(resolve => { setTimeout(resolve, 0); });

const createImmediateTask = (id: string, priority: number, onRun?: () => void) =>
  createPriorityTask(id, async () => { onRun?.(); }, priority);

describe('PriorityQueue', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('1. Basic enqueue and processing', async () => {
    const queue = new PriorityQueue(3);
    const mockTask = vi.fn().mockResolvedValue(undefined);
    const task = createPriorityTask('1', mockTask, 1);

    queue.enqueue(task);
    await queue.flush();

    expect(mockTask).toHaveBeenCalledTimes(1);
    expect(queue.size).toBe(0);
  });

  it('2. Priority ordering (higher priority tasks run first)', async () => {
    const queue = new PriorityQueue(2);
    const executionOrder: string[] = [];

    queue.enqueue(createPriorityTask('blocker1', async () => { await delay(500); }, 0));
    queue.enqueue(createPriorityTask('blocker2', async () => { await delay(500); }, 0));

    queue.enqueue(createImmediateTask('low', 1, () => executionOrder.push('low')));
    queue.enqueue(createImmediateTask('high', 10, () => executionOrder.push('high')));
    queue.enqueue(createImmediateTask('medium', 5, () => executionOrder.push('medium')));

    await queue.flush();

    expect(executionOrder).toEqual(['high', 'medium', 'low']);
  });

  it('3. TTL expiration (tasks past expiresAt are skipped)', async () => {
    const queue = new PriorityQueue(1);
    const mockTask1 = vi.fn().mockResolvedValue(undefined);
    const mockTask2 = vi.fn().mockResolvedValue(undefined);

    queue.enqueue(createPriorityTask('blocker', async () => { await delay(500); }, 0));
    queue.enqueue(createPriorityTask('expired', mockTask1, 1, 100));
    queue.enqueue(createPriorityTask('valid', mockTask2, 1, 10000));

    await delay(650);
    await queue.flush();

    expect(mockTask1).not.toHaveBeenCalled();
    expect(mockTask2).toHaveBeenCalledTimes(1);
  });

  it('4. Max concurrent limit (maxConcurrent=3)', async () => {
    const queue = new PriorityQueue(3);
    let activeCount = 0;
    let maxActiveCount = 0;

    const createLongTask = (id: string) => createPriorityTask(id, async () => {
      activeCount++;
      maxActiveCount = Math.max(maxActiveCount, activeCount);
      await delay(100);
      activeCount--;
    }, 1);

    for (let i = 0; i < 10; i++) {
      queue.enqueue(createLongTask(`task-${i}`));
    }

    await queue.flush();

    expect(maxActiveCount).toBeLessThanOrEqual(3);
  });

  it('5. flush() waits for all tasks to complete', async () => {
    const queue = new PriorityQueue(3);
    const completedTasks: string[] = [];

    for (let i = 0; i < 5; i++) {
      queue.enqueue(createPriorityTask(`task-${i}`, async () => {
        await delay(20);
        completedTasks.push(`task-${i}`);
      }, 1));
    }

    await queue.flush();

    expect(completedTasks).toHaveLength(5);
    expect(queue.size).toBe(0);
    expect(queue.active).toBe(0);
  });

  it('6. flush() respects timeout', async () => {
    const queue = new PriorityQueue(3);

    for (let i = 0; i < 10; i++) {
      queue.enqueue(createPriorityTask(`task-${i}`, async () => {
        await delay(500);
      }, 1));
    }

    const start = Date.now();
    await queue.flush(100);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(500);
  });

  it('7. clear() empties the queue', async () => {
    const queue = new PriorityQueue(3);

    for (let i = 0; i < 5; i++) {
      queue.enqueue(createPriorityTask(`task-${i}`, async () => {
        await delay(1000);
      }, 1));
    }

    expect(queue.size).toBe(2);
    queue.clear();
    expect(queue.size).toBe(0);
  });

  it('8. size and active getters', async () => {
    const queue = new PriorityQueue(1);

    expect(queue.size).toBe(0);
    expect(queue.active).toBe(0);

    queue.enqueue(createPriorityTask('task1', async () => {
      await delay(500);
    }, 1));

    await delay(10);
    expect(queue.active).toBe(1);
    await queue.flush();
    expect(queue.size).toBe(0);
    expect(queue.active).toBe(0);
  });

  it('9. createPriorityTask creates correct structure', () => {
    const mockTask = vi.fn().mockResolvedValue(undefined);
    const now = Date.now();
    const task = createPriorityTask('test-id', mockTask, 5, 1000);

    expect(task.id).toBe('test-id');
    expect(task.priority).toBe(5);
    expect(task.task).toBe(mockTask);
    expect(task.timestamp).toBeGreaterThanOrEqual(now);
    expect(task.expiresAt).toBe(task.timestamp + 1000);
  });

  it('10. getPriorityQueue returns singleton', () => {
    const queue1 = getPriorityQueue();
    const queue2 = getPriorityQueue();
    expect(queue1).toBe(queue2);
  });

  it('11. Task execution order with mixed priorities and TTLs', async () => {
    const queue = new PriorityQueue(2);
    const executionOrder: string[] = [];

    queue.enqueue(createPriorityTask('blocker1', async () => { await delay(500); }, 0));
    queue.enqueue(createPriorityTask('blocker2', async () => { await delay(500); }, 0));

    queue.enqueue(createPriorityTask('task1', async () => {
      executionOrder.push('task1');
    }, 1, 5000));

    queue.enqueue(createPriorityTask('task2', async () => {
      executionOrder.push('task2');
    }, 5, 5000));

    queue.enqueue(createPriorityTask('task3', async () => {
      executionOrder.push('task3');
    }, 3, 5000));

    await queue.flush();

    expect(executionOrder).toEqual(['task2', 'task3', 'task1']);
  });

  it('12. Concurrent task execution', async () => {
    const queue = new PriorityQueue(3);
    let concurrency = 0;
    let maxConcurrency = 0;

    const createTask = (id: string, duration: number) => createPriorityTask(id, async () => {
      concurrency++;
      maxConcurrency = Math.max(maxConcurrency, concurrency);
      await delay(duration);
      concurrency--;
    }, 1);

    queue.enqueue(createTask('fast1', 50));
    queue.enqueue(createTask('fast2', 50));
    queue.enqueue(createTask('slow', 200));

    await queue.flush();

    expect(maxConcurrency).toBe(3);
    expect(concurrency).toBe(0);
  });
});
