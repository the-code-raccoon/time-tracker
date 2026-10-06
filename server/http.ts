import { getAuthEnv } from './env.js';
import { hasValidSession } from './session.js';

export function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(body), { ...init, headers });
}

export function clientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
}

/** Returns a 401 response when the request has no valid session, otherwise null. */
export function requireSession(request: Request): Response | null {
  return hasValidSession(request, getAuthEnv().sessionSecret) ? null : json({ error: 'Unauthorized' }, { status: 401 });
}
