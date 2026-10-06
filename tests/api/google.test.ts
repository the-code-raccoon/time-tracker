import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as callback } from '../../api/google/callback.js';
import { GET as connect } from '../../api/google/connect.js';
import { POST as disconnect } from '../../api/google/disconnect.js';
import { GET as status } from '../../api/google/status.js';
import { GET as listConflicts } from '../../api/sync/conflicts.js';
import { POST as syncRoute } from '../../api/sync/index.js';
import { POST as pullRoute } from '../../api/sync/pull.js';
import { POST as resolveRoute } from '../../api/sync/resolve.js';
import { decrypt } from '../../server/crypto.js';
import { fakeGoogle, type FakeGoogle } from '../../server/testing/fakeGoogle.js';
import type { TestDb } from '../../server/testing/testDb.js';
import type { Conflict, GoogleStatus, PullSummary, SyncSummary } from '../../shared/types.js';
import { apiRequest, readJson, setupApi, teardownApi } from './helpers.js';

const KEY = Buffer.alloc(32, 9).toString('base64');
let db: TestDb;
let google: FakeGoogle;

beforeEach(async () => {
  db = await setupApi();
  vi.stubEnv('GOOGLE_CLIENT_ID', 'client-id');
  vi.stubEnv('GOOGLE_CLIENT_SECRET', 'client-secret');
  vi.stubEnv('GOOGLE_REDIRECT_URI', 'https://app.example/api/google/callback');
  vi.stubEnv('GOOGLE_CALENDAR_ID', 'schedule@group.calendar.google.com');
  vi.stubEnv('TOKEN_ENCRYPTION_KEY', KEY);
  google = fakeGoogle();
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await teardownApi(db);
});

/** Runs /connect and returns the state and cookie it issued. */
async function startConnect() {
  const response = await connect(apiRequest('/api/google/connect'));
  const location = new URL(response.headers.get('location')!);
  const cookie = response.headers.get('set-cookie')!.split(';')[0];
  return { response, location, state: location.searchParams.get('state')!, cookie };
}

const idToken = (email: string) => `x.${Buffer.from(JSON.stringify({ email })).toString('base64url')}.y`;

describe('GET /api/google/connect', () => {
  it('requires a session', async () => {
    expect((await connect(apiRequest('/api/google/connect', { authed: false }))).status).toBe(401);
  });

  it('redirects to Google with offline access and a state cookie', async () => {
    const { response, location, state } = await startConnect();
    expect(response.status).toBe(302);
    expect(location.origin + location.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(Object.fromEntries(location.searchParams)).toMatchObject({
      client_id: 'client-id',
      redirect_uri: 'https://app.example/api/google/callback',
      access_type: 'offline',
      prompt: 'consent',
      scope: 'openid email https://www.googleapis.com/auth/calendar.events',
    });
    expect(response.headers.get('set-cookie')).toMatch(new RegExp(`^tt_oauth_state=${state}\\.[\\w-]+; Path=/api/google; HttpOnly; SameSite=Lax`));
  });
});

describe('GET /api/google/callback', () => {
  const callbackRequest = (query: Record<string, string>, cookie?: string) =>
    apiRequest(`/api/google/callback?${new URLSearchParams(query)}`, { authed: false, headers: cookie ? { cookie } : {} });

  it('stores the account with encrypted tokens and redirects to Settings', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ access_token: 'access', refresh_token: 'refresh-secret', expires_in: 3600, scope: 'openid email https://www.googleapis.com/auth/calendar.events', id_token: idToken('me@example.com') }),
      ),
    );
    const { state, cookie } = await startConnect();
    const response = await callback(callbackRequest({ state, code: 'auth-code' }, cookie));

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/settings?google=connected');
    expect(response.headers.get('set-cookie')).toContain('tt_oauth_state=; ');
    const [account] = await db.query<{ email: string; refresh_token_enc: string }>('select email, refresh_token_enc from google_account');
    expect(account.email).toBe('me@example.com');
    expect(account.refresh_token_enc).not.toContain('refresh-secret');
    expect(decrypt(account.refresh_token_enc, KEY)).toBe('refresh-secret');

    const body = new URLSearchParams(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    expect(Object.fromEntries(body)).toMatchObject({ code: 'auth-code', grant_type: 'authorization_code', client_secret: 'client-secret' });
  });

  it.each([
    ['a missing state cookie', (state: string) => [{ state, code: 'c' }, undefined] as const],
    ['a different state', () => [{ state: 'forged', code: 'c' }, 'cookie'] as const],
  ])('rejects %s', async (_, make) => {
    const { state, cookie } = await startConnect();
    const [query, withCookie] = make(state);
    const response = await callback(callbackRequest(query, withCookie ? cookie : undefined));
    expect(response.headers.get('location')).toMatch(/^\/settings\?google=error/);
    expect(await db.query('select 1 from google_account')).toEqual([]);
  });

  it('reports a denied consent', async () => {
    const { state, cookie } = await startConnect();
    const response = await callback(callbackRequest({ state, error: 'access_denied' }, cookie));
    expect(new URL(response.headers.get('location')!, 'https://x').searchParams.get('detail')).toBe('Access was not granted.');
  });

  it('refuses a grant without calendar access', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ access_token: 'a', refresh_token: 'r', expires_in: 3600, scope: 'openid email' })));
    const { state, cookie } = await startConnect();
    const response = await callback(callbackRequest({ state, code: 'c' }, cookie));
    expect(response.headers.get('location')).toContain('google=error');
    expect(await db.query('select 1 from google_account')).toEqual([]);
  });
});

