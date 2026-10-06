import { vi } from 'vitest';
import type { GoogleEvent } from '../google/calendar.js';

export type FakeGoogle = {
  /** The calendar's current events (including cancelled ones). */
  events: Map<string, GoogleEvent>;
  /** Every request made to the fake. */
  calls: { url: URL; init?: RequestInit }[];
  set(event: GoogleEvent): void;
  cancel(id: string): void;
  expireSyncTokens(): void;
};

/**
 * Stubs fetch with a tiny Google: the token endpoint and events.list with sync tokens, pages and 410s.
 * Sync tokens are "v<version>"; each change bumps the version, and a token returns events changed after it.
 */
export function fakeGoogle({ pageSize = 2500 } = {}): FakeGoogle {
  let version = 0;
  let minValidVersion = 0;
  const changedAt = new Map<string, number>();
  const events = new Map<string, GoogleEvent>();
  const calls: FakeGoogle['calls'] = [];

  const fake: FakeGoogle = {
    events,
    calls,
    set(event) {
      events.set(event.id, { status: 'confirmed', ...event });
      changedAt.set(event.id, ++version);
    },
    cancel(id) {
      events.set(id, { id, status: 'cancelled' });
      changedAt.set(id, ++version);
    },
    expireSyncTokens() {
      minValidVersion = version + 1;
    },
  };

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input.toString());
      calls.push({ url, init });
      if (url.hostname === 'oauth2.googleapis.com' && url.pathname === '/token') {
        return Response.json({ access_token: `access-${calls.length}`, expires_in: 3600, scope: 'openid email https://www.googleapis.com/auth/calendar.events', refresh_token: 'refresh-token' });
      }
      if (url.hostname === 'oauth2.googleapis.com' && url.pathname === '/revoke') return new Response(null, { status: 200 });
      if (url.hostname === 'www.googleapis.com' && url.pathname.endsWith('/events')) {
        const token = url.searchParams.get('syncToken');
        const since = token ? Number(token.slice(1)) : null;
        if (since !== null && since < minValidVersion) return Response.json({ error: { message: 'Sync token is no longer valid' } }, { status: 410 });
        // Like Google with showDeleted=true: a full list includes cancelled events; a token returns only later changes.
        const all = [...events.values()].filter((e) => since === null || changedAt.get(e.id)! > since);
        const offset = Number(url.searchParams.get('pageToken') ?? 0);
        const page = all.slice(offset, offset + pageSize);
        const more = offset + pageSize < all.length;
        return Response.json({
          summary: 'Schedule',
          items: page,
          ...(more ? { nextPageToken: String(offset + pageSize) } : { nextSyncToken: `v${version}` }),
        });
      }
      return new Response('not found', { status: 404 });
    }),
  );
  return fake;
}
