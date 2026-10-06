import { PGlite, type PGliteInterface } from '@electric-sql/pglite';
import type { Db } from '../db.js';
import { migrate } from '../migrate.js';

export type TestDb = Db & { close(): Promise<void> };

function wrap(pg: PGliteInterface): TestDb {
  return {
    async query<T extends object>(text: string, params: unknown[] = []) {
      return (await pg.query<T>(text, params)).rows;
    },
    async exec(text) {
      await pg.exec(text);
    },
    close: () => pg.close(),
  };
}

let template: Promise<PGlite> | undefined;

/** A fresh in-memory Postgres (PGlite) with all migrations applied, cloned from a per-file migrated template. */
export async function createTestDb(): Promise<TestDb> {
  template ??= (async () => {
    const pg = new PGlite();
    await migrate(wrap(pg));
    return pg;
  })();
  return wrap(await (await template).clone());
}
