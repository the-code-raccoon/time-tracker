import type { BackupCopy, BackupDetail, BackupItem, BackupSummary, BackupTrigger, RestoreSummary, RestoreTarget } from '../../shared/types.js';
import type { Db } from '../db.js';
import type { GoogleEnv } from '../env.js';
import { deleteEvent, EventChangedError, insertEvent, patchEvent, type EventWrite, type GoogleEvent } from '../google/calendar.js';
import { pruneBackups } from '../repositories/backups.js';
import { getAccessToken } from '../repositories/google.js';
import { remoteHash } from './mapping.js';
import { NotConnectedError, pull } from './pull.js';
import { runPool } from './push.js';

/** A `time_entries` row as stored in a backup (`to_jsonb(e)`); older backups lack the sync columns. */
type EntrySnapshot = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  category_id: string | null;
  notes: string | null;
  deleted_at: string | null;
  gcal_event_id?: string | null;
  app_hash?: string | null;
  last_synced_hash?: string | null;
  gcal_remote_hash?: string | null;
};

type BackupRow = {
  id: string;
  created_at: Date;
  trigger: BackupTrigger;
  description: string | null;
  entry_count: number;
  event_count: number;
};

type CurrentEntry = {
  id: string;
  title: string;
  starts_at: Date;
  ends_at: Date;
  category_id: string | null;
  notes: string | null;
  deleted_at: Date | null;
  gcal_event_id: string | null;
  gcal_remote_hash: string | null;
  gcal_event: GoogleEvent | null;
};

const toSummary = (row: BackupRow): BackupSummary => ({
  id: row.id,
  createdAt: new Date(row.created_at).toISOString(),
  trigger: row.trigger,
  description: row.description,
  entryCount: row.entry_count,
  eventCount: row.event_count,
});

/** BAK-4: every backup, newest first. Backups past 30 days are deleted first (BAK-3). */
export async function listBackups(db: Db): Promise<BackupSummary[]> {
  await pruneBackups(db);
  const rows = await db.query<BackupRow>(
    `select id, created_at, trigger, description, jsonb_array_length(entries) as entry_count, jsonb_array_length(events) as event_count
       from backups order by created_at desc`,
  );
  return rows.map(toSummary);
}

const iso = (value: string | Date | null | undefined) => (value ? new Date(value).toISOString() : null);

function appCopy(entry: EntrySnapshot): BackupCopy {
  return {
    deleted: entry.deleted_at !== null,
    title: entry.title,
    start: iso(entry.starts_at),
    end: iso(entry.ends_at),
    categoryId: entry.category_id,
    notes: entry.notes,
  };
}

function googleCopy(event: GoogleEvent): BackupCopy {
  return {
    deleted: event.status === 'cancelled',
    title: event.summary ?? null,
    start: iso(event.start?.dateTime),
    end: iso(event.end?.dateTime),
    categoryId: null,
    notes: event.description?.trim() ? event.description : null,
    colorId: event.colorId ?? null,
  };
}

/** Same title, times, category, notes and deleted-ness. */
function sameEntry(snapshot: EntrySnapshot, current: CurrentEntry | undefined): boolean {
  if (!current) return snapshot.deleted_at !== null;
  return (
    snapshot.title === current.title &&
    Date.parse(snapshot.starts_at) === new Date(current.starts_at).getTime() &&
    Date.parse(snapshot.ends_at) === new Date(current.ends_at).getTime() &&
    snapshot.category_id === current.category_id &&
    (snapshot.notes ?? null) === (current.notes ?? null) &&
    (snapshot.deleted_at !== null) === (current.deleted_at !== null)
  );
}

