import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { GoogleLoginEnv } from '../env.js';
import { readCookie } from '../session.js';

/**
 * Google sign-in, the second login step: only ALLOWED_GOOGLE_EMAIL gets in, even with the right password.
 * The password step sets a signed, short-lived cookie holding the OAuth state, OpenID nonce and PKCE verifier, and
 * only that cookie lets /api/auth/callback turn a Google sign-in into a session. It is SameSite=Lax because Google's
 * redirect back is a cross-site navigation, which would drop a Strict cookie.
 */
export const LOGIN_COOKIE = 'tt_login';
const MAX_AGE_SECONDS = 10 * 60;
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

export type LoginAttempt = { state: string; nonce: string; verifier: string; exp: number };

type IdTokenClaims = { iss?: string; aud?: string | string[]; exp?: number; nonce?: string; email?: string; email_verified?: boolean };

const sign = (data: string, secret: string) => createHmac('sha256', secret).update(`google-login:${data}`).digest('base64url');
const random = () => randomBytes(32).toString('base64url');

function cookieAttributes(request: Request, maxAge: number): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

/** Starts a sign-in attempt: Google's consent URL and the cookie that ties the callback to this browser. */
export function startGoogleLogin(request: Request, env: GoogleLoginEnv, secret: string, now = Date.now()): { url: string; cookie: string } {
  const attempt: LoginAttempt = { state: random(), nonce: random(), verifier: random(), exp: Math.floor(now / 1000) + MAX_AGE_SECONDS };
  const data = Buffer.from(JSON.stringify(attempt)).toString('base64url');
  const params = new URLSearchParams({
    client_id: env.clientId,
    redirect_uri: env.redirectUri,
    response_type: 'code',
    scope: 'openid email',
    state: attempt.state,
    nonce: attempt.nonce,
    code_challenge: createHash('sha256').update(attempt.verifier).digest('base64url'),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  return { url: `${AUTH_URL}?${params}`, cookie: `${LOGIN_COOKIE}=${data}.${sign(data, secret)}; ${cookieAttributes(request, MAX_AGE_SECONDS)}` };
}

/** The attempt this browser started, if its cookie is genuine, unexpired and matches the `state` Google sent back. */
export function readGoogleLogin(request: Request, state: string | null, secret: string, now = Date.now()): LoginAttempt | null {
  const [data, signature, ...rest] = readCookie(request, LOGIN_COOKIE)?.split('.') ?? [];
  if (!data || !signature || rest.length > 0 || !state) return null;

  const expected = Buffer.from(sign(data, secret));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  try {
    const attempt = JSON.parse(Buffer.from(data, 'base64url').toString()) as LoginAttempt;
    return attempt.state === state && attempt.exp > Math.floor(now / 1000) ? attempt : null;
  } catch {
    return null;
  }
}

export function clearedLoginCookie(request: Request): string {
  return `${LOGIN_COOKIE}=; ${cookieAttributes(request, 0)}`;
}

/**
 * Checks the ID token's claims and returns why it is refused, or null when it is the allowed account.
 * The token came straight from Google's token endpoint over TLS, so its signature needn't be checked
 * (OpenID Connect Core 3.1.3.7); everything else must match this sign-in.
 */
export function checkIdToken(
  idToken: string | undefined,
  expected: { clientId: string; allowedEmail: string; nonce: string },
  now = Date.now(),
): string | null {
  let claims: IdTokenClaims;
  try {
    claims = JSON.parse(Buffer.from(idToken?.split('.')[1] ?? '', 'base64url').toString()) as IdTokenClaims;
  } catch {
    return 'Google did not confirm who you are.';
  }

  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (
    !ISSUERS.has(claims.iss ?? '') ||
    !audiences.includes(expected.clientId) ||
    typeof claims.exp !== 'number' ||
    claims.exp <= Math.floor(now / 1000) ||
    claims.nonce !== expected.nonce
  ) {
    return 'Google did not confirm who you are.';
  }
  if (claims.email_verified !== true || claims.email?.toLowerCase() !== expected.allowedEmail) {
    return 'That Google account is not allowed to sign in.';
  }
  return null;
}
