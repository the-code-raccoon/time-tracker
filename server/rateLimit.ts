// Fixed-window limiter for failed logins.
// In-memory, so it only holds within one warm serverless instance; it moves to Postgres in M1.
export type RateLimiter = {
  isBlocked(key: string, now?: number): boolean;
  recordFailure(key: string, now?: number): void;
  reset(key: string): void;
};

export function createRateLimiter({ maxFailures = 5, windowMs = 15 * 60 * 1000 } = {}): RateLimiter {
  const failures = new Map<string, { count: number; windowStart: number }>();

  function current(key: string, now: number) {
    const entry = failures.get(key);
    if (entry && now - entry.windowStart >= windowMs) {
      failures.delete(key);
      return undefined;
    }
    return entry;
  }

  return {
    isBlocked(key, now = Date.now()) {
      return (current(key, now)?.count ?? 0) >= maxFailures;
    },
    recordFailure(key, now = Date.now()) {
      const entry = current(key, now);
      if (entry) entry.count += 1;
      else failures.set(key, { count: 1, windowStart: now });
    },
    reset(key) {
      failures.delete(key);
    },
  };
}
