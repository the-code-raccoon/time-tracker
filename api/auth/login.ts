import { getDb } from '../../server/db.js';
import { getAuthEnv } from '../../server/env.js';
import { clientIp, json } from '../../server/http.js';
import { verifyPassword } from '../../server/password.js';
import { createMemoryRateLimiter, createPostgresRateLimiter, type RateLimiter } from '../../server/rateLimit.js';
import { createSessionToken, sessionCookie } from '../../server/session.js';

const memoryLimiter = createMemoryRateLimiter();

/** Postgres-backed when a database is configured (holds across instances), otherwise in memory. */
export function getLimiter(): RateLimiter {
  return process.env.DATABASE_URL ? createPostgresRateLimiter(getDb()) : memoryLimiter;
}

export async function POST(request: Request): Promise<Response> {
  const { passwordHash, sessionSecret } = getAuthEnv();
  const limiter = getLimiter();
  const ip = clientIp(request);

  if (await limiter.isBlocked(ip)) {
    return json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
  }

  let password: unknown;
  try {
    ({ password } = (await request.json()) as { password?: unknown });
  } catch {
    return json({ error: 'Invalid request body' }, { status: 400 });
  }
  if (typeof password !== 'string' || password.length === 0) {
    return json({ error: 'Password is required' }, { status: 400 });
  }

  if (!(await verifyPassword(password, passwordHash))) {
    await limiter.recordFailure(ip);
    return json({ error: 'Incorrect password' }, { status: 401 });
  }

  await limiter.reset(ip);
  return json(
    { authenticated: true },
    { headers: { 'set-cookie': sessionCookie(request, createSessionToken(sessionSecret)) } },
  );
}
