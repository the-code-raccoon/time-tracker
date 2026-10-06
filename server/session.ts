import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'tt_session';
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

type SessionPayload = { v: 1; iat: number; exp: number };

function sign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

export function createSessionToken(secret: string, now = Date.now()): string {
  const iat = Math.floor(now / 1000);
  const payload: SessionPayload = { v: 1, iat, exp: iat + SESSION_TTL_SECONDS };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${data}.${sign(data, secret)}`;
}

export function verifySessionToken(token: string, secret: string, now = Date.now()): boolean {
  const [data, signature, ...rest] = token.split('.');
  if (!data || !signature || rest.length > 0) return false;

  const expected = Buffer.from(sign(data, secret));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;

  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString()) as SessionPayload;
    return payload.v === 1 && typeof payload.exp === 'number' && payload.exp > Math.floor(now / 1000);
  } catch {
    return false;
  }
}

export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get('cookie');
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return undefined;
}

function cookieAttributes(request: Request, maxAge: number): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

export function sessionCookie(request: Request, token: string): string {
  return `${SESSION_COOKIE}=${token}; ${cookieAttributes(request, SESSION_TTL_SECONDS)}`;
}

export function clearedSessionCookie(request: Request): string {
  return `${SESSION_COOKIE}=; ${cookieAttributes(request, 0)}`;
}

export function hasValidSession(request: Request, secret: string): boolean {
  const token = readCookie(request, SESSION_COOKIE);
  return token !== undefined && verifySessionToken(token, secret);
}
