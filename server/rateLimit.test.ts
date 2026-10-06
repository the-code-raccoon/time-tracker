import { describe, expect, it } from 'vitest';
import { createRateLimiter } from './rateLimit.js';

describe('rate limiter', () => {
  it('blocks after the maximum number of failures within the window', () => {
    const limiter = createRateLimiter({ maxFailures: 3, windowMs: 1000 });
    for (let i = 0; i < 3; i++) {
      expect(limiter.isBlocked('ip', 0)).toBe(false);
      limiter.recordFailure('ip', 0);
    }
    expect(limiter.isBlocked('ip', 500)).toBe(true);
    expect(limiter.isBlocked('other-ip', 500)).toBe(false);
  });

  it('unblocks once the window has passed', () => {
    const limiter = createRateLimiter({ maxFailures: 1, windowMs: 1000 });
    limiter.recordFailure('ip', 0);
    expect(limiter.isBlocked('ip', 999)).toBe(true);
    expect(limiter.isBlocked('ip', 1000)).toBe(false);
  });

  it('resets on success', () => {
    const limiter = createRateLimiter({ maxFailures: 1 });
    limiter.recordFailure('ip');
    limiter.reset('ip');
    expect(limiter.isBlocked('ip')).toBe(false);
  });
});
