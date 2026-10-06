import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GET as listCategories } from '../../api/categories/index.js';
import { DELETE as deleteEntry, PATCH as patchEntry } from '../../api/entries/[id].js';
import { GET as listEntries, POST as createEntry } from '../../api/entries/index.js';
import { GET as listTitles } from '../../api/titles.js';
import type { TestDb } from '../../server/testing/testDb.js';
import type { Category, TimeEntry, TitleSuggestion } from '../../shared/types.js';
import { apiRequest, readJson, setupApi, teardownApi } from './helpers.js';

let db: TestDb;
let categories: Category[];

beforeAll(async () => {
  db = await setupApi();
  categories = await readJson<Category[]>(listCategories(apiRequest('/api/categories')));
});
afterAll(() => teardownApi(db));
beforeEach(() => db.exec('delete from time_entries'));

const create = async (body: Record<string, unknown>) => createEntry(apiRequest('/api/entries', { method: 'POST', json: body }));
const list = async (from: string, to: string) =>
  readJson<TimeEntry[]>(listEntries(apiRequest(`/api/entries?from=${from}&to=${to}`)));

describe('authentication', () => {
  it.each([
    ['GET /api/entries', () => listEntries(apiRequest('/api/entries?from=2026-01-01T00:00:00Z&to=2026-01-02T00:00:00Z', { authed: false }))],
    ['POST /api/entries', () => createEntry(apiRequest('/api/entries', { method: 'POST', json: {}, authed: false }))],
    ['GET /api/categories', () => listCategories(apiRequest('/api/categories', { authed: false }))],
    ['GET /api/titles', () => listTitles(apiRequest('/api/titles', { authed: false }))],
  ])('%s requires a session', async (_, call) => {
    expect((await call()).status).toBe(401);
  });
});

describe('GET /api/categories', () => {
  it('returns the seeded categories in order', () => {
    expect(categories.map((c) => c.name)).toEqual([
      'Wake up',
      'Food',
      'Japanese study',
      'Content / creative',
      'Leisure',
      'Work',
      'Errands / outings',
      'Health appointments',
      'Exercise',
      'Self-care / logistics',
    ]);
    expect(categories.find((c) => c.name === 'Exercise')?.gcalColorId).toBe('5');
    expect(categories.find((c) => c.name === 'Self-care / logistics')?.gcalColorId).toBeNull();
  });
});

describe('POST /api/entries', () => {
  it('creates an entry with a normalised title', async () => {
    const response = await create({
      title: '  Make+eat   Lunch ',
      start: '2026-10-05T16:00:00Z',
      end: '2026-10-05T16:35:00Z',
      categoryId: categories[1].id,
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      title: 'make + eat lunch',
      start: '2026-10-05T16:00:00.000Z',
      end: '2026-10-05T16:35:00.000Z',
      categoryId: categories[1].id,
      notes: null,
      gcalEventId: null,
    });
  });

  it('maps aliases to the canonical title (NORM-2, NORM-7)', async () => {
    const entry = await readJson<TimeEntry>(create({ title: 'Gym + Cardio', start: '2026-10-05T16:00:00Z', end: '2026-10-05T17:00:00Z' }));
    expect(entry.title).toBe('exercise');
  });

  it('accepts times with an offset and stores them in UTC', async () => {
    const entry = await readJson<TimeEntry>(create({ title: 'work', start: '2026-10-05T09:00:00-04:00', end: '2026-10-05T17:00:00-04:00' }));
    expect(entry.start).toBe('2026-10-05T13:00:00.000Z');
  });

  it.each([
    [{ start: '2026-10-05T16:00:00Z', end: '2026-10-05T17:00:00Z' }, 'title is required'],
    [{ title: '   ', start: '2026-10-05T16:00:00Z', end: '2026-10-05T17:00:00Z' }, 'title must be 1–200 characters'],
    [{ title: 'x', start: '2026-10-05', end: '2026-10-05T17:00:00Z' }, 'start must be an ISO 8601 date-time'],
    [{ title: 'x', start: '2026-10-05T17:00:00Z', end: '2026-10-05T17:00:00Z' }, 'end must be after start'],
    [{ title: 'x', start: '2026-10-05T00:00:00Z', end: '2026-10-06T00:05:00Z' }, 'at most 24 hours'],
    [{ title: 'x', start: '2026-10-05T16:00:00Z', end: '2026-10-05T17:00:00Z', categoryId: 'nope' }, 'categoryId'],
  ])('rejects %j', async (body, message) => {
    const response = await create(body);
    expect(response.status).toBe(400);
    expect((await readJson<{ error: string }>(response)).error).toContain(message);
  });

  it('rejects a body that is not JSON', async () => {
    const response = await createEntry(apiRequest('/api/entries', { method: 'POST', body: '{nope' }));
    expect(response.status).toBe(400);
  });
});

