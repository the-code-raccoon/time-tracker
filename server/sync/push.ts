import type { PushSummary } from '../../shared/types.js';
import type { Db } from '../db.js';
import type { GoogleEnv } from '../env.js';
import {
  deleteEvent,
  EventChangedError,
  getEvent,
  insertEvent,
  patchEvent,
  type EventWrite,
  type GoogleEvent,
} from '../google/calendar.js';
import { pruneBackups } from '../repositories/backups.js';
import { getAccessToken } from '../repositories/google.js';
import { canonicalTitle, remoteHash } from './mapping.js';
import { loadContext, NotConnectedError } from './pull.js';

export type { PushSummary };

type PendingRow = {
  id: string;
  title: string;
  raw_title: string | null;
  starts_at: Date;
  ends_at: Date;
  category_id: string | null;
  notes: string | null;
  deleted_at: Date | null;
  last_synced_hash: string | null;
  last_synced_category_id: string | null;
  gcal_event_id: string | null;
  gcal_etag: string | null;
  gcal_color_id: string | null;
  gcal_event: GoogleEvent | null;
};

type Kind = 'create' | 'update' | 'delete';
const kindOf = (row: PendingRow): Kind => (row.gcal_event_id === null ? 'create' : row.deleted_at !== null ? 'delete' : 'update');

/** Entries with app changes Google doesn't have yet (SYNC-3), excluding unresolved conflicts. */
async function pendingChanges(db: Db): Promise<PendingRow[]> {
  return db.query<PendingRow>(
    `select id, title, raw_title, starts_at, ends_at, category_id, notes, deleted_at, last_synced_hash, last_synced_category_id,
            gcal_event_id, gcal_etag, gcal_color_id, gcal_event
       from time_entries e
      where not exists (select 1 from sync_conflicts c where c.entry_id = e.id)
        and (
          (gcal_event_id is null and deleted_at is null)
          or (gcal_event_id is not null and deleted_at is null and app_hash is distinct from last_synced_hash)
          or (gcal_event_id is not null and deleted_at is not null and (last_synced_at is null or deleted_at > last_synced_at))
        )
      order by starts_at`,
  );
}

/**
 * The colour to write. A new event takes its category's colour. An existing event is recoloured only if its
 * category was changed in the app since the last sync, or a CAT-4 colour change forced it (last_synced_hash
 * cleared), so imported events keep their colours (NORM-8, legacy colours, fixed title categories).
 */
function colourChange(row: PendingRow, categoryColour: Map<string, string | null>): { colorId?: string | null } {
  if (row.category_id === null || !categoryColour.has(row.category_id)) return {};
  const recategorised = row.last_synced_hash === null || row.category_id !== row.last_synced_category_id;
  if (row.gcal_event_id !== null && !recategorised) return {};
  return { colorId: categoryColour.get(row.category_id) ?? null };
}

function eventBody(row: PendingRow, aliases: Map<string, string>, categoryColour: Map<string, string | null>): EventWrite {
  const times = { start: { dateTime: new Date(row.starts_at).toISOString() }, end: { dateTime: new Date(row.ends_at).toISOString() } };
  if (row.gcal_event_id === null) {
    const colour = colourChange(row, categoryColour);
    return { summary: row.title, ...times, ...(row.notes ? { description: row.notes } : {}), ...(colour.colorId ? colour : {}) };
  }
  // NORM-6: an existing event keeps its own title unless the title was changed in the app.
  const titleChanged = row.title !== canonicalTitle(row.raw_title ?? undefined, aliases);
  const remoteNotes = row.gcal_event?.description?.trim() ? row.gcal_event.description : null;
  return {
    ...(titleChanged ? { summary: row.title } : {}),
    ...times,
    ...(row.notes !== remoteNotes ? { description: row.notes } : {}),
    ...colourChange(row, categoryColour),
  };
}

/** Records what Google now has for an entry, marking it in sync. */
async function markPushed(db: Db, id: string, event: GoogleEvent): Promise<void> {
  await db.query(
    `update time_entries set gcal_event_id = $2, gcal_etag = $3, gcal_color_id = $4, gcal_remote_hash = $5, gcal_event = $6::text::jsonb,
            raw_title = coalesce($7, raw_title), last_synced_hash = app_hash, last_synced_category_id = category_id, last_synced_at = now()
      where id = $1`,
    [id, event.id, event.etag ?? null, event.colorId ?? null, remoteHash(event), JSON.stringify(event), event.summary ?? null],
  );
}

