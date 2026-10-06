import { getDb } from '../../db.js';
import { getAuthEnv } from '../../env.js';
import { clientIp, json } from '../../http.js';
import { verifyPassword } from '../../password.js';
import { createMemoryRateLimiter, createPostgresRateLimiter, type RateLimiter } from '../../rateLimit.js';
import { createSessionToken, sessionCookie } from '../../session.js';

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