describe('GET /api/entries', () => {
  it('returns entries overlapping the range, including ones crossing its edges', async () => {
    await create({ title: 'before', start: '2026-10-04T20:00:00Z', end: '2026-10-04T21:00:00Z' });
    await create({ title: 'crosses midnight', start: '2026-10-04T23:00:00Z', end: '2026-10-05T02:00:00Z' });
    await create({ title: 'inside', start: '2026-10-05T10:00:00Z', end: '2026-10-05T11:00:00Z' });
    await create({ title: 'overlaps inside', start: '2026-10-05T10:30:00Z', end: '2026-10-05T10:45:00Z' });
    await create({ title: 'after', start: '2026-10-06T00:00:00Z', end: '2026-10-06T01:00:00Z' });

    const entries = await list('2026-10-05T00:00:00Z', '2026-10-06T00:00:00Z');
    expect(entries.map((e) => e.title)).toEqual(['crosses midnight', 'inside', 'overlaps inside']);
  });

  it.each([
    ['', 'from must be'],
    ['?from=2026-10-05T00:00:00Z&to=2026-10-04T00:00:00Z', 'to must be after from'],
    ['?from=2026-01-01T00:00:00Z&to=2026-12-31T00:00:00Z', 'at most 100 days'],
  ])('rejects range %j', async (query, message) => {
    const response = await listEntries(apiRequest(`/api/entries${query}`));
    expect(response.status).toBe(400);
    expect((await readJson<{ error: string }>(response)).error).toContain(message);
  });
});

describe('GET /api/entries?q= (search)', () => {
  const search = (q: string) => readJson<TimeEntry[]>(listEntries(apiRequest(`/api/entries?q=${encodeURIComponent(q)}`)));

  it('finds titles and notes, newest first, case-insensitively', async () => {
    await create({ title: 'read manga', start: '2026-10-01T10:00:00Z', end: '2026-10-01T11:00:00Z' });
    await create({ title: 'read pjsk event stories', start: '2026-10-03T10:00:00Z', end: '2026-10-03T11:00:00Z' });
    await create({ title: 'chill', notes: 'Read a book', start: '2026-10-02T10:00:00Z', end: '2026-10-02T11:00:00Z' });
    await create({ title: 'work', start: '2026-10-04T10:00:00Z', end: '2026-10-04T11:00:00Z' });
    expect((await search('READ')).map((e) => e.title)).toEqual(['read pjsk event stories', 'chill', 'read manga']);
  });

  it('finds the canonical title of an alias (NORM-5) and treats wildcards literally', async () => {
    await create({ title: 'gym', start: '2026-10-01T10:00:00Z', end: '2026-10-01T11:00:00Z' });
    await create({ title: 'eat 100% snack', start: '2026-10-02T10:00:00Z', end: '2026-10-02T11:00:00Z' });
    await create({ title: 'eat 1000 snacks', start: '2026-10-03T10:00:00Z', end: '2026-10-03T11:00:00Z' });
    expect((await search('cardio')).map((e) => e.title)).toEqual(['exercise']);
    expect((await search('100%')).map((e) => e.title)).toEqual(['eat 100% snack']);
  });

  it('rejects an empty query', async () => {
    expect((await listEntries(apiRequest('/api/entries?q=%20'))).status).toBe(400);
  });
});