/** Same as far as the app is concerned; times are compared as instants (Google formats them in different ways). */
function sameEvent(a: GoogleEvent, b: GoogleEvent): boolean {
  const deleted = (e: GoogleEvent) => e.status === 'cancelled';
  if (deleted(a) || deleted(b)) return deleted(a) === deleted(b);
  const time = (t: GoogleEvent['start']) => (t?.dateTime ? Date.parse(t.dateTime) : (t?.date ?? null));
  return (
    (a.summary ?? '') === (b.summary ?? '') &&
    (a.description ?? '') === (b.description ?? '') &&
    (a.colorId ?? null) === (b.colorId ?? null) &&
    time(a.start) === time(b.start) &&
    time(a.end) === time(b.end)
  );
}

/** Google's copy differs from what Google had at the last sync (or the event isn't linked to any entry). */
function googleChanged(event: GoogleEvent, linked: CurrentEntry | undefined): boolean {
  if (!linked) return event.status !== 'cancelled';
  if (linked.gcal_event) return !sameEvent(event, linked.gcal_event);
  return remoteHash(event) !== linked.gcal_remote_hash;
}

type Loaded = { summary: BackupSummary; items: (BackupItem & { entry?: EntrySnapshot; event?: GoogleEvent; linkedId?: string })[] };

async function load(db: Db, id: string): Promise<Loaded | null> {
  const [row] = await db.query<BackupRow & { entries: EntrySnapshot[]; events: GoogleEvent[] }>(
    `select id, created_at, trigger, description, entries, events,
            jsonb_array_length(entries) as entry_count, jsonb_array_length(events) as event_count
       from backups where id = $1`,
    [id],
  );
  if (!row) return null;
  const events = row.events.filter((e) => e.status === 'cancelled' || e.start?.dateTime); // all-day events aren't entries
  const current = await db.query<CurrentEntry>(
    `select id, title, starts_at, ends_at, category_id, notes, deleted_at, gcal_event_id, gcal_remote_hash, gcal_event
       from time_entries
      where id in (select (jsonb_array_elements_text($1::text::jsonb))::uuid)
         or gcal_event_id in (select jsonb_array_elements_text($2::text::jsonb))`,
    [JSON.stringify(row.entries.map((e) => e.id)), JSON.stringify(events.map((e) => e.id))],
  );
  const byId = new Map(current.map((e) => [e.id, e]));
  const byEvent = new Map(current.filter((e) => e.gcal_event_id).map((e) => [e.gcal_event_id!, e]));
  const eventsById = new Map(events.map((e) => [e.id, e]));

  const items: Loaded['items'] = row.entries.map((entry) => {
    const event = entry.gcal_event_id ? eventsById.get(entry.gcal_event_id) : undefined;
    if (event) eventsById.delete(event.id);
    const linked = event ? byEvent.get(event.id) : undefined;
    return {
      key: entry.id,
      entryId: entry.id,
      eventId: event?.id ?? entry.gcal_event_id ?? null,
      app: appCopy(entry),
      google: event ? googleCopy(event) : null,
      appChanged: !sameEntry(entry, byId.get(entry.id)),
      googleChanged: event ? googleChanged(event, linked) : false,
      entry,
      event,
      linkedId: linked?.id,
    };
  });
  for (const event of eventsById.values()) {
    const linked = byEvent.get(event.id);
    items.push({
      key: `event:${event.id}`,
      entryId: linked?.id ?? null,
      eventId: event.id,
      app: null,
      google: googleCopy(event),
      appChanged: false,
      googleChanged: googleChanged(event, linked),
      event,
      linkedId: linked?.id,
    });
  }
  items.sort((a, b) => ((a.app ?? a.google)?.start ?? '').localeCompare((b.app ?? b.google)?.start ?? ''));
  return { summary: toSummary(row), items };
}

/** BAK-4: what a backup contains, each item compared with now. */
export async function getBackup(db: Db, id: string): Promise<BackupDetail | null> {
  const loaded = await load(db, id);
  if (!loaded) return null;
  return { ...loaded.summary, items: loaded.items.map(({ entry: _e, event: _v, linkedId: _l, ...item }) => item) };
}

