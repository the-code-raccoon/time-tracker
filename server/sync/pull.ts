import type { PullSummary } from '../../shared/types.js';
import type { Db } from '../db.js';
import type { GoogleEnv } from '../env.js';
import { listAllEvents, SyncTokenExpiredError, type GoogleEvent } from '../google/calendar.js';
import { getAccessToken, getSyncState } from '../repositories/google.js';
import { classifyEvent, remoteHash, type ColourMap, type EntryFields } from './mapping.js';

export type { PullSummary };

export class NotConnectedError extends Error {}

type LinkedEntry = {
  id: string;
  gcal_event_id: string;
  app_hash: string;
  last_synced_hash: string | null;
  gcal_remote_hash: string | null;
  deleted_at: Date | null;
};

// Rows go to Postgres as one JSON text parameter (`$1::text::jsonb`) so each batch is a single statement.
const asJson = (rows: unknown[]) => JSON.stringify(rows);

const ENTRY_COLUMNS = `title text, raw_title text, starts_at timestamptz, ends_at timestamptz, category_id uuid, notes text,
  gcal_event_id text, gcal_etag text, gcal_color_id text, gcal_remote_hash text`;

async function loadContext(db: Db): Promise<{ aliases: Map<string, string>; colours: ColourMap }> {
  const aliases = new Map(
    (await db.query<{ alias: string; title: string }>('select alias, title from title_aliases')).map((r) => [r.alias, r.title]),
  );
  const categories = await db.query<{ id: string; gcal_color_id: string | null }>(
    'select id, gcal_color_id from categories order by sort_order',
  );
  const legacy = await db.query<{ gcal_color_id: string; category_id: string }>('select gcal_color_id, category_id from gcal_color_map');
  const fixed = await db.query<{ title: string; category_id: string }>('select title, category_id from title_categories');
  const byColor = new Map(legacy.map((r) => [r.gcal_color_id, r.category_id]));
  for (const c of categories) if (c.gcal_color_id && !byColor.has(c.gcal_color_id)) byColor.set(c.gcal_color_id, c.id);
  return {
    aliases,
    colours: {
      byColor,
      defaultCategoryId: categories.find((c) => c.gcal_color_id === null)?.id ?? null,
      byTitle: new Map(fixed.map((r) => [r.title, r.category_id])),
    },
  };
}

async function fetchChanges(db: Db, env: GoogleEnv) {
  const accessToken = await getAccessToken(db, env);
  if (!accessToken) throw new NotConnectedError('Google Calendar is not connected');
  const { sync_token: syncToken, full_import_done_at: firstImportDone } = await getSyncState(db);
  try {
    return { ...(await listAllEvents(accessToken, env.calendarId, syncToken)), full: !syncToken, firstImport: !firstImportDone };
  } catch (error) {
    if (!(error instanceof SyncTokenExpiredError)) throw error;
    return { ...(await listAllEvents(accessToken, env.calendarId, null)), full: true, firstImport: !firstImportDone };
  }
}

/**
 * Pulls changes from Google Calendar (SYNC-2). Changes only made in Google are applied; entries changed on
 * both sides are recorded in sync_conflicts and left alone (SYNC-5, SYNC-6). The sync token is saved last,
 * so a failed pull is simply repeated next time.
 */
