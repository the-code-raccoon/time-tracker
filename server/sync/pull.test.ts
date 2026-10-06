import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GoogleEnv } from '../env.js';
import type { GoogleEvent } from '../google/calendar.js';
import { saveAccount } from '../repositories/google.js';
import { fakeGoogle, type FakeGoogle } from '../testing/fakeGoogle.js';
import { createTestDb, type TestDb } from '../testing/testDb.js';
import { NotConnectedError, pull } from './pull.js';

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
  etag: `"${id}"`,
  start: { dateTime: `2026-${start}:00-04:00` },
  end: { dateTime: `2026-${end}:00-04:00` },
});

type Row = { title: string; raw_title: string | null; category: string | null; deleted: boolean; starts_at: Date; notes: string | null };
const rows = () =>
  db.query<Row>(
    `select e.title, e.raw_title, c.name as category, e.deleted_at is not null as deleted, e.starts_at, e.notes
       from time_entries e left join categories c on c.id = e.category_id order by e.starts_at, e.title`,
  );
const row = async (gcalId: string) =>
  (await db.query<Row & { id: string }>(
    `select e.id, e.title, c.name as category, e.deleted_at is not null as deleted, e.starts_at, e.notes from time_entries e
       left join categories c on c.id = e.category_id where gcal_event_id = $1`,
    [gcalId],
  ))[0];
const conflicts = () => db.query<{ entry_id: string; remote_event: GoogleEvent }>('select entry_id, remote_event from sync_conflicts');

beforeEach(async () => {
  db = await createTestDb();
  google = fakeGoogle();
  await saveAccount(db, ENV, { access_token: 'a', expires_in: 3600, refresh_token: 'refresh-token', scope: 'calendar.events' }, 'me@example.com');
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await db.close();
});

describe('first import', () => {
  it('imports timed events with normalised titles, aliases and colour categories', async () => {
    google.set(ev('a', 'Make+eat Lunch', '10-05T12:00', '10-05T12:35', '10'));
    google.set(ev('b', 'gym + cardio', '10-05T17:00', '10-05T18:15', '5'));
    google.set(ev('c', 'tiering', '10-05T19:00', '10-05T20:00', '1')); // legacy Lavender → Leisure
    google.set(ev('d', 'put in contacts', '10-05T07:55', '10-05T08:00')); // default colour
    google.set(ev('e', 'mystery', '10-05T21:00', '10-05T21:30', '2')); // Sage: no category
    google.set({ id: 'allday', summary: 'holiday', start: { date: '2026-10-12' }, end: { date: '2026-10-13' } });
    google.set(ev('zero', 'reminder', '10-05T09:00', '10-05T09:00'));
    google.cancel('gone');

    const summary = await pull(db, ENV);
    expect(summary).toMatchObject({ full: true, imported: 5, updated: 0, deleted: 0, conflicts: 0, skipped: 2, calendarName: 'Schedule' });
    expect((await rows()).map((r) => [r.title, r.category])).toEqual([
      ['put in contacts', 'Self-care / logistics'],
      ['make + eat lunch', 'Food'],
      ['exercise', 'Exercise'],
      ['tiering', 'Leisure'],
      ['mystery', null],
    ]);
    expect((await row('a')).title).toBe('make + eat lunch');
    expect((await rows()).find((r) => r.title === 'exercise')?.raw_title).toBe('gym + cardio');
  });

  it('gives an activity the category of its most recent colour (NORM-8)', async () => {
    google.set(ev('s1', 'shower', '04-20T09:00', '04-20T09:20', '7')); // spring: Peacock
    google.set(ev('s2', 'Shower', '06-10T09:00', '06-10T09:20', '2')); // Sage
    google.set(ev('s3', 'shower', '10-01T09:00', '10-01T09:20')); // now: default colour
    await pull(db, ENV);
    expect((await rows()).map((r) => r.category)).toEqual(['Self-care / logistics', 'Self-care / logistics', 'Self-care / logistics']);
  });

  it('puts every exercise alias in Exercise, whatever its colour (NORM-7)', async () => {
    google.set(ev('g1', 'gym', '05-01T17:00', '05-01T18:00', '5')); // older: Banana
    google.set(ev('g2', 'cardio', '09-01T17:00', '09-01T18:00')); // recent: no colour
    google.set(ev('g3', 'Gym + Cardio', '10-01T17:00', '10-01T18:00'));
    await pull(db, ENV);
    expect((await rows()).map((r) => [r.title, r.category])).toEqual([
      ['exercise', 'Exercise'],
      ['exercise', 'Exercise'],
      ['exercise', 'Exercise'],
    ]);
  });

  it('reads every page', async () => {
    google = fakeGoogle({ pageSize: 2 });
    await saveAccount(db, ENV, { access_token: 'a', expires_in: 3600, refresh_token: 'r' }, null);
    for (let i = 0; i < 5; i++) google.set(ev(`p${i}`, `task ${i}`, `10-0${i + 1}T09:00`, `10-0${i + 1}T10:00`));
    expect((await pull(db, ENV)).imported).toBe(5);
    expect(google.calls.filter((c) => c.url.pathname.endsWith('/events'))).toHaveLength(3);
  });

  it('marks imported entries as in sync, so a second pull changes nothing', async () => {
    google.set(ev('a', 'work', '10-05T09:00', '10-05T17:00', '8'));
    await pull(db, ENV);
    expect(await pull(db, ENV)).toMatchObject({ full: false, fetched: 0, imported: 0, updated: 0, conflicts: 0 });
  });
});