/**
 * Puts entries back as they were in the backup. An entry whose deletion already reached Google is unlinked from the
 * deleted event, so the next push creates a new one (as `restoreEntry` does). Categories deleted since become none.
 */
async function restoreEntries(db: Db, entries: EntrySnapshot[]): Promise<void> {
  if (entries.length === 0) return;
  const rows = JSON.stringify(entries.map((e) => ({ ...e, deleted: e.deleted_at !== null })));
  await db.query(
    `with snap as (
       select * from jsonb_to_recordset($1::text::jsonb)
         as s(id uuid, title text, starts_at timestamptz, ends_at timestamptz, category_id uuid, notes text, deleted boolean)
     ), state as (
       select s.*, (not s.deleted and e.deleted_at is not null and e.gcal_event_id is not null
                    and e.last_synced_at is not null and e.deleted_at <= e.last_synced_at) as gone
         from snap s join time_entries e on e.id = s.id
     ), updated as (
       update time_entries e set
              title = s.title, starts_at = s.starts_at, ends_at = s.ends_at, notes = s.notes,
              category_id = (select c.id from categories c where c.id = s.category_id),
              deleted_at = case when s.deleted then coalesce(e.deleted_at, now()) end,
              gcal_event_id    = case when s.gone then null else e.gcal_event_id end,
              gcal_etag        = case when s.gone then null else e.gcal_etag end,
              gcal_event       = case when s.gone then null else e.gcal_event end,
              gcal_remote_hash = case when s.gone then null else e.gcal_remote_hash end,
              last_synced_hash = case when s.gone then null else e.last_synced_hash end,
              last_synced_at   = case when s.gone then null else e.last_synced_at end,
              updated_at = now()
         from state s
        where e.id = s.id
       returning e.id
     )
     insert into time_entries (id, title, starts_at, ends_at, category_id, notes)
     select s.id, s.title, s.starts_at, s.ends_at, (select c.id from categories c where c.id = s.category_id), s.notes
       from snap s
      where not s.deleted and not exists (select 1 from time_entries e where e.id = s.id)`,
    [rows],
  );
}

/** BAK-1 for restores: the current state of everything about to be overwritten. */
async function backupBeforeRestore(db: Db, summary: BackupSummary, entryIds: string[], events: GoogleEvent[]): Promise<void> {
  const when = new Date(summary.createdAt).toLocaleString('en-CA', { timeZone: 'America/Toronto', dateStyle: 'medium', timeStyle: 'short' });
  await db.query(
    `insert into backups (trigger, description, entries, events)
     select 'manual', $1, coalesce(jsonb_agg(to_jsonb(e) - 'gcal_event'), '[]'::jsonb), $2::text::jsonb
       from time_entries e where e.id in (select (jsonb_array_elements_text($3::text::jsonb))::uuid)`,
    [`Before restoring the backup from ${when}`, JSON.stringify(events), JSON.stringify(entryIds)],
  );
  await pruneBackups(db);
}

const toWrite = (event: GoogleEvent): EventWrite => ({
  status: 'confirmed',
  summary: event.summary ?? '',
  description: event.description ?? null,
  colorId: event.colorId ?? null,
  start: { dateTime: event.start!.dateTime! },
  end: { dateTime: event.end!.dateTime! },
});

export type RestoreOptions = { keys?: string[] | null; budgetMs?: number; concurrency?: number };

/**
 * BAK-4: restores a backup, or the items in `keys`, to the app, to Google Calendar, or to both.
 * - app: entries go back to the backup's app copy; the next sync sends them to Google.
 * - google: events go back to the backup's Google copy (deleted ones are brought back or re-created); the next sync
 *   brings them into the app, or flags a conflict if the app changed them since.
 * - both: both of the above. An entry whose two copies were in sync when the backup was taken is marked in sync.
 * Only items that differ from now are written, so restoring again after a timeout carries on where it stopped.
 * A backup of the current state is taken first. Returns null if there's no such backup.
 */
