import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GoogleEnv } from '../env.js';
import { timing, type GoogleEvent } from '../google/calendar.js';
import { restoreEntry } from '../repositories/entries.js';
import { saveAccount } from '../repositories/google.js';
import { fakeGoogle, type FakeGoogle } from '../testing/fakeGoogle.js';
import { createTestDb, type TestDb } from '../testing/testDb.js';
import { listConflicts, resolveConflicts } from './conflicts.js';
import { pull } from './pull.js';
import { push } from './push.js';

const ENV: GoogleEnv = {
  clientId: 'client',
  clientSecret: 'secret',
  redirectUri: 'http://localhost/api/google/callback',
  calendarId: 'schedule@group.calendar.google.com',
  encryptionKey: Buffer.alloc(32, 7).toString('base64'),
};

let db: TestDb;
let google: FakeGoogle;

const ev = (id: string, summary: string, start: string, end: string, colorId?: string): GoogleEvent => ({
  id,
  summary,
  colorId,
  start: { dateTime: `2026-${start}:00-04:00` },
  end: { dateTime: `2026-${end}:00-04:00` },
});
const category = async (name: string) => (await db.query<{ id: string }>('select id from categories where name = $1', [name]))[0].id;
const entryId = async (gcalId: string) => (await db.query<{ id: string }>('select id from time_entries where gcal_event_id = $1', [gcalId]))[0].id;
const sync = async () => ({ pull: await pull(db, ENV), push: await push(db, ENV) });

beforeEach(async () => {
  db = await createTestDb();
  google = fakeGoogle();
  await saveAccount(db, ENV, { access_token: 'a', expires_in: 3600, refresh_token: 'r', scope: 'calendar.events' }, null);
  google.set(ev('work', 'work', '10-05T09:00', '10-05T17:00', '8'));
  google.set(ev('gym', 'Gym + Cardio', '10-05T17:00', '10-05T18:15'));
  google.set(ev('shower', 'shower', '04-20T09:00', '04-20T09:20', '7')); // legacy Peacock; NORM-8 puts it in Self-care
  google.set(ev('shower2', 'shower', '10-01T09:00', '10-01T09:20'));
  await pull(db, ENV);
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await db.close();
});

