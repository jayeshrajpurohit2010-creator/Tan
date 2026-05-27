import { describe, expect, it } from 'vitest';
import { NoDropWriteQueue } from '../../src/main/sync/writeQueue';

describe('NoDropWriteQueue', () => {
  it('executes every queued task without intentional drops', async () => {
    const queue = new NoDropWriteQueue();
    const seen: number[] = [];

    for (let index = 0; index < 128; index += 1) {
      queue.enqueue(async () => {
        seen.push(index);
      });
    }

    await queue.flush();
    expect(seen).toHaveLength(128);
    expect(seen[0]).toBe(0);
    expect(seen[127]).toBe(127);
    expect(queue.depth).toBe(0);
  });

  it('continues after a task failure', async () => {
    const queue = new NoDropWriteQueue();
    const seen: string[] = [];

    queue.enqueue(async () => {
      seen.push('before');
    });
    queue.enqueue(async () => {
      throw new Error('disk interrupted');
    });
    queue.enqueue(async () => {
      seen.push('after');
    });

    await queue.flush();
    expect(seen).toEqual(['before', 'after']);
  });
});
