import { describe, expect, it } from 'vitest';
import { migrate } from './migrate.js';
import { createTestDb } from './testing/testDb.js';

describe('migrate', () => {
  it('applies each migration once', async () => {
    const db = await createTestDb(); // already migrated
    expect(await migrate(db)).toEqual([]);
    const rows = await db.query<{ name: string }>('select name from schema_migrations');
    expect(rows.map((r) => r.name)).toContain('0001_init.sql');
    await db.close();
  });

  it('enables row level security on every table', async () => {
    const db = await createTestDb();
    const rows = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'`,
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((r) => !r.relrowsecurity)).toEqual([]);
    await db.close();
  });
});
