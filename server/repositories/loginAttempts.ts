import type { Db } from '../db.js';

export async function countRecentFailures(db: Db, ip: string, windowMs: number): Promise<number> {
  const [row] = await db.query<{ count: number }>(
    `select count(*)::int as count from login_attempts
      where ip = $1 and attempted_at > now() - ($2::int * interval '1 millisecond')`,
    [ip, windowMs],
  );
  return row.count;
}

export async function recordFailure(db: Db, ip: string): Promise<void> {
  await db.query('insert into login_attempts (ip) values ($1)', [ip]);
  // Opportunistic cleanup; the table only needs the last day.
  await db.query("delete from login_attempts where attempted_at < now() - interval '1 day'");
}

export async function clearFailures(db: Db, ip: string): Promise<void> {
  await db.query('delete from login_attempts where ip = $1', [ip]);
}
