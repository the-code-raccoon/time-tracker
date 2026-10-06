import { PGlite } from '@electric-sql/pglite';
import type { Db } from '../db.js';
import { migrate } from '../migrate.js';

export type TestDb = Db & { close(): Promise<void> };

/** A fresh in-memory Postgres (PGlite) with all migrations applied. */
export async function createTestDb(): Promise<TestDb> {
  const pg = new PGlite();
  const db: TestDb = {
    async query<T extends object>(text: string, params: unknown[] = []) {
      return (await pg.query<T>(text, params)).rows;
    },
    async exec(text) {
      await pg.exec(text);
    },
    close: () => pg.close(),
  };
  await migrate(db);
  return db;
}
