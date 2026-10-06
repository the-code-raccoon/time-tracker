import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashPassword } from '../../server/password.js';
import { createSessionToken } from '../../server/session.js';
import { getLimiter, POST as login } from '../../api/auth/login.js';
import { POST as logout } from '../../api/auth/logout.js';
import { GET as session } from '../../api/auth/session.js';

const PASSWORD = 'test password 123';
const SECRET = 's'.repeat(32);

function loginRequest(body: unknown, ip = '203.0.113.1') {
  return new Request('https://app.example/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeAll(async () => {
  vi.stubEnv('APP_PASSWORD_HASH', await hashPassword(PASSWORD));
  vi.stubEnv('SESSION_SECRET', SECRET);
  vi.stubEnv('DATABASE_URL', ''); // use the in-memory limiter
});

beforeEach(() => getLimiter().reset('203.0.113.1'));

describe('POST /api/auth/login', () => {
  it('sets a session cookie for the correct password', async () => {
    const response = await login(loginRequest({ password: PASSWORD }));
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toMatch(/^tt_session=[\w-]+\.[\w-]+; .*HttpOnly/);
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
});

describe('POST /api/auth/logout', () => {
  it('clears the session cookie', () => {
    const response = logout(new Request('https://app.example/api/auth/logout', { method: 'POST' }));
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });
});