describe('push (SYNC-3)', () => {
  it('does nothing right after an import', async () => {
    expect(await push(db, ENV)).toEqual({ created: 0, updated: 0, deleted: 0, conflicts: 0, remaining: 0, failed: [] });
    expect(google.requests('PATCH')).toEqual([]);
  });

  it('creates events for app entries, with the category colour, and links them', async () => {
    await db.query(
      `insert into time_entries (title, starts_at, ends_at, category_id, notes) values ('journal', '2026-10-05T22:00:00-04:00', '2026-10-05T22:15:00-04:00', $1, 'good day')`,
      [await category('Leisure')],
    );
    expect((await push(db, ENV)).created).toBe(1);
    const [request] = google.requests('POST');
    expect(request.body).toEqual({
      summary: 'journal',
      description: 'good day',
      colorId: '7',
      start: { dateTime: '2026-10-06T02:00:00.000Z' },
      end: { dateTime: '2026-10-06T02:15:00.000Z' },
    });
    const [row] = await db.query<{ gcal_event_id: string; in_sync: boolean }>(
      "select gcal_event_id, app_hash = last_synced_hash as in_sync from time_entries where title = 'journal'",
    );
    expect(row).toEqual({ gcal_event_id: 'created1', in_sync: true });
    // Google echoes the new event on the next pull; it isn't treated as a change.
    expect((await sync()).pull).toMatchObject({ imported: 0, updated: 0, conflicts: 0 });
  });

  it('omits the colour for a category that uses the calendar default', async () => {
    await db.query(`insert into time_entries (title, starts_at, ends_at, category_id) values ('laundry', now(), now() + interval '1 hour', $1)`, [
      await category('Self-care / logistics'),
    ]);
    await push(db, ENV);
    expect(google.requests('POST')[0].body).not.toHaveProperty('colorId');
  });

  it('patches only the times when an imported entry is moved — no rename, no recolour (NORM-6, NORM-8)', async () => {
    await db.query("update time_entries set starts_at = starts_at + interval '30 minutes', ends_at = ends_at + interval '30 minutes' where gcal_event_id in ('gym', 'shower')");
    expect((await push(db, ENV)).updated).toBe(2);
    const patches = google.requests('PATCH');
    for (const { body } of patches) {
      expect(Object.keys(body!).sort()).toEqual(['end', 'start']);
    }
    expect(google.events.get('gym')?.summary).toBe('Gym + Cardio');
    expect(google.events.get('shower')?.colorId).toBe('7');
  });

  it('writes the title only when it was changed in the app, and the colour when the category changed', async () => {
    await db.query("update time_entries set title = 'deep work', category_id = $1 where gcal_event_id = 'work'", [await category('Content / creative')]);
    await push(db, ENV);
    const [{ body }] = google.requests('PATCH');
    expect(body).toMatchObject({ summary: 'deep work', colorId: '3' });
    expect(google.events.get('work')).toMatchObject({ summary: 'deep work', colorId: '3' });
    expect((await sync()).pull).toMatchObject({ updated: 0, conflicts: 0 });
  });

  it('recolours every event of a category whose GCal colour changed (CAT-4)', async () => {
    await db.query("update categories set gcal_color_id = '1' where name = 'Work'");
    await db.query("update time_entries set last_synced_hash = null where category_id = (select id from categories where name = 'Work')");
    await push(db, ENV);
    expect(google.events.get('work')?.colorId).toBe('1');
  });

  it('clears notes in Google when they are cleared in the app', async () => {
    google.set({ ...ev('work', 'work', '10-05T09:00', '10-05T17:00', '8'), description: 'standup' });
    await pull(db, ENV);
    await db.query("update time_entries set notes = null where gcal_event_id = 'work'");
    await push(db, ENV);
    expect(google.requests('PATCH')[0].body).toMatchObject({ description: null });
    expect(google.events.get('work')).not.toHaveProperty('description');
  });

  it('deletes events for entries deleted in the app, once', async () => {
    await db.query("update time_entries set deleted_at = now() where gcal_event_id = 'shower2'");
    expect((await push(db, ENV)).deleted).toBe(1);
    expect(google.events.get('shower2')?.status).toBe('cancelled');
    expect((await sync()).push.deleted).toBe(0);
    expect((await sync()).pull).toMatchObject({ conflicts: 0, deleted: 0 });
  });

  it('recreates an event when a pushed delete is undone', async () => {
    const id = await entryId('shower2');
    await db.query('update time_entries set deleted_at = now() where id = $1', [id]);
    await push(db, ENV);
    await restoreEntry(db, id);
    expect((await push(db, ENV)).created).toBe(1);
    const [row] = await db.query<{ gcal_event_id: string; deleted_at: Date | null }>('select gcal_event_id, deleted_at from time_entries where id = $1', [id]);
    expect(row.gcal_event_id).toMatch(/^created/);
    expect(row.deleted_at).toBeNull();
  });

  it('turns an event changed in Google since the last pull into a conflict (If-Match)', async () => {
    google.set(ev('work', 'work', '10-05T08:00', '10-05T17:00', '8')); // not pulled yet
    await db.query("update time_entries set notes = 'app note' where gcal_event_id = 'work'");
    expect(await push(db, ENV)).toMatchObject({ updated: 0, conflicts: 1 });
    expect(google.events.get('work')).not.toHaveProperty('description');
    expect(await listConflicts(db)).toHaveLength(1);
    // Conflicted entries are not pushed again until reconciled.
    expect(google.requests('PATCH')).toHaveLength(1);
    await push(db, ENV);
    expect(google.requests('PATCH')).toHaveLength(1);
  });

  it('reports failures and carries on', async () => {
    await db.query("update time_entries set starts_at = starts_at + interval '5 minutes' where gcal_event_id in ('work', 'gym')");
    google.failNext('PATCH', 500);
    const summary = await push(db, ENV);
    expect(summary.updated).toBe(1);
    expect(summary.failed).toHaveLength(1);
    expect(summary.failed[0].error).toBe('Injected 500');
    expect((await push(db, ENV)).updated).toBe(1); // retried next time
  });

  it('retries rate-limited writes with backoff (429 and 403 rateLimitExceeded)', async () => {
    const waits: number[] = [];
    vi.spyOn(timing, 'sleep').mockImplementation(async (ms) => void waits.push(ms));
    await db.query("update time_entries set starts_at = starts_at + interval '5 minutes' where gcal_event_id = 'work'");
    google.failNext('PATCH', 403, 'rateLimitExceeded');
    google.failNext('PATCH', 429);
    expect(await push(db, ENV)).toMatchObject({ updated: 1, failed: [] });
    expect(waits).toHaveLength(2);
    expect(waits[1]).toBeGreaterThan(waits[0] * 1.2);
  });

  it('does not retry a 403 that is not a rate limit', async () => {
    const sleep = vi.spyOn(timing, 'sleep').mockResolvedValue();
    await db.query("update time_entries set starts_at = starts_at + interval '5 minutes' where gcal_event_id = 'work'");
    google.failNext('PATCH', 403, 'forbidden');
    expect((await push(db, ENV)).failed).toHaveLength(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('gives up after repeated rate limits and leaves the change for the next sync', async () => {
    vi.spyOn(timing, 'sleep').mockResolvedValue();
    await db.query("update time_entries set starts_at = starts_at + interval '5 minutes' where gcal_event_id = 'work'");
    for (let i = 0; i < 6; i++) google.failNext('PATCH', 429);
    expect((await push(db, ENV)).failed).toHaveLength(1);
    expect((await push(db, ENV)).updated).toBe(1);
  });

  it('stops starting requests when the time budget runs out', async () => {
    await db.query("update time_entries set starts_at = starts_at + interval '5 minutes'");
    const summary = await push(db, ENV, { budgetMs: -1 });
    expect(summary).toMatchObject({ updated: 0, remaining: 4 });
  });

  it('backs up the events and entries it is about to change (BAK-1)', async () => {
    await db.query("update time_entries set starts_at = starts_at + interval '5 minutes' where gcal_event_id = 'work'");
    await db.query("update time_entries set deleted_at = now() where gcal_event_id = 'gym'");
    await push(db, ENV);
    const [backup] = await db.query<{ trigger: string; entries: { gcal_event_id: string }[]; events: GoogleEvent[] }>(
      "select trigger, entries, events from backups where trigger = 'pre-sync'",
    );
    expect(backup.entries.map((e) => e.gcal_event_id).sort()).toEqual(['gym', 'work']);
    expect(backup.events.map((e) => e.summary).sort()).toEqual(['Gym + Cardio', 'work']);
    expect(backup.events.find((e) => e.id === 'work')?.start?.dateTime).toBe('2026-10-05T09:00:00-04:00');
  });
});

describe('reconcile (SYNC-7)', () => {
  async function conflictOnWork() {
    await db.query("update time_entries set title = 'deep work' where gcal_event_id = 'work'");
    google.set({ ...ev('work', 'work', '10-05T10:00', '10-05T17:00', '8'), description: 'late' });
    expect((await sync()).pull.conflicts).toBe(1);
  }

  it('lists both sides, mapped to app fields', async () => {
    await conflictOnWork();
    const [conflict] = await listConflicts(db);
    expect(conflict.app).toMatchObject({ deleted: false, title: 'deep work', start: '2026-10-05T13:00:00.000Z' });
    expect(conflict.google).toMatchObject({ deleted: false, title: 'work', start: '2026-10-05T14:00:00.000Z', notes: 'late', categoryId: await category('Work') });
  });

  it('keep Google: the entry takes Google\'s version and nothing is pushed', async () => {
    await conflictOnWork();
    await resolveConflicts(db, [{ entryId: await entryId('work'), choice: 'google' }]);
    expect(await listConflicts(db)).toEqual([]);
    const [row] = await db.query<{ title: string; notes: string }>("select title, notes from time_entries where gcal_event_id = 'work'");
    expect(row).toEqual({ title: 'work', notes: 'late' });
    expect((await sync()).push).toMatchObject({ updated: 0, conflicts: 0 });
  });

  it('keep app: the next push overwrites Google', async () => {
    await conflictOnWork();
    await resolveConflicts(db, [{ entryId: await entryId('work'), choice: 'app' }]);
    expect((await sync()).push).toMatchObject({ updated: 1, conflicts: 0 });
    expect(google.events.get('work')).toMatchObject({ summary: 'deep work', start: { dateTime: '2026-10-05T13:00:00.000Z' } });
  });

  it('deleted in Google, edited in the app: keep app recreates the event', async () => {
    await db.query("update time_entries set notes = 'keep me' where gcal_event_id = 'gym'");
    const id = await entryId('gym');
    google.cancel('gym');
    expect((await sync()).pull.conflicts).toBe(1);
    expect((await listConflicts(db))[0].google.deleted).toBe(true);
    await resolveConflicts(db, [{ entryId: id, choice: 'app' }]);
    expect((await sync()).push.created).toBe(1);
    const [row] = await db.query<{ gcal_event_id: string }>('select gcal_event_id from time_entries where id = $1', [id]);
    expect(google.events.get(row.gcal_event_id)).toMatchObject({ description: 'keep me', summary: 'exercise' });
  });

  it('deleted in Google, edited in the app: keep Google deletes the entry', async () => {
    await db.query("update time_entries set notes = 'x' where gcal_event_id = 'gym'");
    google.cancel('gym');
    await sync();
    await resolveConflicts(db, [{ entryId: await entryId('gym'), choice: 'google' }]);
    const [row] = await db.query<{ deleted: boolean }>("select deleted_at is not null as deleted from time_entries where gcal_event_id = 'gym'");
    expect(row.deleted).toBe(true);
    expect((await sync()).push).toMatchObject({ created: 0, deleted: 0 });
  });

  it('deleted in the app, edited in Google: keep app deletes the event; keep Google restores the entry', async () => {
    const id = await entryId('work');
    await db.query('update time_entries set deleted_at = now() where id = $1', [id]);
    google.set(ev('work', 'work', '10-05T10:00', '10-05T17:00', '8'));
    await sync();
    expect((await listConflicts(db))[0].app.deleted).toBe(true);

    await resolveConflicts(db, [{ entryId: id, choice: 'google' }]);
    const [row] = await db.query<{ deleted: boolean }>('select deleted_at is not null as deleted from time_entries where id = $1', [id]);
    expect(row.deleted).toBe(false);
    expect((await sync()).push.deleted).toBe(0);
  });
});
