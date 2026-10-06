import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DELETE as deleteCategory, PATCH as patchCategory } from '../../api/categories/[id].js';
import { GET as listCategories, POST as createCategory } from '../../api/categories/index.js';
import { POST as reorder } from '../../api/categories/reorder.js';
import { POST as createEntry } from '../../api/entries/index.js';
import { POST as recategorize } from '../../api/entries/recategorize.js';
import { POST as restore } from '../../api/entries/restore.js';
import { DELETE as deleteEntry } from '../../api/entries/[id].js';
import type { TestDb } from '../../server/testing/testDb.js';
import type { Category, TimeEntry } from '../../shared/types.js';
import { apiRequest, readJson, setupApi, teardownApi } from './helpers.js';

let db: TestDb;

// A fresh database per test: these tests rename, merge and delete the seeded categories.
beforeEach(async () => {
  db = await setupApi();
});
afterEach(() => teardownApi(db));

const categories = () => readJson<Category[]>(listCategories(apiRequest('/api/categories')));
const byName = async (name: string) => (await categories()).find((c) => c.name === name)!;
const entry = (title: string, categoryId: string | null, start = '2026-10-05T10:00:00Z', end = '2026-10-05T10:30:00Z') =>
  readJson<TimeEntry>(createEntry(apiRequest('/api/entries', { method: 'POST', json: { title, start, end, categoryId } })));
const backups = () => db.query<{ trigger: string; description: string; entries: unknown[] }>('select trigger, description, entries from backups');

describe('GET /api/categories', () => {
  it('includes entry counts and total minutes', async () => {
    const food = await byName('Food');
    await entry('eat snack', food.id, '2026-10-05T10:00:00Z', '2026-10-05T10:10:00Z');
    await entry('make + eat lunch', food.id, '2026-10-05T12:00:00Z', '2026-10-05T12:45:00Z');
    expect(await byName('Food')).toMatchObject({ entryCount: 2, totalMinutes: 55, syncedCount: 0 });
  });
});

describe('POST /api/categories', () => {
  it('creates a category at the end of the list', async () => {
    const response = await createCategory(apiRequest('/api/categories', { method: 'POST', json: { name: '  Reading  ', appColor: '#ABCDEF', gcalColorId: null } }));
    expect(response.status).toBe(201);
    expect(await readJson(response)).toMatchObject({ name: 'Reading', appColor: '#abcdef', gcalColorId: null, entryCount: 0 });
    expect((await categories()).at(-1)?.name).toBe('Reading');
  });

  it.each([
    [{ name: '', appColor: '#000000', gcalColorId: null }, 400],
    [{ name: 'X', appColor: 'red', gcalColorId: null }, 400],
    [{ name: 'X', appColor: '#000000', gcalColorId: '12' }, 400],
    [{ name: 'Food', appColor: '#000000', gcalColorId: null }, 409],
  ])('rejects %j with %i', async (body, status) => {
    expect((await createCategory(apiRequest('/api/categories', { method: 'POST', json: body }))).status).toBe(status);
  });
});

describe('PATCH /api/categories/:id', () => {
  it('renames and recolours', async () => {
    const leisure = await byName('Leisure');
    const response = await patchCategory(apiRequest(`/api/categories/${leisure.id}`, { method: 'PATCH', json: { name: 'Fun', appColor: '#123456' } }));
    expect(await readJson(response)).toMatchObject({ name: 'Fun', appColor: '#123456', gcalColorId: '7' });
  });

  it('marks entries as modified when the GCal colour changes (CAT-4)', async () => {
    const leisure = await byName('Leisure');
    const created = await entry('chill', leisure.id);
    await patchCategory(apiRequest(`/api/categories/${leisure.id}`, { method: 'PATCH', json: { gcalColorId: '1' } }));
    const [row] = await db.query<{ updated_at: Date }>('select updated_at from time_entries where id = $1', [created.id]);
    expect(new Date(row.updated_at).getTime()).toBeGreaterThan(new Date(created.updatedAt).getTime());
  });

  it('returns 404 for an unknown category', async () => {
    const response = await patchCategory(apiRequest('/api/categories/00000000-0000-4000-8000-000000000000', { method: 'PATCH', json: { name: 'x' } }));
    expect(response.status).toBe(404);
  });
});

