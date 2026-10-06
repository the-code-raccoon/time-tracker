import { vi } from 'vitest';
import type { Category, TimeEntry, TitleSuggestion } from '../../shared/types';

export type Route = (init: RequestInit | undefined, url: URL) => { status: number; body?: unknown };

export const CATEGORIES: Category[] = [
  { id: '00000000-0000-4000-8000-000000000001', name: 'Food', appColor: '#0b8043', gcalColorId: '10', sortOrder: 1, entryCount: 3, totalMinutes: 45, syncedCount: 0 },
  { id: '00000000-0000-4000-8000-000000000002', name: 'Leisure', appColor: '#039be5', gcalColorId: '7', sortOrder: 2, entryCount: 1, totalMinutes: 60, syncedCount: 0 },
];

export const TITLES: TitleSuggestion[] = [
  { title: 'eat snack', categoryId: CATEGORIES[0].id, count: 41 },
  { title: 'chill', categoryId: CATEGORIES[1].id, count: 35 },
];

/** An entry on Wednesday 2026-10-07, 9 am – 5 pm local time, unless overridden. */
export const makeEntry = (overrides: Partial<TimeEntry> = {}): TimeEntry => ({
  id: crypto.randomUUID(),
  title: 'work',
  start: new Date('2026-10-07T09:00:00').toISOString(),
  end: new Date('2026-10-07T17:00:00').toISOString(),
  categoryId: null,
  notes: null,
  gcalEventId: null,
  updatedAt: new Date('2026-10-07T12:00:00').toISOString(),
  ...overrides,
});

/** Local time "2026-10-07T09:30" → ISO string. */
export const iso = (local: string) => new Date(local).toISOString();

/** Stubs fetch with routes keyed by "METHOD /path" (query string ignored). Signed in, empty data by default. */
export function mockApi(routes: Record<string, Route> = {}, entries: TimeEntry[] = []) {
  const all: Record<string, Route> = {
    'GET /api/auth/session': () => ({ status: 200, body: { authenticated: true } }),
    'GET /api/categories': () => ({ status: 200, body: CATEGORIES }),
    'GET /api/titles': () => ({ status: 200, body: TITLES }),
    'GET /api/entries': () => ({ status: 200, body: entries }),
    'GET /api/timer': () => ({ status: 200, body: null }),
    'GET /api/google/status': () => ({ status: 200, body: { configured: true, connected: false, email: null, calendarId: 'cal', lastPullAt: null, pendingConflicts: 0 } }),
    ...routes,
  };
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input.toString(), 'http://localhost');
    const key = `${init?.method ?? 'GET'} ${url.pathname}`;
    const route = all[key] ?? Object.entries(all).find(([pattern]) => pattern.endsWith('/*') && key.startsWith(pattern.slice(0, -1)))?.[1];
    if (!route) throw new Error(`Unexpected request: ${key}`);
    const { status, body } = route(init, url);
    return new Response(status === 204 ? null : JSON.stringify(body === undefined ? {} : body), { status });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

export function requestsTo(fetchMock: ReturnType<typeof mockApi>, method: string, path: string) {
  return fetchMock.mock.calls.filter(([input, init]) => (init?.method ?? 'GET') === method && input.toString().startsWith(path));
}
