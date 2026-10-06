import { createHmac } from 'node:crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashPassword } from '../../server/password.js';
import { createSessionToken, verifySessionToken } from '../../server/session.js';
import { GET as callback } from '../../server/routes/auth/callback.js';
import { getLimiter, POST as login } from '../../server/routes/auth/login.js';
import { POST as logout } from '../../server/routes/auth/logout.js';
import { GET as session } from '../../server/routes/auth/session.js';

const PASSWORD = 'test password 123';
const SECRET = 's'.repeat(32);
const IP = '203.0.113.1';

function loginRequest(body: unknown, ip = IP) {
  return new Request('https://app.example/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

/** Passes the password step and returns what it handed the browser. */
async function passwordStep() {
  const response = await login(loginRequest({ password: PASSWORD }));
  const { redirect } = (await response.json()) as { redirect: string };
  const google = new URL(redirect);
  return { google, state: google.searchParams.get('state')!, nonce: google.searchParams.get('nonce')!, cookie: response.headers.get('set-cookie')!.split(';')[0] };
}

const idToken = (claims: Record<string, unknown>) => `x.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.y`;

/** Google's token endpoint, answering with an ID token for `email` (and these claim overrides). */
function stubGoogle(email: string, nonce: string, overrides: Record<string, unknown> = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        access_token: 'access',
        expires_in: 3600,
        id_token: idToken({
          iss: 'https://accounts.google.com',
          aud: 'client-id',
          exp: Math.floor(Date.now() / 1000) + 300,
          nonce,
          email,
          email_verified: true,
          ...overrides,
        }),
      }),
    ),
  );
}

function callbackRequest(query: Record<string, string>, cookie?: string, ip = IP) {
  return new Request(`https://app.example/api/auth/callback?${new URLSearchParams(query)}`, {
    headers: { 'x-forwarded-for': ip, ...(cookie ? { cookie } : {}) },
  });
}

const sessionFrom = (response: Response) =>
  response.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith('tt_session=') && !cookie.startsWith('tt_session=;'))
    ?.split(';')[0]
    .slice('tt_session='.length);

const loginError = (response: Response) => new URL(response.headers.get('location')!, 'https://x').searchParams.get('login_error');

beforeAll(async () => {
  vi.stubEnv('APP_PASSWORD_HASH', await hashPassword(PASSWORD));
});