describe('DELETE /api/categories/:id', () => {
  it('merges into another category after taking a backup (CAT-11)', async () => {
    const [food, leisure] = [await byName('Food'), await byName('Leisure')];
    await entry('eat + chill', leisure.id);
    const response = await deleteCategory(apiRequest(`/api/categories/${leisure.id}?moveTo=${food.id}`, { method: 'DELETE' }));
    expect(await readJson(response)).toEqual({ moved: 1 });
    expect((await categories()).some((c) => c.name === 'Leisure')).toBe(false);
    expect((await byName('Food')).entryCount).toBe(1);

    const [backup] = await backups();
    expect(backup).toMatchObject({ trigger: 'category-change', description: 'Merge "Leisure"' });
    expect(backup.entries).toHaveLength(1);
  });

  it('can leave entries uncategorised', async () => {
    const leisure = await byName('Leisure');
    const created = await entry('chill', leisure.id);
    await deleteCategory(apiRequest(`/api/categories/${leisure.id}?moveTo=none`, { method: 'DELETE' }));
    const [row] = await db.query<{ category_id: string | null }>('select category_id from time_entries where id = $1', [created.id]);
    expect(row.category_id).toBeNull();
  });

  it.each([
    ['', 400],
    ['?moveTo=self', 400],
    ['?moveTo=00000000-0000-4000-8000-000000000000', 400],
  ])('rejects moveTo %j', async (query, status) => {
    const leisure = await byName('Leisure');
    const resolved = query.replace('self', leisure.id);
    expect((await deleteCategory(apiRequest(`/api/categories/${leisure.id}${resolved}`, { method: 'DELETE' }))).status).toBe(status);
    expect(await byName('Leisure')).toBeDefined();
  });
});

describe('POST /api/categories/reorder', () => {
  it('sets the order from the list of ids', async () => {
    const ids = (await categories()).map((c) => c.id).reverse();
    const response = await reorder(apiRequest('/api/categories/reorder', { method: 'POST', json: { ids } }));
    expect((await readJson<Category[]>(response)).map((c) => c.id)).toEqual(ids);
  });

  it('requires every category exactly once', async () => {
    const ids = (await categories()).map((c) => c.id);
    for (const bad of [ids.slice(1), [...ids, ids[0]], ['nope']]) {
      expect((await reorder(apiRequest('/api/categories/reorder', { method: 'POST', json: { ids: bad } }))).status).toBe(400);
    }
  });
});

describe('POST /api/entries/recategorize', () => {
  it('moves every entry with the title, case-insensitively, after a backup (CAT-12)', async () => {
    const [leisure, selfCare] = [await byName('Leisure'), await byName('Self-care / logistics')];
    await entry('shower', leisure.id);
    await entry('Shower', null, '2026-10-06T10:00:00Z', '2026-10-06T10:20:00Z');
    await entry('chill', leisure.id);

    const response = await recategorize(apiRequest('/api/entries/recategorize', { method: 'POST', json: { title: 'SHOWER', categoryId: selfCare.id } }));
    expect(await readJson(response)).toEqual({ moved: 2 });
    expect((await byName('Self-care / logistics')).entryCount).toBe(2);
    expect((await byName('Leisure')).entryCount).toBe(1);
    expect((await backups())[0]).toMatchObject({ trigger: 'bulk-move', description: 'Move "shower" entries' });
  });
});

describe('POST /api/entries/restore', () => {
  it('undoes a delete', async () => {
    const created = await entry('nap', null);
    await deleteEntry(apiRequest(`/api/entries/${created.id}`, { method: 'DELETE' }));
    const response = await restore(apiRequest('/api/entries/restore', { method: 'POST', json: { id: created.id } }));
    expect(await readJson(response)).toMatchObject({ id: created.id, title: 'nap' });
    expect((await restore(apiRequest('/api/entries/restore', { method: 'POST', json: { id: created.id } }))).status).toBe(404);
  });
});
