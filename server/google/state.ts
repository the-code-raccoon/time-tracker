import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readCookie } from '../session.js';

/**
 * OAuth `state`, bound to the browser with a signed cookie (CSRF protection for the callback).
 * The cookie is SameSite=Lax: Google's redirect back is a cross-site navigation, which would drop a Strict cookie.
 * Only a signed-in user can get one (GET /api/google/connect requires a session).
 */
export const STATE_COOKIE = 'tt_oauth_state';
const MAX_AGE_SECONDS = 10 * 60;

const sign = (value: string, secret: string) => createHmac('sha256', secret).update(`oauth-state:${value}`).digest('base64url');

export function createState(request: Request, secret: string): { state: string; cookie: string } {
  const state = randomBytes(24).toString('base64url');
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return {
    state,
    cookie: `${STATE_COOKIE}=${state}.${sign(state, secret)}; Path=/api/google; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}${secure}`,
  };
}

export function verifyState(request: Request, state: string | null, secret: string): boolean {
  const cookie = readCookie(request, STATE_COOKIE);
  if (!cookie || !state) return false;
  const [value, signature] = cookie.split('.');
  if (!value || !signature || value !== state) return false;
  const expected = Buffer.from(sign(value, secret));
  const actual = Buffer.from(signature);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function clearedStateCookie(): string {
  return `${STATE_COOKIE}=; Path=/api/google; HttpOnly; SameSite=Lax; Max-Age=0`;
}
