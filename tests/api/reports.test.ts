import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GET as listCategories } from '../../api/categories/index.js';
import { DELETE as deleteEntry } from '../../api/entries/[id].js';
import { POST as createEntry } from '../../api/entries/index.js';
import { GET as report } from '../../api/reports/index.js';
import { toCsv } from '../../server/repositories/reports.js';
import type { TestDb } from '../../server/testing/testDb.js';
import type { Category, Report, TimeEntry } from '../../shared/types.js';
import { apiRequest, readJson, setupApi, teardownApi } from './helpers.js';

let db: TestDb;
let food: Category;
let work: Category;

beforeAll(async () => {
  db = await setupApi();
  const categories = await readJson<Category[]>(listCategories(apiRequest('/api/categories')));
  food = categories.find((c) => c.name === 'Food')!;
  work = categories.find((c) => c.name === 'Work')!;
});
afterAll(() => teardownApi(db));
beforeEach(() => db.exec('delete from time_entries'));

// Toronto is UTC-4 in October.
const create = (title: string, start: string, end: string, categoryId: string | null = null, notes: string | null = null) =>
  readJson<TimeEntry>(createEntry(apiRequest('/api/entries', { method: 'POST', json: { title, start, end, categoryId, notes } })));
const get = (query: string) => report(apiRequest(`/api/reports?${query}`));
const OCT_5_TO_7 = 'from=2026-10-05T04:00:00Z&to=2026-10-08T04:00:00Z&tz=America/Toronto';

describe('GET /api/reports (REP-1, REP-2)', () => {
  it('requires a session', async () => {
    expect((await report(apiRequest(`/api/reports?${OCT_5_TO_7}`, { authed: false }))).status).toBe(401);
  });

  it('splits minutes by local day and category, including entries crossing midnight', async () => {
    await create('work', '2026-10-05T13:00:00Z', '2026-10-05T21:00:00Z', work.id); // 9–5 Oct 5
    await create('eat snack', '2026-10-05T14:00:00Z', '2026-10-05T14:10:00Z', food.id); // overlaps work: counted too
    await create('stream', '2026-10-06T01:30:00Z', '2026-10-06T05:30:00Z'); // 9:30 pm Oct 5 → 1:30 am Oct 6
    const result = await readJson<Report>(get(OCT_5_TO_7));
    expect(result.days).toEqual([
      { date: '2026-10-05', minutes: { [work.id]: 480, [food.id]: 10, '': 150 } },
      { date: '2026-10-06', minutes: { '': 90 } },
      { date: '2026-10-07', minutes: {} },
    ]);
    expect(result.categories).toEqual([
      { categoryId: work.id, minutes: 480, entries: 1 },
      { categoryId: null, minutes: 240, entries: 1 },
      { categoryId: food.id, minutes: 10, entries: 1 },
    ]);
    expect(result.activities.map((a) => [a.title, a.minutes])).toEqual([['work', 480], ['stream', 240], ['eat snack', 10]]);
  });

  it('clips entries to the range and ignores deleted ones', async () => {
    await create('sleep', '2026-10-05T02:00:00Z', '2026-10-05T10:00:00Z'); // 10 pm Oct 4 → 6 am Oct 5
    const gone = await create('chill', '2026-10-06T20:00:00Z', '2026-10-06T21:00:00Z');
    await deleteEntry(apiRequest(`/api/entries/${gone.id}`, { method: 'DELETE' }));
    const result = await readJson<Report>(get(OCT_5_TO_7));
    expect(result.days[0]).toEqual({ date: '2026-10-05', minutes: { '': 360 } });
    expect(result.categories).toEqual([{ categoryId: null, minutes: 360, entries: 1 }]);
  });

  it('has 25-hour days when the clocks go back', async () => {
    await create('morning', '2026-11-01T04:00:00Z', '2026-11-01T17:00:00Z'); // midnight EDT → noon EST: 13 h
    await create('afternoon', '2026-11-01T17:00:00Z', '2026-11-02T05:00:00Z'); // noon → midnight EST: 12 h
    const result = await readJson<Report>(get('from=2026-11-01T04:00:00Z&to=2026-11-02T05:00:00Z&tz=America/Toronto'));
    expect(result.days).toEqual([{ date: '2026-11-01', minutes: { '': 1500 } }]);
  });

  it.each([
    ['from=2026-10-05T00:00:00Z&to=2026-10-04T00:00:00Z', 'to must be after from'],
    ['from=2025-01-01T00:00:00Z&to=2026-10-04T00:00:00Z', 'at most 400 days'],
    ['from=2026-10-05T00:00:00Z&to=2026-10-06T00:00:00Z&tz=Mars/Base', 'tz'],
  ])('rejects %s', async (query, message) => {
    const response = await get(query);
    expect(response.status).toBe(400);
    expect((await readJson<{ error: string }>(response)).error).toContain(message);
  });
});

describe('GET /api/reports?format=csv (REP-3)', () => {
  it('downloads every entry in the range with local times', async () => {
    await create('make + eat lunch', '2026-10-05T16:30:00Z', '2026-10-05T17:05:00Z', food.id, 'pasta, "the good one"');
    await create('=cmd', '2026-10-06T13:00:00Z', '2026-10-06T13:05:00Z');
    const response = await get(`${OCT_5_TO_7}&format=csv&name=2026-10-05_2026-10-07`);
    expect(response.headers.get('content-type')).toContain('text/csv');
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="time-entries-2026-10-05_2026-10-07.csv"');
    expect(await response.text()).toBe(
      'Start,End,Minutes,Title,Category,Notes\r\n' +
        '2026-10-05 12:30,2026-10-05 13:05,35,make + eat lunch,Food,"pasta, ""the good one"""\r\n' +
        "2026-10-06 09:00,2026-10-06 09:05,5,'=cmd,,\r\n",
    );
  });

  it('quotes line breaks', () => {
    expect(toCsv([['a\nb', 1, null]])).toBe('"a\nb",1,\r\n');
  });
});
