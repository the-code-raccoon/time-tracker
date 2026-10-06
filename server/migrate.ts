import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Db } from './db.js';

export const MIGRATIONS_DIR = path.join(import.meta.dirname, '..', 'db', 'migrations');

/** Applies every not-yet-applied `db/migrations/*.sql` file in name order. Returns the names applied. */
export async function migrate(db: Db, dir = MIGRATIONS_DIR): Promise<string[]> {
  await db.exec(`
    create table if not exists schema_migrations (
      name       text primary key,
      applied_at timestamptz not null default now()
    );
    alter table schema_migrations enable row level security;
  `);
  const applied = new Set((await db.query<{ name: string }>('select name from schema_migrations')).map((r) => r.name));
  const pending = (await readdir(dir)).filter((file) => file.endsWith('.sql') && !applied.has(file)).sort();

  for (const name of pending) {
    const body = await readFile(path.join(dir, name), 'utf8');
    const escaped = name.replaceAll("'", "''");
    await db.exec(`begin;\n${body}\ninsert into schema_migrations (name) values ('${escaped}');\ncommit;`);
  }
  return pending;
}