describe('incremental pull', () => {
  beforeEach(async () => {
    google.set(ev('a', 'work', '10-05T09:00', '10-05T17:00', '8'));
    google.set(ev('b', 'chill', '10-05T20:00', '10-05T21:00', '7'));
    await pull(db, ENV);
  });

  it('uses the sync token and applies changes made only in Google', async () => {
    google.set({ ...ev('a', 'work', '10-05T09:30', '10-05T17:00', '8'), description: 'late start' });
    google.cancel('b');
    google.set(ev('c', 'journal', '10-05T22:00', '10-05T22:15', '7'));

    const summary = await pull(db, ENV);
    expect(summary).toMatchObject({ full: false, fetched: 3, imported: 1, updated: 1, deleted: 1, conflicts: 0 });
    const events = google.calls.filter((c) => c.url.pathname.endsWith('/events'));
    expect(events.at(-1)?.url.searchParams.get('syncToken')).toMatch(/^v\d+$/);

    expect(await row('a')).toMatchObject({ notes: 'late start', deleted: false });
    expect(new Date((await row('a')).starts_at).toISOString()).toBe('2026-10-05T13:30:00.000Z');
    expect((await row('b')).deleted).toBe(true);
    expect((await row('c')).title).toBe('journal');
  });

  it('records a conflict when both sides changed, and leaves the entry alone (SYNC-5)', async () => {
    const { id } = await row('b');
    await db.query("update time_entries set title = 'nap', updated_at = now() where id = $1", [id]);
    google.set(ev('b', 'chill', '10-05T20:15', '10-05T21:00', '7'));

    expect((await pull(db, ENV)).conflicts).toBe(1);
    expect((await row('b')).title).toBe('nap');
    const [conflict] = await conflicts();
    expect(conflict.entry_id).toBe(id);
    expect(conflict.remote_event.start?.dateTime).toBe('2026-10-05T20:15:00-04:00');
  });

  it('records a conflict for edited in the app vs deleted in Google', async () => {
    const { id } = await row('b');
    await db.query("update time_entries set notes = 'keep me' where id = $1", [id]);
    google.cancel('b');
    expect((await pull(db, ENV)).conflicts).toBe(1);
    expect((await row('b')).deleted).toBe(false);
    expect((await conflicts())[0].remote_event.status).toBe('cancelled');
  });

  it('does not conflict when both sides deleted the entry', async () => {
    await db.query("update time_entries set deleted_at = now() where gcal_event_id = 'b'");
    google.cancel('b');
    expect((await pull(db, ENV)).conflicts).toBe(0);
    expect(await conflicts()).toEqual([]);
  });

  it('leaves app-only changes for the push (no conflict, nothing pulled)', async () => {
    await db.query("update time_entries set title = 'nap' where gcal_event_id = 'b'");
    expect(await pull(db, ENV)).toMatchObject({ fetched: 0, conflicts: 0 });
    expect((await row('b')).title).toBe('nap');
  });

  it('falls back to a full sync when the token expires (SYNC-9)', async () => {
    google.set(ev('a', 'work', '10-05T10:00', '10-05T17:00', '8'));
    google.expireSyncTokens();
    const summary = await pull(db, ENV);
    expect(summary).toMatchObject({ full: true, updated: 1, imported: 0 });
    expect(new Date((await row('a')).starts_at).toISOString()).toBe('2026-10-05T14:00:00.000Z');
  });

  it('does not re-apply NORM-8 after the first import', async () => {
    await db.query("update time_entries set category_id = (select id from categories where name = 'Food') where gcal_event_id = 'b'");
    await db.query("update time_entries set last_synced_hash = app_hash where gcal_event_id = 'b'");
    google.set(ev('d', 'chill', '10-06T20:00', '10-06T21:00', '7'));
    google.expireSyncTokens();
    await pull(db, ENV);
    expect((await row('b')).category).toBe('Food');
  });
});

describe('access tokens', () => {
  it('refreshes an expired access token and stores it', async () => {
    await db.query("update google_account set access_token_expires_at = now() - interval '1 minute'");
    google.set(ev('a', 'work', '10-05T09:00', '10-05T17:00', '8'));
    await pull(db, ENV);
    const refresh = google.calls.find((c) => c.url.pathname === '/token');
    expect(new URLSearchParams(String(refresh?.init?.body)).get('grant_type')).toBe('refresh_token');
    const [{ expires }] = await db.query<{ expires: Date }>('select access_token_expires_at as expires from google_account');
    expect(new Date(expires).getTime()).toBeGreaterThan(Date.now());
  });

  it('fails clearly when Google is not connected', async () => {
    await db.query('delete from google_account');
    await expect(pull(db, ENV)).rejects.toBeInstanceOf(NotConnectedError);
  });
});