export async function restoreBackup(
  db: Db,
  env: GoogleEnv | null,
  id: string,
  target: RestoreTarget,
  { keys = null, budgetMs = 40_000, concurrency = 3 }: RestoreOptions = {},
): Promise<RestoreSummary | null> {
  const toApp = target !== 'google';
  const toGoogle = target !== 'app';
  let accessToken: string | null = null;
  if (toGoogle) {
    accessToken = env && (await getAccessToken(db, env));
    if (!env || !accessToken) throw new NotConnectedError('Google Calendar is not connected');
    await pull(db, env); // compare with what Google has now, not at the last sync
  }
  const deadline = Date.now() + budgetMs;

  const loaded = await load(db, id);
  if (!loaded) return null;
  const wanted = keys ? new Set(keys) : null;
  const items = loaded.items.filter((item) => !wanted || wanted.has(item.key));
  const appItems = toApp ? items.filter((item) => item.entry && item.appChanged) : [];
  const googleItems = toGoogle ? items.filter((item) => item.event && item.googleChanged) : [];
  const summary: RestoreSummary = { app: 0, google: 0, unchanged: 0, remaining: 0, failed: [] };
  summary.unchanged = items.filter(
    (item) => !(toApp && item.entry && item.appChanged) && !(toGoogle && item.event && item.googleChanged),
  ).length;
  if (appItems.length === 0 && googleItems.length === 0) return summary;

  const linkedEvents = await db.query<{ gcal_event: GoogleEvent }>(
    `select gcal_event from time_entries where gcal_event is not null and id in (select (jsonb_array_elements_text($1::text::jsonb))::uuid)`,
    [JSON.stringify(googleItems.map((item) => item.linkedId).filter(Boolean))],
  );
  await backupBeforeRestore(
    db,
    loaded.summary,
    [...appItems.map((item) => item.entry!.id), ...googleItems.flatMap((item) => (item.linkedId ? [item.linkedId] : []))],
    linkedEvents.map((row) => row.gcal_event),
  );

  await restoreEntries(db, appItems.map((item) => item.entry!));
  summary.app = appItems.length;

  const tasks = googleItems.map((item) => async () => {
    const event = item.event!;
    try {
      let written: GoogleEvent;
      if (event.status === 'cancelled') {
        await deleteEvent(accessToken!, env!.calendarId, event.id, null);
        written = { id: event.id, status: 'cancelled' };
      } else {
        try {
          written = await patchEvent(accessToken!, env!.calendarId, event.id, toWrite(event), null);
        } catch (error) {
          if (!(error instanceof EventChangedError && error.gone)) throw error;
          const { status: _status, ...fresh } = toWrite(event);
          written = await insertEvent(accessToken!, env!.calendarId, fresh);
        }
      }
      // Record the event as written but keep the hash of what was last synced, so the next pull sees the change.
      const entryId = item.linkedId ?? (toApp ? item.entryId : null);
      if (entryId) {
        await db.query(`update time_entries set gcal_event_id = $2, gcal_etag = $3, gcal_event = $4::text::jsonb where id = $1`, [
          entryId,
          written.id,
          written.etag ?? null,
          JSON.stringify(written),
        ]);
        const pairInSync =
          toApp && item.entry?.app_hash && item.entry.app_hash === item.entry.last_synced_hash && item.entry.gcal_remote_hash === remoteHash(event);
        if (pairInSync) {
          await db.query(
            `update time_entries set gcal_remote_hash = $2, gcal_color_id = $3, last_synced_hash = app_hash,
                    last_synced_category_id = category_id, last_synced_at = now()
              where id = $1`,
            [entryId, remoteHash(written), written.colorId ?? null],
          );
          await db.query('delete from sync_conflicts where entry_id = $1', [entryId]);
        }
      }
      summary.google++;
    } catch (error) {
      summary.failed.push({
        key: item.key,
        title: event.summary ?? item.app?.title ?? '(no title)',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
  summary.remaining = await runPool(tasks, concurrency, deadline);
  return summary;
}
