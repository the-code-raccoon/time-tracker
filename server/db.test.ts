import { describe, expect, it } from 'vitest';
import { createSerialQueue } from './db.js';

describe('createSerialQueue', () => {
  it('runs tasks one at a time, in order, and keeps going after a failure', async () => {
    const serial = createSerialQueue();
    const log: string[] = [];
    const task = (name: string, ms: number, fail = false) => () =>
      new Promise<string>((resolve, reject) => {
        log.push(`start ${name}`);
        setTimeout(() => {
          log.push(`end ${name}`);
          if (fail) reject(new Error(name));
          else resolve(name);
        }, ms);
      });

    const results = await Promise.allSettled([serial(task('a', 20)), serial(task('b', 1, true)), serial(task('c', 1))]);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
    expect(log).toEqual(['start a', 'end a', 'start b', 'end b', 'start c', 'end c']);
  });
});
