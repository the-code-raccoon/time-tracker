import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GoogleEnv } from '../env.js';
import type { GoogleEvent } from '../google/calendar.js';
import { ensureDailyBackup } from '../repositories/backups.js';
import { saveAccount } from '../repositories/google.js';
import { fakeGoogle, type FakeGoogle } from '../testing/fakeGoogle.js';
import { createTestDb, type TestDb } from '../testing/testDb.js';
import { listConflicts } from './conflicts.js';
import { pull } from './pull.js';
import { push } from './push.js';
import { getBackup, listBackups, restoreBackup } from './restore.js';

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
  start: { dateTime: `2026-10-05T${start}:00-04:00` },
  end: { dateTime: `2026-10-05T${end}:00-04:00` },
});
const entryOf = async (gcalId: string) =>
  (
    await db.query<{ id: string; title: string; starts_at: Date; deleted_at: Date | null; in_sync: boolean; gcal_event_id: string }>(
      `select id, title, starts_at, deleted_at, app_hash = last_synced_hash as in_sync, gcal_event_id from time_entries
        where gcal_event_id = $1 or raw_title = $1`,
      [gcalId],
    )
  )[0];
const sync = async () => ({ pull: await pull(db, ENV), push: await push(db, ENV) });
const latest = async (trigger: string) => (await listBackups(db)).find((b) => b.trigger === trigger)!;
const at = (time: string) => new Date(`2026-10-05T${time}:00-04:00`);

beforeEach(async () => {
  db = await createTestDb();
  google = fakeGoogle();
  await saveAccount(db, ENV, { access_token: 'a', expires_in: 3600, refresh_token: 'r', scope: 'calendar.events' }, null);
  google.set(ev('work', 'work', '09:00', '17:00', '8'));
  google.set(ev('lunch', 'make + eat lunch', '12:30', '13:00', '10'));
  google.set(ev('chill', 'chill', '20:00', '21:30', '7'));
  await pull(db, ENV);
  await ensureDailyBackup(db);
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await db.close();
});

describe('listing and comparing (BAK-4)', () => {
  it('lists backups with their size', async () => {
    expect(await listBackups(db)).toEqual([expect.objectContaining({ trigger: 'daily', entryCount: 3, eventCount: 3 })]);
  });

  it('pairs each entry with its event and says which copies differ from now', async () => {
    const { id } = await latest('daily');
    const work = await entryOf('work');
    await db.query("update time_entries set title = 'deep work' where id = $1", [work.id]); // changed in the app
    google.set(ev('chill', 'read manga', '20:00', '21:30', '7')); // changed in Google…
    await pull(db, ENV); // …and pulled, so the app has it too

    const backup = (await getBackup(db, id))!;
    const changes = Object.fromEntries(backup.items.map((item) => [item.app?.title, [item.appChanged, item.googleChanged]]));
    expect(changes).toEqual({ work: [true, false], 'make + eat lunch': [false, false], chill: [true, true] });
    const chill = backup.items.find((item) => item.app?.title === 'chill')!;
    expect(chill).toMatchObject({ eventId: 'chill', google: { title: 'chill', colorId: '7', deleted: false, start: at('20:00').toISOString() } });
  });

  it('returns null for an unknown backup', async () => {
    expect(await getBackup(db, '00000000-0000-4000-8000-000000000000')).toBeNull();
  });
});

