import type { Db } from '../db.js';

export const BACKUP_RETENTION_DAYS = 30;

/** BAK-3: deletes backups older than 30 days. */
export async function pruneBackups(db: Db): Promise<void> {
  await db.query(`delete from backups where created_at < now() - ($1::int * interval '1 day')`, [BACKUP_RETENTION_DAYS]);
}