describe('status, pull and disconnect', () => {
  async function connectAccount() {
    const { state, cookie } = await startConnect();
    await callback(apiRequest(`/api/google/callback?${new URLSearchParams({ state, code: 'c' })}`, { authed: false, headers: { cookie } }));
  }

  it('reports not configured without env vars', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', '');
    expect(await readJson<GoogleStatus>(status(apiRequest('/api/google/status')))).toEqual({ configured: false, connected: false });
  });

  it('pulls after connecting, then reports status', async () => {
    expect((await pullRoute(apiRequest('/api/sync/pull', { method: 'POST' }))).status).toBe(409);
    await connectAccount();
    google.set({ id: 'e1', summary: 'work', colorId: '8', start: { dateTime: '2026-10-05T09:00:00-04:00' }, end: { dateTime: '2026-10-05T17:00:00-04:00' } });

    const summary = await readJson<PullSummary>(pullRoute(apiRequest('/api/sync/pull', { method: 'POST' })));
    expect(summary).toMatchObject({ full: true, imported: 1 });

    const current = await readJson<GoogleStatus>(status(apiRequest('/api/google/status')));
    expect(current).toMatchObject({ configured: true, connected: true, calendarId: 'schedule@group.calendar.google.com', pendingConflicts: 0 });
    expect(current.configured && current.lastPullAt).toBeTruthy();
  });

  it('disconnects, revokes the token and keeps entries', async () => {
    await connectAccount();
    google.set({ id: 'e1', summary: 'work', start: { dateTime: '2026-10-05T09:00:00-04:00' }, end: { dateTime: '2026-10-05T17:00:00-04:00' } });
    await pullRoute(apiRequest('/api/sync/pull', { method: 'POST' }));

    await disconnect(apiRequest('/api/google/disconnect', { method: 'POST' }));
    expect(google.calls.some((c) => c.url.pathname === '/revoke' && c.url.searchParams.get('token') === 'refresh-token')).toBe(true);
    expect(await readJson<GoogleStatus>(status(apiRequest('/api/google/status')))).toMatchObject({ connected: false });
    expect(await db.query('select 1 from time_entries')).toHaveLength(1);
  });
});

describe('two-way sync and reconcile', () => {
  async function connectAndImport() {
    const { state, cookie } = await startConnect();
    await callback(apiRequest(`/api/google/callback?${new URLSearchParams({ state, code: 'c' })}`, { authed: false, headers: { cookie } }));
    google.set({ id: 'e1', summary: 'work', colorId: '8', start: { dateTime: '2026-10-05T09:00:00-04:00' }, end: { dateTime: '2026-10-05T17:00:00-04:00' } });
    return readJson<SyncSummary>(syncRoute(apiRequest('/api/sync', { method: 'POST' })));
  }

  it('pulls then pushes, and takes a daily backup', async () => {
    const first = await connectAndImport();
    expect(first.pull.imported).toBe(1);
    expect(first.push).toMatchObject({ created: 0, updated: 0 });

    await db.query("insert into time_entries (title, starts_at, ends_at) values ('nap', '2026-10-05T19:00:00Z', '2026-10-05T19:30:00Z')");
    const second = await readJson<SyncSummary>(syncRoute(apiRequest('/api/sync', { method: 'POST' })));
    expect(second.push.created).toBe(1);
    expect([...google.events.values()].map((e) => e.summary)).toContain('nap');

    const daily = await db.query("select 1 from backups where trigger = 'daily'");
    expect(daily).toHaveLength(1); // once a day, not once per sync
  });

  it('lists conflicts and resolves them', async () => {
    await connectAndImport();
    await db.query("update time_entries set title = 'deep work' where gcal_event_id = 'e1'");
    google.set({ id: 'e1', summary: 'work', colorId: '8', start: { dateTime: '2026-10-05T10:00:00-04:00' }, end: { dateTime: '2026-10-05T17:00:00-04:00' } });

    expect((await readJson<SyncSummary>(syncRoute(apiRequest('/api/sync', { method: 'POST' })))).pull.conflicts).toBe(1);
    const conflicts = await readJson<Conflict[]>(listConflicts(apiRequest('/api/sync/conflicts')));
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ app: { title: 'deep work' }, google: { title: 'work' } });

    const bad = await resolveRoute(apiRequest('/api/sync/resolve', { method: 'POST', json: { resolutions: [{ entryId: conflicts[0].entryId, choice: 'both' }] } }));
    expect(bad.status).toBe(400);

    const response = await resolveRoute(
      apiRequest('/api/sync/resolve', { method: 'POST', json: { resolutions: [{ entryId: conflicts[0].entryId, choice: 'app' }] } }),
    );
    expect(await readJson(response)).toEqual({ resolved: 1 });
    expect((await readJson<SyncSummary>(syncRoute(apiRequest('/api/sync', { method: 'POST' })))).push.updated).toBe(1);
    expect(google.events.get('e1')?.summary).toBe('deep work');
  });

  it('requires a session for every sync route', async () => {
    for (const call of [
      () => syncRoute(apiRequest('/api/sync', { method: 'POST', authed: false })),
      () => listConflicts(apiRequest('/api/sync/conflicts', { authed: false })),
      () => resolveRoute(apiRequest('/api/sync/resolve', { method: 'POST', json: {}, authed: false })),
    ]) {
      expect((await call()).status).toBe(401);
    }
  });
});