describe('restoring (BAK-4)', () => {
  it('to the app: puts the entry back, and the next sync sends it to Google', async () => {
    const { id } = await latest('daily');
    const work = await entryOf('work');
    await db.query("update time_entries set title = 'deep work', starts_at = starts_at + interval '1 hour' where id = $1", [work.id]);
    await sync();
    const patches = google.requests('PATCH').length;

    const summary = await restoreBackup(db, null, id, 'app');
    expect(summary).toEqual({ app: 1, google: 0, unchanged: 2, remaining: 0, failed: [] });
    expect(await entryOf('work')).toMatchObject({ title: 'work', starts_at: at('09:00'), in_sync: false });
    expect(google.requests('PATCH')).toHaveLength(patches); // nothing written to Google yet

    expect((await sync()).push).toMatchObject({ updated: 1, conflicts: 0 });
    expect(google.events.get('work')).toMatchObject({ summary: 'work', start: { dateTime: at('09:00').toISOString() } });
  });

  it('to the app: an unsynced edit restored leaves nothing to push', async () => {
    const { id } = await latest('daily');
    await db.query("update time_entries set title = 'deep work' where gcal_event_id = 'work'");
    await restoreBackup(db, null, id, 'app');
    expect((await entryOf('work')).in_sync).toBe(true);
    expect((await sync()).push).toMatchObject({ created: 0, updated: 0 });
  });

  it('takes a backup of the current state first, and a second restore has nothing left to do', async () => {
    const { id } = await latest('daily');
    await db.query("update time_entries set notes = 'oops' where gcal_event_id = 'lunch'");
    await restoreBackup(db, null, id, 'app');
    const [before] = (await listBackups(db)).filter((b) => b.trigger === 'manual');
    expect(before.description).toMatch(/^Before restoring the backup from /);
    expect((await getBackup(db, before.id))!.items.map((item) => item.app?.notes)).toEqual(['oops']);
    expect(await restoreBackup(db, null, id, 'app')).toEqual({ app: 0, google: 0, unchanged: 3, remaining: 0, failed: [] });
  });

  it('undeletes an entry whose deletion already reached Google; the next sync re-creates its event', async () => {
    const { id } = await latest('daily');
    await db.query("update time_entries set deleted_at = now(), updated_at = now() where gcal_event_id = 'chill'");
    await sync();
    expect(google.events.get('chill')?.status).toBe('cancelled');

    await restoreBackup(db, null, id, 'app');
    const restored = (await db.query<{ deleted_at: Date | null; gcal_event_id: string | null }>("select deleted_at, gcal_event_id from time_entries where title = 'chill'"))[0];
    expect(restored).toEqual({ deleted_at: null, gcal_event_id: null });
    expect((await sync()).push.created).toBe(1);
  });

  it('only the chosen items', async () => {
    const { id } = await latest('daily');
    await db.query("update time_entries set notes = 'x'");
    const work = await entryOf('work');
    expect(await restoreBackup(db, null, id, 'app', { keys: [work.id] })).toMatchObject({ app: 1, unchanged: 0 });
    expect((await db.query<{ n: number }>("select count(*)::int as n from time_entries where notes = 'x'"))[0].n).toBe(2);
  });

  it('to Google: undoes a push; the next sync brings it into the app without a conflict', async () => {
    const work = await entryOf('work');
    await db.query("update time_entries set title = 'deep work' where id = $1", [work.id]);
    await sync(); // takes a pre-sync backup, then pushes
    expect(google.events.get('work')?.summary).toBe('deep work');

    const summary = await restoreBackup(db, ENV, (await latest('pre-sync')).id, 'google');
    expect(summary).toEqual({ app: 0, google: 1, unchanged: 0, remaining: 0, failed: [] });
    expect(google.events.get('work')).toMatchObject({ summary: 'work', colorId: '8' });
    expect((await entryOf('work')).title).toBe('deep work'); // the app follows on the next sync

    expect((await sync()).pull).toMatchObject({ updated: 1, conflicts: 0 });
    expect(await entryOf('work')).toMatchObject({ title: 'work', in_sync: true });
    expect((await sync()).push).toMatchObject({ created: 0, updated: 0 });
  });

  it('to Google: an app change made since becomes a conflict instead of being overwritten', async () => {
    const work = await entryOf('work');
    await db.query("update time_entries set title = 'deep work' where id = $1", [work.id]);
    await sync();
    await restoreBackup(db, ENV, (await latest('pre-sync')).id, 'google');
    await db.query("update time_entries set notes = 'edited meanwhile' where id = $1", [work.id]);
    expect((await sync()).pull.conflicts).toBe(1);
    expect(await listConflicts(db)).toHaveLength(1);
  });

  it('to both: brings back an event deleted in Google, re-created if needed, and in sync', async () => {
    const { id } = await latest('daily');
    google.cancel('lunch');
    await sync(); // the app deletes the entry too
    expect((await entryOf('lunch')).deleted_at).not.toBeNull();

    const summary = await restoreBackup(db, ENV, id, 'both');
    expect(summary).toMatchObject({ app: 1, google: 1, failed: [] });
    const lunch = (await db.query<{ deleted_at: Date | null; gcal_event_id: string; in_sync: boolean }>(
      "select deleted_at, gcal_event_id, app_hash = last_synced_hash as in_sync from time_entries where title = 'make + eat lunch'",
    ))[0];
    expect(lunch).toMatchObject({ deleted_at: null, in_sync: true });
    expect(google.events.get(lunch.gcal_event_id)).toMatchObject({ summary: 'make + eat lunch', colorId: '10', status: 'confirmed' });

    expect(await sync()).toMatchObject({ pull: { imported: 0, updated: 0, conflicts: 0 }, push: { created: 0, updated: 0, deleted: 0 } });
  });

  it('to Google: deletes an event the backup has as deleted', async () => {
    await db.query("update time_entries set deleted_at = now(), updated_at = now() where gcal_event_id = 'chill'");
    await sync(); // deletes in Google, after a pre-sync backup of the live event
    google.set(ev('chill', 'chill again', '20:00', '21:30', '7')); // …which then comes back in Google
    await pull(db, ENV);
    await db.query(
      `insert into backups (trigger, events) values ('manual', $1::text::jsonb)`,
      [JSON.stringify([{ id: 'chill', status: 'cancelled' }])],
    );
    const backup = (await listBackups(db)).find((b) => b.trigger === 'manual' && b.eventCount === 1)!;
    expect((await getBackup(db, backup.id))!.items).toEqual([expect.objectContaining({ key: 'event:chill', app: null, googleChanged: true })]);
    expect(await restoreBackup(db, ENV, backup.id, 'google')).toMatchObject({ google: 1 });
    expect(google.events.get('chill')?.status).toBe('cancelled');
  });

  it('needs Google Calendar to be connected to restore there', async () => {
    const { id } = await latest('daily');
    await expect(restoreBackup(db, null, id, 'google')).rejects.toThrow('not connected');
  });

  it('stops starting Google writes when the time runs out; restoring again carries on', async () => {
    const { id } = await latest('daily');
    for (const gcal of ['work', 'lunch', 'chill']) google.set({ ...google.events.get(gcal)!, summary: `${gcal}!` });
    await pull(db, ENV);
    expect(await restoreBackup(db, ENV, id, 'google', { budgetMs: -1 })).toMatchObject({ google: 0, remaining: 3 });
    expect(await restoreBackup(db, ENV, id, 'google')).toMatchObject({ google: 3, remaining: 0 });
    expect(await restoreBackup(db, ENV, id, 'google')).toMatchObject({ google: 0, unchanged: 3 });
  });
});
