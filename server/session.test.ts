import { describe, expect, it } from 'vitest';
import {
  SESSION_TTL_SECONDS,
  clearedSessionCookie,
  createSessionToken,
  hasValidSession,
  readCookie,
  sessionCookie,
  verifySessionToken,
} from './session.js';

const SECRET = 'a'.repeat(32);

describe('session tokens', () => {
  it('round-trips a valid token', () => {
    expect(verifySessionToken(createSessionToken(SECRET), SECRET)).toBe(true);
  });

  it('rejects a token signed with another secret', () => {
    expect(verifySessionToken(createSessionToken('b'.repeat(32)), SECRET)).toBe(false);
  });

  it('rejects a tampered payload', () => {
    const [, signature] = createSessionToken(SECRET).split('.');
    const forged = Buffer.from(JSON.stringify({ v: 1, iat: 0, exp: 9_999_999_999 })).toString('base64url');
    expect(verifySessionToken(`${forged}.${signature}`, SECRET)).toBe(false);
  });

  it('expires after the TTL', () => {
    const issued = Date.UTC(2026, 0, 1);
    const token = createSessionToken(SECRET, issued);
    expect(verifySessionToken(token, SECRET, issued + (SESSION_TTL_SECONDS - 1) * 1000)).toBe(true);
    expect(verifySessionToken(token, SECRET, issued + SESSION_TTL_SECONDS * 1000)).toBe(false);
  });

  it.each(['', 'abc', 'a.b.c', '.sig'])('rejects malformed token %j', (token) => {
    expect(verifySessionToken(token, SECRET)).toBe(false);
  });
});

describe('session cookies', () => {
  it('sets a hardened cookie, Secure only over https', () => {
    const https = sessionCookie(new Request('https://app.example/api'), 'tok');
    expect(https).toContain('tt_session=tok');
    expect(https).toContain('HttpOnly');
    expect(https).toContain('SameSite=Strict');
    expect(https).toContain('Secure');
    expect(sessionCookie(new Request('http://localhost:5173/api'), 'tok')).not.toContain('Secure');
  });

  it('clears the cookie with Max-Age=0', () => {
    expect(clearedSessionCookie(new Request('https://app.example/'))).toMatch(/^tt_session=; .*Max-Age=0/);
  });

  it('reads a cookie among others', () => {
    const request = new Request('https://app.example/', { headers: { cookie: 'a=1; tt_session=xyz; b=2' } });
    expect(readCookie(request, 'tt_session')).toBe('xyz');
    expect(readCookie(request, 'missing')).toBeUndefined();
  });

  it('detects a valid session from the request', () => {
    const token = createSessionToken(SECRET);
    expect(hasValidSession(new Request('https://x/', { headers: { cookie: `tt_session=${token}` } }), SECRET)).toBe(true);
    expect(hasValidSession(new Request('https://x/'), SECRET)).toBe(false);
  });
});
