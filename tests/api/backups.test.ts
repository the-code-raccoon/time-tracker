import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GET as getBackup, POST as restore } from '../../api/backups/[id].js';
import { GET as listBackups } from '../../api/backups/index.js';
import { POST as createEntry } from '../../api/entries/index.js';
import { PATCH as patchEntry } from '../../api/entries/[id].js';
import { ensureDailyBackup } from '../../server/repositories/backups.js';
import type { TestDb } from '../../server/testing/testDb.js';
import type { BackupDetail, BackupSummary, TimeEntry } from '../../shared/types.js';
import { apiRequest, readJson, setupApi, teardownApi } from './helpers.js';

let db: TestDb;
let backup: BackupSummary;
let entry: TimeEntry;

beforeAll(async () => {
  db = await setupApi();
  entry = await readJson<TimeEntry>(
    createEntry(apiRequest('/api/entries', { method: 'POST', json: { title: 'work', start: '2026-10-05T13:00:00Z', end: '2026-10-05T21:00:00Z' } })),
  );
  await ensureDailyBackup(db);
  [backup] = await readJson<BackupSummary[]>(listBackups(apiRequest('/api/backups')));
});
afterAll(() => teardownApi(db));

const post = (id: string, json: unknown) => restore(apiRequest(`/api/backups/${id}`, { method: 'POST', json }));

describe('backups API (BAK-4)', () => {
  it('requires a session', async () => {
    expect((await listBackups(apiRequest('/api/backups', { authed: false }))).status).toBe(401);
    expect((await restore(apiRequest(`/api/backups/${backup.id}`, { method: 'POST', json: { target: 'app' }, authed: false }))).status).toBe(401);
  });

  it('lists and shows a backup', async () => {
    expect(backup).toMatchObject({ trigger: 'daily', entryCount: 1, eventCount: 0 });
    const detail = await readJson<BackupDetail>(getBackup(apiRequest(`/api/backups/${backup.id}`)));
    expect(detail.items).toEqual([expect.objectContaining({ key: entry.id, appChanged: false, google: null })]);
  });

  it('restores to the app', async () => {
    await patchEntry(apiRequest(`/api/entries/${entry.id}`, { method: 'PATCH', json: { title: 'nap' } }));
    const response = await post(backup.id, { target: 'app', keys: [entry.id] });
    expect(await readJson(response)).toEqual({ app: 1, google: 0, unchanged: 0, remaining: 0, failed: [] });
  });

  it.each([
    [{ target: 'cloud' }, 400],
    [{ target: 'app', keys: [] }, 400],
    [{ target: 'google' }, 409], // Google isn't connected (or configured) here
  ])('rejects %j with %i', async (body, status) => {
    expect((await post(backup.id, body)).status).toBe(status);
  });

  it('404s for an unknown backup', async () => {
    const id = '00000000-0000-4000-8000-000000000000';
    expect((await getBackup(apiRequest(`/api/backups/${id}`))).status).toBe(404);
    expect((await post(id, { target: 'app' })).status).toBe(404);
  });
});
