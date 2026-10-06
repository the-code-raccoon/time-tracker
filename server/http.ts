import { getAuthEnv } from './env.js';
import { hasValidSession } from './session.js';

export function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(body), { ...init, headers });
}

export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function clientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
}

/** Returns a 401 response when the request has no valid session, otherwise null. */
export function requireSession(request: Request): Response | null {
  return hasValidSession(request, getAuthEnv().sessionSecret) ? null : json({ error: 'Unauthorized' }, { status: 401 });
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'Invalid JSON body');
  }
}

/** Wraps an authenticated handler: checks the session and turns HttpErrors into JSON responses. */
export function authed(handler: (request: Request) => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    const unauthorized = requireSession(request);
    if (unauthorized) return unauthorized;
    try {
      return await handler(request);
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, { status: error.status });
      throw error;
    }
  };
}

/** Last path segment, for dynamic routes like /api/entries/:id. */
export function lastPathSegment(request: Request): string {
  return decodeURIComponent(new URL(request.url).pathname.split('/').filter(Boolean).at(-1) ?? '');
}
