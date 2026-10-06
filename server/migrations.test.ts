import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR } from './migrate.js';
import { createTestDb } from './testing/testDb.js';

const sqlOf = (name: string) => readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8');

describe('0007_repair_norm8', () => {
  it('re-categorises untouched imported entries without making them pushable, and leaves edited ones alone', async () => {
    const db = await createTestDb();
    const cat = async (name: string) => (await db.query<{ id: string }>('select id from categories where name = $1', [name]))[0].id;
    const selfCare = await cat('Self-care / logistics');
    const leisure = await cat('Leisure');
    const insert = (gcalId: string, title: string, day: number, categoryId: string | null) =>
      db.query(
        `insert into time_entries (title, starts_at, ends_at, category_id, gcal_event_id)
         values ($1, make_timestamptz(2026, 9, $2, 9, 0, 0), make_timestamptz(2026, 9, $2, 10, 0, 0), $3, $4)`,
        [title, day, categoryId, gcalId],
      );
    // The buggy import: every "shower" uncategorised, except a newer, correctly categorised one is missing.
    await insert('s1', 'shower', 1, null);
    await insert('s2', 'shower', 2, null);
    await insert('s3', 'shower', 3, selfCare); // e.g. categorised by a later pull
    await insert('m1', 'misc', 4, null); // never had a mapped colour
    await insert('e1', 'shower', 5, null); // edited in the app after import → must not be marked synced
    await db.exec(`update time_entries set last_synced_hash = app_hash, last_synced_category_id = category_id`);
    await db.exec(`update time_entries set notes = 'edited', category_id = '${leisure}' where gcal_event_id = 'e1'`);

    await db.exec(`begin; ${sqlOf('0007_repair_norm8.sql')} commit;`);

    const rows = await db.query<{ gcal_event_id: string; category_id: string | null; in_sync: boolean; baseline: string | null }>(
      `select gcal_event_id, category_id, app_hash = last_synced_hash as in_sync, last_synced_category_id as baseline
         from time_entries order by gcal_event_id`,
    );
    expect(rows).toEqual([
      { gcal_event_id: 'e1', category_id: leisure, in_sync: false, baseline: null },
      { gcal_event_id: 'm1', category_id: null, in_sync: true, baseline: null },
      { gcal_event_id: 's1', category_id: selfCare, in_sync: true, baseline: selfCare },
      { gcal_event_id: 's2', category_id: selfCare, in_sync: true, baseline: selfCare },
      { gcal_event_id: 's3', category_id: selfCare, in_sync: true, baseline: selfCare },
    ]);
    await db.close();
  });
});

describe('0008_repair_norm8_from_colours', () => {
  it('re-derives categories from colours when every entry of a title lost its category', async () => {
    const db = await createTestDb();
    const insert = (gcalId: string, title: string, day: number, colour: string | null) =>
      db.query(
        `insert into time_entries (title, starts_at, ends_at, category_id, gcal_event_id, gcal_color_id)
         values ($1, make_timestamptz(2026, 9, $2, 9, 0, 0), make_timestamptz(2026, 9, $2, 10, 0, 0), null, $3, $4)`,
        [title, day, gcalId, colour],
      );
    await insert('s1', 'shower', 1, '7'); // Peacock → Leisure
    await insert('s2', 'shower', 2, null); // default → Self-care (most recent mapped)
    await insert('s3', 'shower', 3, '2'); // Sage → nothing (most recent overall)
    await insert('x1', 'cardio', 4, '2'); // fixed title category wins
    await db.exec("update time_entries set title = 'exercise' where gcal_event_id = 'x1'");
    await insert('m1', 'misc', 5, '2'); // never mapped → stays uncategorised
    await insert('e1', 'shower', 6, null);
    await db.exec('update time_entries set last_synced_hash = app_hash, last_synced_category_id = category_id');
    await db.exec("update time_entries set notes = 'edited' where gcal_event_id = 'e1'"); // edited after import: untouched

    await db.exec(`begin; ${sqlOf('0008_repair_norm8_from_colours.sql')} commit;`);

    const rows = await db.query<{ gcal_event_id: string; category: string | null; in_sync: boolean }>(
      `select e.gcal_event_id, c.name as category, e.app_hash = e.last_synced_hash as in_sync
         from time_entries e left join categories c on c.id = e.category_id order by e.gcal_event_id`,
    );
    expect(rows).toEqual([
      { gcal_event_id: 'e1', category: null, in_sync: false },
      { gcal_event_id: 'm1', category: null, in_sync: true },
      { gcal_event_id: 's1', category: 'Self-care / logistics', in_sync: true },
      { gcal_event_id: 's2', category: 'Self-care / logistics', in_sync: true },
      { gcal_event_id: 's3', category: 'Self-care / logistics', in_sync: true },
      { gcal_event_id: 'x1', category: 'Exercise', in_sync: true },
    ]);
    const [backup] = await db.query<{ n: number }>("select jsonb_array_length(entries) as n from backups where trigger = 'manual'");
    expect(backup.n).toBe(4);
    await db.close();
  });
});