describe('PATCH /api/entries/:id', () => {
  it('updates only the given fields', async () => {
    const created = await readJson<TimeEntry>(create({ title: 'chill', start: '2026-10-05T16:00:00Z', end: '2026-10-05T17:00:00Z', notes: 'hi' }));
    const response = await patchEntry(apiRequest(`/api/entries/${created.id}`, { method: 'PATCH', json: { title: 'Read Manga', categoryId: categories[4].id } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ title: 'read manga', categoryId: categories[4].id, notes: 'hi', start: created.start });
  });

  it('validates times against the stored entry', async () => {
    const created = await readJson<TimeEntry>(create({ title: 'x', start: '2026-10-05T16:00:00Z', end: '2026-10-05T17:00:00Z' }));
    const response = await patchEntry(apiRequest(`/api/entries/${created.id}`, { method: 'PATCH', json: { start: '2026-10-05T18:00:00Z' } }));
    expect(response.status).toBe(400);
  });

  it('returns 404 for an unknown id and 400 for a malformed one', async () => {
    const unknown = await patchEntry(apiRequest('/api/entries/00000000-0000-4000-8000-000000000000', { method: 'PATCH', json: { title: 'x' } }));
    expect(unknown.status).toBe(404);
    const malformed = await patchEntry(apiRequest('/api/entries/not-a-uuid', { method: 'PATCH', json: { title: 'x' } }));
    expect(malformed.status).toBe(400);
  });
});

describe('DELETE /api/entries/:id', () => {
  it('soft-deletes: hidden from lists but kept in the table', async () => {
    const created = await readJson<TimeEntry>(create({ title: 'x', start: '2026-10-05T16:00:00Z', end: '2026-10-05T17:00:00Z' }));
    expect((await deleteEntry(apiRequest(`/api/entries/${created.id}`, { method: 'DELETE' }))).status).toBe(204);
    expect(await list('2026-10-05T00:00:00Z', '2026-10-06T00:00:00Z')).toEqual([]);
    const [row] = await db.query<{ deleted_at: Date | null }>('select deleted_at from time_entries where id = $1', [created.id]);
    expect(row.deleted_at).not.toBeNull();

    expect((await deleteEntry(apiRequest(`/api/entries/${created.id}`, { method: 'DELETE' }))).status).toBe(404);
    const patched = await patchEntry(apiRequest(`/api/entries/${created.id}`, { method: 'PATCH', json: { title: 'y' } }));
    expect(patched.status).toBe(404);
  });
});

describe('GET /api/titles', () => {
  it('ranks titles by use and takes the category of the most recent entry', async () => {
    const [food, leisure, selfCare] = [categories[1], categories[4], categories[9]];
    await create({ title: 'eat snack', start: '2026-10-01T10:00:00Z', end: '2026-10-01T10:10:00Z', categoryId: food.id });
    await create({ title: 'Eat snack', start: '2026-10-02T10:00:00Z', end: '2026-10-02T10:10:00Z', categoryId: food.id });
    await create({ title: 'shower', start: '2026-04-01T10:00:00Z', end: '2026-04-01T10:20:00Z', categoryId: leisure.id });
    await create({ title: 'shower', start: '2026-10-01T10:00:00Z', end: '2026-10-01T10:20:00Z', categoryId: selfCare.id });
    await create({ title: 'shower', start: '2026-09-01T10:00:00Z', end: '2026-09-01T10:20:00Z', categoryId: leisure.id });

    const titles = await readJson<TitleSuggestion[]>(listTitles(apiRequest('/api/titles')));
    expect(titles).toEqual([
      { title: 'shower', categoryId: selfCare.id, count: 3 },
      { title: 'eat snack', categoryId: food.id, count: 2 },
    ]);
  });
});