beforeEach(async () => {
  vi.stubEnv('SESSION_SECRET', SECRET);
  vi.stubEnv('DATABASE_URL', ''); // use the in-memory limiter
  vi.stubEnv('GOOGLE_CLIENT_ID', 'client-id');
  vi.stubEnv('GOOGLE_CLIENT_SECRET', 'client-secret');
  vi.stubEnv('GOOGLE_REDIRECT_URI', 'https://app.example/api/google/callback');
  vi.stubEnv('ALLOWED_GOOGLE_EMAIL', 'Me@Example.com');
  await getLimiter().reset(IP);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/auth/login (password step)', () => {
  it('does not sign in, but sends the browser to Google with a signed login cookie', async () => {
    const response = await login(loginRequest({ password: PASSWORD }));
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toMatch(/^tt_login=[\w-]+\.[\w-]+; Path=\/api\/auth; HttpOnly; SameSite=Lax; Max-Age=600; Secure$/);
    expect(response.headers.get('set-cookie')).not.toContain('tt_session');

    const { redirect } = (await response.json()) as { redirect: string };
    const google = new URL(redirect);
    expect(google.origin + google.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(Object.fromEntries(google.searchParams)).toMatchObject({
      client_id: 'client-id',
      redirect_uri: 'https://app.example/api/auth/callback',
      response_type: 'code',
      scope: 'openid email',
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });
    expect(google.searchParams.get('nonce')).toBeTruthy();
    expect(redirect).not.toContain('example.com'); // the allowed account isn't revealed
  });

  it('rejects a wrong password without a cookie', async () => {
    const response = await login(loginRequest({ password: 'nope' }));
    expect(response.status).toBe(401);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it.each([['{not json'], [{}], [{ password: '' }], [{ password: 42 }]])('returns 400 for body %j', async (body) => {
    expect((await login(loginRequest(body))).status).toBe(400);
  });

  it('rate-limits repeated failures per IP, even for the right password', async () => {
    for (let i = 0; i < 5; i++) await login(loginRequest({ password: 'nope' }));
    expect((await login(loginRequest({ password: PASSWORD }))).status).toBe(429);
    expect((await login(loginRequest({ password: PASSWORD }, '198.51.100.7'))).status).toBe(200);
  });

  it('refuses to start when Google sign-in is not configured', async () => {
    vi.stubEnv('ALLOWED_GOOGLE_EMAIL', '');
    await expect(login(loginRequest({ password: PASSWORD }))).rejects.toThrow('ALLOWED_GOOGLE_EMAIL');
  });
});

describe('GET /api/auth/callback (Google step)', () => {
  it('signs in the allowed account and sends it to the app', async () => {
    const { state, nonce, cookie } = await passwordStep();
    stubGoogle('me@example.com', nonce);
    const response = await callback(callbackRequest({ state, code: 'auth-code' }, cookie));

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/');
    expect(verifySessionToken(sessionFrom(response)!, SECRET)).toBe(true);
    expect(response.headers.getSetCookie()).toContainEqual(expect.stringMatching(/^tt_login=; .*Max-Age=0/));

    const body = new URLSearchParams(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    expect(Object.fromEntries(body)).toMatchObject({
      code: 'auth-code',
      grant_type: 'authorization_code',
      redirect_uri: 'https://app.example/api/auth/callback',
    });
    expect(body.get('code_verifier')).toBeTruthy();
  });

  it('refuses another Google account, even after the right password', async () => {
    const { state, nonce, cookie } = await passwordStep();
    stubGoogle('someone-else@example.com', nonce);
    const response = await callback(callbackRequest({ state, code: 'c' }, cookie));
    expect(sessionFrom(response)).toBeUndefined();
    expect(loginError(response)).toBe('That Google account is not allowed to sign in.');
  });

  it.each([
    ['an unverified email', { email_verified: false }],
    ['another app’s token', { aud: 'other-client' }],
    ['another issuer', { iss: 'https://evil.example' }],
    ['an expired token', { exp: Math.floor(Date.now() / 1000) - 1 }],
    ['a different nonce', { nonce: 'replayed' }],
  ])('refuses %s', async (_, overrides) => {
    const { state, nonce, cookie } = await passwordStep();
    stubGoogle('me@example.com', nonce, overrides);
    expect(sessionFrom(await callback(callbackRequest({ state, code: 'c' }, cookie)))).toBeUndefined();
  });

  it.each([
    ['without the password step’s cookie', (state: string) => [{ state, code: 'c' }, undefined] as const],
    ['with a different state', () => [{ state: 'forged', code: 'c' }, 'cookie'] as const],
  ])('refuses a callback %s', async (_, make) => {
    const { state, nonce, cookie } = await passwordStep();
    stubGoogle('me@example.com', nonce);
    const [query, withCookie] = make(state);
    const response = await callback(callbackRequest(query, withCookie ? cookie : undefined));
    expect(sessionFrom(response)).toBeUndefined();
    expect(loginError(response)).toBe('Your sign-in expired. Enter your password again.');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses a login cookie signed with another secret', async () => {
    const { state, nonce, cookie } = await passwordStep();
    vi.stubEnv('SESSION_SECRET', 'o'.repeat(32));
    stubGoogle('me@example.com', nonce);
    expect(sessionFrom(await callback(callbackRequest({ state, code: 'c' }, cookie)))).toBeUndefined();
  });

  it('reports a cancelled Google sign-in', async () => {
    const { state, cookie } = await passwordStep();
    expect(loginError(await callback(callbackRequest({ state, error: 'access_denied' }, cookie)))).toBe('Google sign-in was cancelled.');
  });

  it('counts refused accounts towards the rate limit', async () => {
    for (let i = 0; i < 5; i++) {
      const { state, nonce, cookie } = await passwordStep();
      stubGoogle('someone-else@example.com', nonce);
      await callback(callbackRequest({ state, code: 'c' }, cookie));
    }
    expect((await login(loginRequest({ password: PASSWORD }))).status).toBe(429);
  });
});

describe('GET /api/auth/session', () => {
  it('returns 401 without a cookie', async () => {
    expect((await session(new Request('https://app.example/api/auth/session'))).status).toBe(401);
  });

  it('returns 200 with a valid cookie', async () => {
    const request = new Request('https://app.example/api/auth/session', {
      headers: { cookie: `tt_session=${createSessionToken(SECRET)}` },
    });
    expect((await session(request)).status).toBe(200);
  });

  it('no longer accepts a password-only (v1) session', async () => {
    const data = Buffer.from(JSON.stringify({ v: 1, iat: 0, exp: 4_000_000_000 })).toString('base64url');
    const token = `${data}.${createHmac('sha256', SECRET).update(data).digest('base64url')}`;
    const request = new Request('https://app.example/api/auth/session', { headers: { cookie: `tt_session=${token}` } });
    expect((await session(request)).status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('clears the session cookie', () => {
    const response = logout(new Request('https://app.example/api/auth/logout', { method: 'POST' }));
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });
});
