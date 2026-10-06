import type { Db } from './db.js';
import { clearFailures, countRecentFailures, recordFailure } from './repositories/loginAttempts.js';

export type RateLimiter = {
  isBlocked(key: string): Promise<boolean>;
  recordFailure(key: string): Promise<void>;
  reset(key: string): Promise<void>;
};

export type RateLimitOptions = { maxFailures?: number; windowMs?: number };

const DEFAULTS = { maxFailures: 5, windowMs: 15 * 60 * 1000 };

/** Sliding-window limiter in memory. Used when there is no database (tests, first-time setup). */
export function createMemoryRateLimiter(options: RateLimitOptions = {}, now = () => Date.now()): RateLimiter {
  const { maxFailures, windowMs } = { ...DEFAULTS, ...options };
  const failures = new Map<string, number[]>();
  const recent = (key: string) => (failures.get(key) ?? []).filter((time) => now() - time < windowMs);

  return {
    async isBlocked(key) {
      return recent(key).length >= maxFailures;
    },
    async recordFailure(key) {
      failures.set(key, [...recent(key), now()]);
    },
    async reset(key) {
      failures.delete(key);
    },
  };
}

/** Sliding-window limiter in Postgres, so it holds across serverless instances (AUTH-5). */
export function createPostgresRateLimiter(db: Db, options: RateLimitOptions = {}): RateLimiter {
  const { maxFailures, windowMs } = { ...DEFAULTS, ...options };
  return {
    isBlocked: async (key) => (await countRecentFailures(db, key, windowMs)) >= maxFailures,
    recordFailure: (key) => recordFailure(db, key),
    reset: (key) => clearFailures(db, key),
  };
}
