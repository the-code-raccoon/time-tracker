import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GET as listCategories } from '../../server/routes/categories/index.js';
import { GET as listEntries } from '../../server/routes/entries/index.js';
import { DELETE as discardTimer, GET as getTimer, PATCH as patchTimer, POST as startTimer } from '../../server/routes/timer/index.js';
import { POST as stopTimer } from '../../server/routes/timer/stop.js';
import type { TestDb } from '../../server/testing/testDb.js';
import type { Category, TimeEntry, Timer } from '../../shared/types.js';
import { apiRequest, readJson, setupApi, teardownApi } from './helpers.js';

let db: TestDb;
let categories: Category[];

beforeAll(async () => {
  db = await setupApi();
  categories = await readJson<Category[]>(listCategories(apiRequest('/api/categories')));
});
afterAll(() => teardownApi(db));
beforeEach(() => db.exec('delete from timer; delete from time_entries'));

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const start = (json: unknown) => startTimer(apiRequest('/api/timer', { method: 'POST', json }));
const current = () => readJson<Timer | null>(getTimer(apiRequest('/api/timer')));
const stop = () => stopTimer(apiRequest('/api/timer/stop', { method: 'POST' }));

describe('timer (TE-5)', () => {
  it('requires a session', async () => {
    expect((await getTimer(apiRequest('/api/timer', { authed: false }))).status).toBe(401);
    expect((await stopTimer(apiRequest('/api/timer/stop', { method: 'POST', authed: false }))).status).toBe(401);
  });

  it('is null when nothing is running', async () => {
    expect(await current()).toBeNull();
  });

  it('starts now by default, with a canonical title, and is visible to every device', async () => {
    const before = Date.now();
    const response = await start({ title: 'Gym', categoryId: categories[8].id });
    expect(response.status).toBe(201);
    const timer = await current();
    expect(timer).toMatchObject({ title: 'exercise', categoryId: categories[8].id });
    expect(Date.parse(timer!.startedAt)).toBeGreaterThanOrEqual(before - 1000);
  });

  it('refuses to start a second timer', async () => {
    await start({ title: 'work' });
    const response = await start({ title: 'chill' });
    expect(response.status).toBe(409);
    expect((await current())?.title).toBe('work');
  });

  it.each([
    [{}, 'title is required'],
    [{ title: 'x', startedAt: new Date(Date.now() + 10 * 60_000).toISOString() }, 'future'],
    [{ title: 'x', categoryId: 'nope' }, 'categoryId'],
  ])('rejects %j', async (body, message) => {
    const response = await start(body);
    expect(response.status).toBe(400);
    expect((await readJson<{ error: string }>(response)).error).toContain(message);
  });

  it('edits the running timer', async () => {
    await start({ title: 'work' });
    const startedAt = minutesAgo(30);
    const response = await patchTimer(apiRequest('/api/timer', { method: 'PATCH', json: { title: 'Chilling', startedAt } }));
    expect(await readJson(response)).toEqual({ title: 'chill', categoryId: null, startedAt });
  });

  it('stops into an entry rounded to 5 minutes, and only once', async () => {
    await start({ title: 'read manga', categoryId: categories[4].id, startedAt: minutesAgo(42) });
    const response = await stop();
    expect(response.status).toBe(201);
    const entry = await readJson<TimeEntry>(response);
    expect(entry).toMatchObject({ title: 'read manga', categoryId: categories[4].id });
    for (const time of [entry.start, entry.end]) expect(Date.parse(time) % (5 * 60_000)).toBe(0);
    const minutes = (Date.parse(entry.end) - Date.parse(entry.start)) / 60_000;
    expect(minutes).toBeGreaterThanOrEqual(40);
    expect(minutes).toBeLessThanOrEqual(45);
    expect(Math.abs(Date.parse(entry.end) - Date.now())).toBeLessThanOrEqual(150_000);

    expect(await current()).toBeNull();
    expect((await stop()).status).toBe(404);
    const from = new Date(Date.now() - 86_400_000).toISOString();
    const to = new Date(Date.now() + 86_400_000).toISOString();
    expect(await readJson<TimeEntry[]>(listEntries(apiRequest(`/api/entries?from=${from}&to=${to}`)))).toHaveLength(1);
  });

  it('logs at least 5 minutes', async () => {
    await start({ title: 'x' });
    const entry = await readJson<TimeEntry>(stop());
    expect(Date.parse(entry.end) - Date.parse(entry.start)).toBe(5 * 60_000);
  });

  it('keeps a timer that ran longer than an entry can be', async () => {
    await start({ title: 'forgot', startedAt: minutesAgo(25 * 60) });
    const response = await stop();
    expect(response.status).toBe(400);
    expect(await current()).toMatchObject({ title: 'forgot' });
  });

  it('discards without logging', async () => {
    await start({ title: 'x' });
    expect((await discardTimer(apiRequest('/api/timer', { method: 'DELETE' }))).status).toBe(204);
    expect(await current()).toBeNull();
    expect(await db.query('select 1 from time_entries')).toHaveLength(0);
    expect((await discardTimer(apiRequest('/api/timer', { method: 'DELETE' }))).status).toBe(404);
  });
});
