import type { TimeEntry, Timer, TimerInput } from '../../shared/types.js';
import type { Db } from '../db.js';
import { ENTRY_COLUMNS, toEntry, type EntryRow } from './entries.js';

type Row = { title: string; category_id: string | null; started_at: Date };

const toTimer = (row: Row): Timer => ({
  title: row.title,
  categoryId: row.category_id,
  startedAt: new Date(row.started_at).toISOString(),
});

export async function getTimer(db: Db): Promise<Timer | null> {
  const [row] = await db.query<Row>('select title, category_id, started_at from timer');
  return row ? toTimer(row) : null;
}

/** Starts the timer. Returns null when one is already running (it is left alone). */
export async function startTimer(db: Db, input: Required<TimerInput>): Promise<Timer | null> {
  const [row] = await db.query<Row>(
    `insert into timer (title, category_id, started_at) values ($1, $2, $3)
     on conflict (id) do nothing
     returning title, category_id, started_at`,
    [input.title, input.categoryId, input.startedAt],
  );
  return row ? toTimer(row) : null;
}

/** Edits the running timer. Returns null when none is running. */
export async function updateTimer(db: Db, patch: Partial<TimerInput>): Promise<Timer | null> {
  const columns: Record<keyof TimerInput, string> = { title: 'title', categoryId: 'category_id', startedAt: 'started_at' };
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [key, column] of Object.entries(columns) as [keyof TimerInput, string][]) {
    if (patch[key] !== undefined) {
      params.push(patch[key]);
      sets.push(`${column} = $${params.length}`);
    }
  }
  const [row] = await db.query<Row>(`update timer set ${sets.join(', ')} returning title, category_id, started_at`, params);
  return row ? toTimer(row) : null;
}

/** Throws the timer away without logging anything. Returns false when none was running. */
export async function discardTimer(db: Db): Promise<boolean> {
  return (await db.query('delete from timer returning id')).length > 0;
}

export type StopResult = { entry: TimeEntry } | { error: 'not-running' | 'too-long' };

/**
 * Stops the timer and logs it as an entry, in one statement so two devices stopping it at once can't log it twice.
 * Start and end are rounded to the nearest 5 minutes (TE-1b); the entry is at least 5 minutes long.
 * A timer that ran more than 24 hours (the longest entry allowed) is kept, so it can be edited or discarded.
 */
export async function stopTimer(db: Db): Promise<StopResult> {
  const [row] = await db.query<EntryRow>(
    `with stopped as (
       delete from timer where started_at >= now() - interval '24 hours' returning title, category_id, started_at
     ), rounded as (
       select title, category_id,
              date_bin('5 minutes', started_at + interval '150 seconds', timestamptz 'epoch') as starts_at,
              date_bin('5 minutes', now() + interval '150 seconds', timestamptz 'epoch') as ends_at
         from stopped
     )
     insert into time_entries (title, category_id, starts_at, ends_at)
     select title, category_id, starts_at, greatest(ends_at, starts_at + interval '5 minutes') from rounded
     returning ${ENTRY_COLUMNS}`,
  );
  if (row) return { entry: toEntry(row) };
  return { error: (await getTimer(db)) ? 'too-long' : 'not-running' };
}