async function recordConflict(db: Db, id: string, event: GoogleEvent): Promise<void> {
  await db.query(
    `insert into sync_conflicts (entry_id, remote_event) values ($1, $2::text::jsonb)
     on conflict (entry_id) do update set remote_event = excluded.remote_event, detected_at = now()`,
    [id, JSON.stringify(event)],
  );
}

/** BAK-1: snapshot of the entries and the Google events about to be changed or deleted. */
async function backupBeforePush(db: Db, rows: PendingRow[], fetchEvent: (id: string) => Promise<GoogleEvent>): Promise<void> {
  const touched = rows.filter((row) => kindOf(row) !== 'create');
  if (touched.length === 0) return;
  const events = await Promise.all(touched.map((row) => row.gcal_event ?? fetchEvent(row.gcal_event_id!)));
  await db.query(
    `insert into backups (trigger, description, entries, events)
     select 'pre-sync', $1, coalesce(jsonb_agg(to_jsonb(e) - 'gcal_event'), '[]'::jsonb), $2::text::jsonb
       from time_entries e where e.id in (select (jsonb_array_elements_text($3::text::jsonb))::uuid)`,
    [`Before pushing ${touched.length} change${touched.length === 1 ? '' : 's'} to Google Calendar`, JSON.stringify(events), JSON.stringify(touched.map((r) => r.id))],
  );
  await pruneBackups(db);
}

/** Runs `tasks` with a small concurrency limit, starting no new task once `deadline` has passed. Returns how many never started. */
async function runPool(tasks: (() => Promise<void>)[], concurrency: number, deadline: number): Promise<number> {
  let next = 0;
  let skipped = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const task = tasks[next++];
      if (Date.now() > deadline) {
        skipped++;
        continue;
      }
      await task();
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return skipped;
}

export type PushOptions = { budgetMs?: number; concurrency?: number };

/**
 * Pushes app changes to Google Calendar (SYNC-3): creates, patches and deletes events.
 * Patches and deletes use the last-seen etag; if Google changed the event meanwhile, the entry becomes a conflict.
 * Stops starting new requests after `budgetMs` so it fits in a serverless request; the rest go next time.
 */
export async function push(db: Db, env: GoogleEnv, { budgetMs = 40_000, concurrency = 6 }: PushOptions = {}): Promise<PushSummary> {
  const accessToken = await getAccessToken(db, env);
  if (!accessToken) throw new NotConnectedError('Google Calendar is not connected');
  const deadline = Date.now() + budgetMs;

  const rows = await pendingChanges(db);
  const summary: PushSummary = { created: 0, updated: 0, deleted: 0, conflicts: 0, remaining: 0, failed: [] };
  if (rows.length === 0) return summary;

  const { aliases } = await loadContext(db);
  const categoryColour = new Map(
    (await db.query<{ id: string; gcal_color_id: string | null }>('select id, gcal_color_id from categories')).map((c) => [c.id, c.gcal_color_id]),
  );
  const fetchEvent = (id: string) => getEvent(accessToken, env.calendarId, id);
  await backupBeforePush(db, rows, fetchEvent);

  const tasks = rows.map((row) => async () => {
    const kind = kindOf(row);
    try {
      if (kind === 'create') {
        await markPushed(db, row.id, await insertEvent(accessToken, env.calendarId, eventBody(row, aliases, categoryColour)));
        summary.created++;
      } else if (kind === 'update') {
        const body = eventBody(row, aliases, categoryColour);
        await markPushed(db, row.id, await patchEvent(accessToken, env.calendarId, row.gcal_event_id!, body, row.gcal_etag));
        summary.updated++;
      } else {
        await deleteEvent(accessToken, env.calendarId, row.gcal_event_id!, row.gcal_etag);
        await db.query('update time_entries set last_synced_hash = app_hash, last_synced_category_id = category_id, last_synced_at = now() where id = $1', [row.id]);
        summary.deleted++;
      }
    } catch (error) {
      if (error instanceof EventChangedError) {
        // Changed or deleted in Google since the last pull: let the user reconcile (SYNC-5).
        await recordConflict(db, row.id, await fetchEvent(row.gcal_event_id!));
        summary.conflicts++;
      } else {
        summary.failed.push({ entryId: row.id, title: row.title, error: error instanceof Error ? error.message : String(error) });
      }
    }
  });

  summary.remaining = await runPool(tasks, concurrency, deadline);
  return summary;
}