export async function pull(db: Db, env: GoogleEnv): Promise<PullSummary> {
  const { events, nextSyncToken, full, firstImport, calendarName } = await fetchChanges(db, env);
  const { aliases, colours } = await loadContext(db);

  const ids = [...new Set(events.map((e) => e.id))];
  const linked = new Map(
    (
      await db.query<LinkedEntry>(
        `select id, gcal_event_id, app_hash, last_synced_hash, gcal_remote_hash, deleted_at from time_entries
          where gcal_event_id in (select jsonb_array_elements_text($1::text::jsonb))`,
        [asJson(ids)],
      )
    ).map((row) => [row.gcal_event_id, row]),
  );

  const inserts: EntryFields[] = [];
  const updates: (EntryFields & { id: string })[] = [];
  const deletes: { id: string; hash: string }[] = [];
  const seen: { id: string; hash: string }[] = [];
  const conflicts: { entry_id: string; remote_event: GoogleEvent }[] = [];
  let skipped = 0;

  for (const event of events) {
    const result = classifyEvent(event, aliases, colours);
    const entry = linked.get(event.id);

    if (!entry) {
      if (result.kind === 'entry') inserts.push(result.fields);
      else if (result.kind === 'skip') skipped++;
      continue;
    }

    const hash = remoteHash(event);
    if (entry.gcal_remote_hash === hash) continue; // nothing changed in Google

    const changedInApp = entry.deleted_at !== null || entry.app_hash !== entry.last_synced_hash;
    const removedInGoogle = result.kind !== 'entry';

    if (!changedInApp) {
      if (removedInGoogle) deletes.push({ id: entry.id, hash });
      else updates.push({ ...result.fields, id: entry.id });
    } else if (removedInGoogle && entry.deleted_at !== null) {
      seen.push({ id: entry.id, hash }); // deleted on both sides: nothing to reconcile
    } else {
      conflicts.push({ entry_id: entry.id, remote_event: event });
    }
  }

  if (inserts.length > 0) {
    await db.query(
      `insert into time_entries (title, raw_title, starts_at, ends_at, category_id, notes, gcal_event_id, gcal_etag, gcal_color_id, gcal_remote_hash)
       select title, raw_title, starts_at, ends_at, category_id, notes, gcal_event_id, gcal_etag, gcal_color_id, gcal_remote_hash
         from jsonb_to_recordset($1::text::jsonb) as x(${ENTRY_COLUMNS})
       on conflict (gcal_event_id) do nothing`,
      [asJson(inserts)],
    );
  }
  if (updates.length > 0) {
    await db.query(
      `update time_entries e set title = x.title, raw_title = x.raw_title, starts_at = x.starts_at, ends_at = x.ends_at,
              category_id = x.category_id, notes = x.notes, gcal_etag = x.gcal_etag, gcal_color_id = x.gcal_color_id,
              gcal_remote_hash = x.gcal_remote_hash, updated_at = now()
         from jsonb_to_recordset($1::text::jsonb) as x(id uuid, ${ENTRY_COLUMNS})
        where e.id = x.id`,
      [asJson(updates)],
    );
  }
  if (deletes.length > 0 || seen.length > 0) {
    await db.query(
      `update time_entries e set deleted_at = coalesce(e.deleted_at, now()), gcal_remote_hash = x.hash, updated_at = now()
         from jsonb_to_recordset($1::text::jsonb) as x(id uuid, hash text)
        where e.id = x.id`,
      [asJson([...deletes, ...seen])],
    );
  }
  if (conflicts.length > 0) {
    await db.query(
      `insert into sync_conflicts (entry_id, remote_event)
       select entry_id, remote_event from jsonb_to_recordset($1::text::jsonb) as x(entry_id uuid, remote_event jsonb)
       on conflict (entry_id) do update set remote_event = excluded.remote_event, detected_at = now()`,
      [asJson(conflicts)],
    );
  }

  // NORM-8, first import only: an activity seen in several colours takes the category of its most recent entry.
  if (firstImport) {
    await db.query(
      `with latest as (
         select distinct on (title) title, category_id from time_entries
          where deleted_at is null and gcal_event_id is not null
          order by title, starts_at desc
       )
       update time_entries e set category_id = latest.category_id
         from latest
        where e.title = latest.title and e.gcal_event_id is not null and e.deleted_at is null
          and e.category_id is distinct from latest.category_id`,
    );
  }

  // Everything just written now matches Google: record that as the synced state.
  const synced = [...inserts.map((i) => i.gcal_event_id), ...updates.map((u) => u.gcal_event_id)];
  const syncedIds = [...deletes, ...seen].map((d) => d.id);
  await db.query(
    `update time_entries set last_synced_hash = app_hash, last_synced_at = now()
      where gcal_event_id in (select jsonb_array_elements_text($1::text::jsonb))
         or id in (select (jsonb_array_elements_text($2::text::jsonb))::uuid)
         or ($3::boolean and gcal_event_id is not null and deleted_at is null and last_synced_hash is null)`,
    [asJson(synced), asJson(syncedIds), firstImport],
  );
  // Entries that Google changed and the app accepted no longer conflict.
  await db.query(
    `delete from sync_conflicts where entry_id in (select (jsonb_array_elements_text($1::text::jsonb))::uuid)`,
    [asJson([...updates.map((u) => u.id), ...syncedIds])],
  );

  await db.query(
    `update sync_state set sync_token = $1, last_pull_at = now(),
            full_import_done_at = coalesce(full_import_done_at, now()) where id = 1`,
    [nextSyncToken],
  );

  return {
    full,
    fetched: events.length,
    imported: inserts.length,
    updated: updates.length,
    deleted: deletes.length,
    conflicts: conflicts.length,
    skipped,
    calendarName,
  };
}
