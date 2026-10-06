import { getDb } from '../../db.js';
import { getAuthEnv, getGoogleLoginEnv } from '../../env.js';
import { startGoogleLogin } from '../../google/login.js';
import { clientIp, json } from '../../http.js';
import { verifyPassword } from '../../password.js';
import { createMemoryRateLimiter, createPostgresRateLimiter, type RateLimiter } from '../../rateLimit.js';

const memoryLimiter = createMemoryRateLimiter();

/** Postgres-backed when a database is configured (holds across instances), otherwise in memory. */
export function getLimiter(): RateLimiter {
  return process.env.DATABASE_URL ? createPostgresRateLimiter(getDb()) : memoryLimiter;
}

/**
 * POST /api/auth/login — the password step. It doesn't sign you in: it starts the Google sign-in (the second step)
 * and returns the URL to continue at. /api/auth/callback issues the session.
 */
export async function POST(request: Request): Promise<Response> {
  const { passwordHash, sessionSecret } = getAuthEnv();
  const googleEnv = getGoogleLoginEnv();
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

  // Failures are cleared only once the Google step succeeds too (see callback.ts).
  const { url, cookie } = startGoogleLogin(request, googleEnv, sessionSecret);
  return json({ redirect: url }, { headers: { 'set-cookie': cookie } });
}
