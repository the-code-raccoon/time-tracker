import type { TimeEntry, TimeEntryInput, TitleSuggestion } from '../../shared/types.js';
import type { Db } from '../db.js';
import { pruneBackups } from './backups.js';

type Row = {
  id: string;
  title: string;
  starts_at: Date;
  ends_at: Date;
  category_id: string | null;
  notes: string | null;
  gcal_event_id: string | null;
  updated_at: Date;
};

const COLUMNS = 'id, title, starts_at, ends_at, category_id, notes, gcal_event_id, updated_at';

function toEntry(row: Row): TimeEntry {
  return {
    id: row.id,
    title: row.title,
    start: new Date(row.starts_at).toISOString(),
    end: new Date(row.ends_at).toISOString(),
    categoryId: row.category_id,
    notes: row.notes,
    gcalEventId: row.gcal_event_id,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

/** Entries overlapping [from, to), including ones that start before `from` or cross midnight. */
export async function listEntries(db: Db, from: Date, to: Date): Promise<TimeEntry[]> {
  const rows = await db.query<Row>(
    `select ${COLUMNS} from time_entries
      where deleted_at is null and starts_at < $2 and ends_at > $1
      order by starts_at, ends_at`,
    [from.toISOString(), to.toISOString()],
  );
  return rows.map(toEntry);
}

export async function createEntry(db: Db, input: Required<TimeEntryInput>): Promise<TimeEntry> {
  const [row] = await db.query<Row>(
    `insert into time_entries (title, starts_at, ends_at, category_id, notes)
     values ($1, $2, $3, $4, $5)
     returning ${COLUMNS}`,
    [input.title, input.start, input.end, input.categoryId, input.notes],
  );
  return toEntry(row);
}

/** Applies a partial update. Returns null when the entry doesn't exist or is deleted. */
export async function updateEntry(db: Db, id: string, patch: Partial<TimeEntryInput>): Promise<TimeEntry | null> {
  const columns: Record<keyof TimeEntryInput, string> = {
    title: 'title',
    start: 'starts_at',
    end: 'ends_at',
    categoryId: 'category_id',
    notes: 'notes',
  };
  const sets: string[] = [];
  const params: unknown[] = [id];
  for (const [key, column] of Object.entries(columns) as [keyof TimeEntryInput, string][]) {
    if (patch[key] !== undefined) {
      params.push(patch[key]);
      sets.push(`${column} = $${params.length}`);
    }
  }
  sets.push('updated_at = now()');

  const [row] = await db.query<Row>(
    `update time_entries set ${sets.join(', ')}
      where id = $1 and deleted_at is null
      returning ${COLUMNS}`,
    params,
  );
  return row ? toEntry(row) : null;
}

/** Soft delete (kept so the deletion can be pushed to Google Calendar). Returns false if not found. */
export async function deleteEntry(db: Db, id: string): Promise<boolean> {
  const rows = await db.query(
    'update time_entries set deleted_at = now(), updated_at = now() where id = $1 and deleted_at is null returning id',
    [id],
  );
  return rows.length > 0;
}

export async function getEntry(db: Db, id: string): Promise<TimeEntry | null> {
  const [row] = await db.query<Row>(`select ${COLUMNS} from time_entries where id = $1 and deleted_at is null`, [id]);
  return row ? toEntry(row) : null;
}

/** Past titles for autocomplete (TE-1a), most used first, each with its most recent category. */
export async function listTitleSuggestions(db: Db, limit = 500): Promise<TitleSuggestion[]> {
  const rows = await db.query<{ title: string; category_id: string | null; count: number }>(
    `select title,
            (array_agg(category_id order by starts_at desc))[1] as category_id,
            count(*)::int as count
       from time_entries
      where deleted_at is null
      group by title
      order by count(*) desc, max(starts_at) desc
      limit $1`,
    [limit],
  );
  return rows.map((row) => ({ title: row.title, categoryId: row.category_id, count: row.count }));
}

/** Undoes a soft delete. Returns null when the entry doesn't exist or isn't deleted. */
export async function restoreEntry(db: Db, id: string): Promise<TimeEntry | null> {
  const [row] = await db.query<Row>(
    `update time_entries set deleted_at = null, updated_at = now()
      where id = $1 and deleted_at is not null
      returning ${COLUMNS}`,
    [id],
  );
  return row ? toEntry(row) : null;
}

/** CAT-12: moves every entry with this (normalised) title to a category, after taking a backup. */
export async function moveEntriesByTitle(db: Db, title: string, categoryId: string | null): Promise<number> {
  const moved = await db.query(
    `with snapshot as (
       insert into backups (trigger, description, entries)
       select 'bulk-move', 'Move "' || $1 || '" entries', coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb)
         from time_entries e where e.title = $1 and e.deleted_at is null
     )
     update time_entries set category_id = $2, updated_at = now()
      where title = $1 and deleted_at is null and category_id is distinct from $2
     returning id`,
    [title, categoryId],
  );
  await pruneBackups(db);
  return moved.length;
}

/** NORM-2: maps an already-normalised title through the alias table (e.g. "gym" → "exercise"). */
export async function canonicalizeTitle(db: Db, title: string): Promise<string> {
  const [row] = await db.query<{ title: string }>('select title from title_aliases where alias = $1', [title]);
  return row?.title ?? title;
}
