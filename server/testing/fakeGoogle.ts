import { vi } from 'vitest';
import type { GoogleEvent } from '../google/calendar.js';

export type FakeGoogle = {
  /** The calendar's current events (including cancelled ones). */
  events: Map<string, GoogleEvent>;
  /** Every request made to the fake. */
  calls: { url: URL; init?: RequestInit }[];
  /** Changes an event as if edited in Google (new etag; shows up in the next sync-token pull). */
  set(event: GoogleEvent): void;
  cancel(id: string): void;
  expireSyncTokens(): void;
  /** Make the next request with this method fail with `status` (and, for 403, an optional error reason). */
  failNext(method: string, status: number, reason?: string): void;
  requests(method: string): { url: URL; body: Record<string, unknown> | null }[];
};

/**
 * Stubs fetch with a tiny Google: the token endpoint, events.list with sync tokens, pages and 410s,
 * and events insert/patch/delete/get with etags and If-Match (412 when the event changed).
 * Sync tokens are "v<version>"; each change bumps the version, and a token returns events changed after it.
 */
export function fakeGoogle({ pageSize = 2500 } = {}): FakeGoogle {
  let version = 0;
  let minValidVersion = 0;
  let nextId = 1;
  const changedAt = new Map<string, number>();
  const events = new Map<string, GoogleEvent>();
  const calls: FakeGoogle['calls'] = [];
  const failures: { method: string; status: number; reason?: string }[] = [];

  const store = (event: GoogleEvent) => {
    const stored = { status: 'confirmed' as const, ...event, etag: `"${event.id}-${++version}"` };
    events.set(event.id, stored);
    changedAt.set(event.id, version);
    return stored;
  };

  const fake: FakeGoogle = {
    events,
    calls,
    set: (event) => void store(event),
    cancel(id) {
      events.set(id, { id, status: 'cancelled' });
      changedAt.set(id, ++version);
    },
    expireSyncTokens() {
      minValidVersion = version + 1;
    },
    failNext(method, status, reason) {
      failures.push({ method, status, reason });
    },
    requests(method) {
      return calls
        .filter((c) => (c.init?.method ?? 'GET') === method && c.url.hostname === 'www.googleapis.com')
        .map((c) => ({ url: c.url, body: c.init?.body ? (JSON.parse(String(c.init.body)) as Record<string, unknown>) : null }));
    },
  };

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input.toString());
      const method = init?.method ?? 'GET';
      calls.push({ url, init });
      if (url.hostname === 'oauth2.googleapis.com' && url.pathname === '/token') {
        return Response.json({ access_token: `access-${calls.length}`, expires_in: 3600, scope: 'openid email https://www.googleapis.com/auth/calendar.events', refresh_token: 'refresh-token' });
      }
      if (url.hostname === 'oauth2.googleapis.com' && url.pathname === '/revoke') return new Response(null, { status: 200 });
      if (url.hostname !== 'www.googleapis.com') return new Response('not found', { status: 404 });

      const failure = failures.findIndex((f) => f.method === method);
      if (failure !== -1) {
        const [{ status, reason }] = failures.splice(failure, 1);
        return Response.json({ error: { message: `Injected ${status}`, errors: reason ? [{ reason }] : [] } }, { status });
      }

      const match = url.pathname.match(/\/events(?:\/([^/]+))?$/);
      if (!match) return new Response('not found', { status: 404 });
      const id = match[1] && decodeURIComponent(match[1]);

      if (!id && method === 'GET') {
        const token = url.searchParams.get('syncToken');
        const since = token ? Number(token.slice(1)) : null;
        if (since !== null && since < minValidVersion) return Response.json({ error: { message: 'Sync token is no longer valid' } }, { status: 410 });
        // Like Google with showDeleted=true: a full list includes cancelled events; a token returns only later changes.
        const all = [...events.values()].filter((e) => since === null || changedAt.get(e.id)! > since);
        const offset = Number(url.searchParams.get('pageToken') ?? 0);
        const more = offset + pageSize < all.length;
        return Response.json({
          summary: 'Schedule',
          items: all.slice(offset, offset + pageSize),
          ...(more ? { nextPageToken: String(offset + pageSize) } : { nextSyncToken: `v${version}` }),
        });
      }
      if (!id && method === 'POST') {
        const body = JSON.parse(String(init?.body)) as GoogleEvent;
        return Response.json(store({ ...body, id: `created${nextId++}` }));
      }

      const current = id ? events.get(id) : undefined;
      if (!current || current.status === 'cancelled') return Response.json({ error: { message: 'Not Found' } }, { status: 404 });
      const ifMatch = new Headers(init?.headers).get('if-match');
      if (ifMatch && ifMatch !== current.etag) return Response.json({ error: { message: 'Precondition Failed' } }, { status: 412 });

      if (method === 'GET') return Response.json(current);
      if (method === 'PATCH') {
        const patch = JSON.parse(String(init?.body)) as Record<string, unknown>;
        const next: Record<string, unknown> = { ...current, ...patch };
        for (const [key, value] of Object.entries(patch)) if (value === null) delete next[key];
        return Response.json(store(next as GoogleEvent));
      }
      if (method === 'DELETE') {
        fake.cancel(id!);
        return new Response(null, { status: 204 });
      }
      return new Response('not found', { status: 404 });
    }),
  );
  return fake;
}
