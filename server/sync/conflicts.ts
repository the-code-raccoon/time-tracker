import type { Conflict, ConflictChoice, ConflictSide } from '../../shared/types.js';
import type { Db } from '../db.js';
import type { GoogleEvent } from '../google/calendar.js';
import { classifyEvent, remoteHash } from './mapping.js';
import { loadContext } from './pull.js';

type Row = {
  entry_id: string;
  remote_event: GoogleEvent;
  detected_at: Date;
  title: string;
  starts_at: Date;
  ends_at: Date;
  category_id: string | null;
  notes: string | null;
  deleted_at: Date | null;
};

const SELECT = `select c.entry_id, c.remote_event, c.detected_at, e.title, e.starts_at, e.ends_at, e.category_id, e.notes, e.deleted_at
                  from sync_conflicts c join time_entries e on e.id = c.entry_id`;

/** SYNC-7: each conflict as two comparable sides. Google's side is mapped the same way an import would map it. */
export async function listConflicts(db: Db): Promise<Conflict[]> {
  const rows = await db.query<Row>(`${SELECT} order by e.starts_at`);
  if (rows.length === 0) return [];
  const { aliases, colours } = await loadContext(db);
  return rows.map((row) => {
    const app: ConflictSide = {
      deleted: row.deleted_at !== null,
      title: row.title,
      start: new Date(row.starts_at).toISOString(),
      end: new Date(row.ends_at).toISOString(),
      categoryId: row.category_id,
      notes: row.notes,
    };
    const mapped = classifyEvent(row.remote_event, aliases, colours);
    const google: ConflictSide =
      mapped.kind === 'entry'
        ? {
            deleted: false,
            title: mapped.fields.title,
            start: mapped.fields.starts_at,
            end: mapped.fields.ends_at,
            categoryId: mapped.fields.category_id,
            notes: mapped.fields.notes,
            rawTitle: row.remote_event.summary ?? null,
          }
        : { deleted: true, title: null, start: null, end: null, categoryId: null, notes: null };
    return { entryId: row.entry_id, detectedAt: new Date(row.detected_at).toISOString(), app, google };
  });
}

/**
 * Applies the user's choices (SYNC-7):
 * - `google`: the entry takes Google's version (or is deleted if Google deleted it) and is marked in sync.
 * - `app`: the entry keeps the app's version; it's marked as having seen Google's version, so the next push
 *   overwrites (or deletes) the event. If Google had deleted the event, the next push recreates it.
 */
export async function resolveConflicts(db: Db, choices: { entryId: string; choice: ConflictChoice }[]): Promise<number> {
  const rows = await db.query<Row>(`${SELECT} where c.entry_id in (select (jsonb_array_elements_text($1::text::jsonb))::uuid)`, [
    JSON.stringify(choices.map((c) => c.entryId)),
  ]);
  const byId = new Map(rows.map((row) => [row.entry_id, row]));
  const { aliases, colours } = await loadContext(db);
  let resolved = 0;

  for (const { entryId, choice } of choices) {
    const row = byId.get(entryId);
    if (!row) continue;
    const event = row.remote_event;
    const mapped = classifyEvent(event, aliases, colours);

    if (choice === 'google') {
      if (mapped.kind === 'entry') {
        const f = mapped.fields;
        await db.query(
          `update time_entries set title = $2, raw_title = $3, starts_at = $4, ends_at = $5, category_id = $6, notes = $7,
                  gcal_etag = $8, gcal_color_id = $9, gcal_remote_hash = $10, gcal_event = $11::text::jsonb, deleted_at = null, updated_at = now()
            where id = $1`,
          [entryId, f.title, f.raw_title, f.starts_at, f.ends_at, f.category_id, f.notes, f.gcal_etag, f.gcal_color_id, f.gcal_remote_hash, JSON.stringify(event)],
        );
      } else {
        await db.query(
          `update time_entries set deleted_at = coalesce(deleted_at, now()), gcal_remote_hash = $2, updated_at = now() where id = $1`,
          [entryId, remoteHash(event)],
        );
      }
      await db.query('update time_entries set last_synced_hash = app_hash, last_synced_category_id = category_id, last_synced_at = now() where id = $1', [entryId]);
    } else if (mapped.kind === 'entry') {
      // Keep the app's version: accept Google's etag so the push's If-Match succeeds, and leave the entry "changed".
      await db.query(
        `update time_entries set gcal_etag = $2, gcal_color_id = $3, gcal_remote_hash = $4, gcal_event = $5::text::jsonb,
                last_synced_hash = case when app_hash = last_synced_hash then null else last_synced_hash end
          where id = $1`,
        [entryId, event.etag ?? null, event.colorId ?? null, remoteHash(event), JSON.stringify(event)],
      );
    } else if (row.deleted_at === null) {
      // Google deleted it but the app keeps it: unlink so the next push creates a new event.
      await db.query(
        `update time_entries set gcal_event_id = null, gcal_etag = null, gcal_event = null, gcal_remote_hash = null,
                last_synced_hash = null, last_synced_at = null where id = $1`,
        [entryId],
      );
    } else {
      // Both sides ended up deleted.
      await db.query('update time_entries set last_synced_hash = app_hash, last_synced_category_id = category_id, last_synced_at = now() where id = $1', [entryId]);
    }
    await db.query('delete from sync_conflicts where entry_id = $1', [entryId]);
    resolved++;
  }
  return resolved;
}
