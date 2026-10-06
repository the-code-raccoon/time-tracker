import type { Db } from '../db.js';

export const BACKUP_RETENTION_DAYS = 30;

/** BAK-3: deletes backups older than 30 days. */
export async function pruneBackups(db: Db): Promise<void> {
  await db.query(`delete from backups where created_at < now() - ($1::int * interval '1 day')`, [BACKUP_RETENTION_DAYS]);
}

/**
 * BAK-2: one full snapshot a day — every entry and every Google event as last seen — taken the first time
 * the app is used that day (Toronto time). Returns whether a snapshot was taken.
 */
export async function ensureDailyBackup(db: Db): Promise<boolean> {
  const [{ exists }] = await db.query<{ exists: boolean }>(
    `select exists (select 1 from backups where trigger = 'daily'
       and (created_at at time zone 'America/Toronto')::date = (now() at time zone 'America/Toronto')::date) as exists`,
  );
  if (exists) return false;
  await db.query(
    `insert into backups (trigger, description, entries, events)
     select 'daily', 'Daily backup',
            coalesce(jsonb_agg(to_jsonb(e) - 'gcal_event'), '[]'::jsonb),
            coalesce(jsonb_agg(e.gcal_event) filter (where e.gcal_event is not null and e.deleted_at is null), '[]'::jsonb)
       from time_entries e`,
  );
  await pruneBackups(db);
  return true;
}
