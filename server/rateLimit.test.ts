import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMemoryRateLimiter, createPostgresRateLimiter } from './rateLimit.js';
import { createTestDb, type TestDb } from './testing/testDb.js';

describe('memory rate limiter', () => {
  it('blocks after the maximum number of failures, per key', async () => {
    const limiter = createMemoryRateLimiter({ maxFailures: 3, windowMs: 1000 }, () => 0);
    for (let i = 0; i < 3; i++) {
      expect(await limiter.isBlocked('ip')).toBe(false);
      await limiter.recordFailure('ip');
    }
    expect(await limiter.isBlocked('ip')).toBe(true);
    expect(await limiter.isBlocked('other-ip')).toBe(false);
  });

  it('forgets failures older than the window', async () => {
    let time = 0;
    const limiter = createMemoryRateLimiter({ maxFailures: 1, windowMs: 1000 }, () => time);
    await limiter.recordFailure('ip');
    time = 999;
    expect(await limiter.isBlocked('ip')).toBe(true);
    time = 1000;
    expect(await limiter.isBlocked('ip')).toBe(false);
  });

  it('resets on success', async () => {
    const limiter = createMemoryRateLimiter({ maxFailures: 1 });
    await limiter.recordFailure('ip');
    await limiter.reset('ip');
    expect(await limiter.isBlocked('ip')).toBe(false);
  });
});

describe('postgres rate limiter', () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
  });
  afterAll(() => db.close());

  it('blocks after the maximum number of failures and resets on success', async () => {
    const limiter = createPostgresRateLimiter(db, { maxFailures: 2 });
    await limiter.recordFailure('1.2.3.4');
    expect(await limiter.isBlocked('1.2.3.4')).toBe(false);
    await limiter.recordFailure('1.2.3.4');
    expect(await limiter.isBlocked('1.2.3.4')).toBe(true);
    expect(await limiter.isBlocked('5.6.7.8')).toBe(false);
    await limiter.reset('1.2.3.4');
    expect(await limiter.isBlocked('1.2.3.4')).toBe(false);
  });

  it('ignores failures outside the window', async () => {
    await db.query("insert into login_attempts (ip, attempted_at) values ('9.9.9.9', now() - interval '20 minutes')");
    expect(await createPostgresRateLimiter(db, { maxFailures: 1 }).isBlocked('9.9.9.9')).toBe(false);
  });
});
