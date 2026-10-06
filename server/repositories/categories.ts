import type { Category, CategoryInput } from '../../shared/types.js';
import type { Db } from '../db.js';
import { pruneBackups } from './backups.js';

type Row = {
  id: string;
  name: string;
  app_color: string;
  gcal_color_id: string | null;
  sort_order: number;
  entry_count: number;
  total_minutes: number;
  synced_count: number;
};

const toCategory = (row: Row): Category => ({
  id: row.id,
  name: row.name,
  appColor: row.app_color,
  gcalColorId: row.gcal_color_id,
  sortOrder: row.sort_order,
  entryCount: row.entry_count,
  totalMinutes: row.total_minutes,
  syncedCount: row.synced_count,
});

const SELECT = `
  select c.id, c.name, c.app_color, c.gcal_color_id, c.sort_order,
         count(e.id)::int as entry_count,
         coalesce(round(sum(extract(epoch from e.ends_at - e.starts_at)) / 60), 0)::int as total_minutes,
         count(e.gcal_event_id)::int as synced_count
    from categories c
    left join time_entries e on e.category_id = c.id and e.deleted_at is null`;

export async function listCategories(db: Db): Promise<Category[]> {
  return (await db.query<Row>(`${SELECT} group by c.id order by c.sort_order, c.name`)).map(toCategory);
}

export async function getCategory(db: Db, id: string): Promise<Category | null> {
  const [row] = await db.query<Row>(`${SELECT} where c.id = $1 group by c.id`, [id]);
  return row ? toCategory(row) : null;
}

/**
 * CAT-13: uncategorised imported entries whose Google colour is now this category's colour join the category.
 * Their events already have that colour, so they're recorded as in sync (nothing to push). Returns how many joined.
 */
export async function adoptUncategorised(db: Db, categoryId: string, gcalColorId: string | null): Promise<number> {
  const adopted = await db.query<{ id: string }>(
    `update time_entries set category_id = $1, updated_at = now()
      where category_id is null and deleted_at is null and gcal_event_id is not null
        and gcal_color_id is not distinct from $2
        and last_synced_hash is not distinct from app_hash
     returning id`,
    [categoryId, gcalColorId],
  );
  if (adopted.length > 0) {
    await db.query(
      `update time_entries set last_synced_hash = app_hash, last_synced_category_id = category_id
        where id in (select (jsonb_array_elements_text($1::text::jsonb))::uuid)`,
      [JSON.stringify(adopted.map((row) => row.id))],
    );
  }
  return adopted.length;
}

export async function createCategory(db: Db, input: CategoryInput): Promise<Category> {
  const [{ id }] = await db.query<{ id: string }>(
    `insert into categories (name, app_color, gcal_color_id, sort_order)
     values ($1, $2, $3, (select coalesce(max(sort_order), 0) + 1 from categories))
     returning id`,
    [input.name, input.appColor, input.gcalColorId],
  );
  await adoptUncategorised(db, id, input.gcalColorId);
  return (await getCategory(db, id))!;
}

export async function updateCategory(db: Db, id: string, patch: Partial<CategoryInput>): Promise<Category | null> {
  const columns = { name: 'name', appColor: 'app_color', gcalColorId: 'gcal_color_id' } as const;
  const sets = ['updated_at = now()'];
  const params: unknown[] = [id];
  for (const [key, column] of Object.entries(columns) as [keyof CategoryInput, string][]) {
    if (patch[key] !== undefined) {
      params.push(patch[key]);
      sets.push(`${column} = $${params.length}`);
    }
  }
  const [before] = await db.query<{ gcal_color_id: string | null }>('select gcal_color_id from categories where id = $1', [id]);
  if (!before) return null;
  await db.query(`update categories set ${sets.join(', ')} where id = $1`, params);

  // CAT-4: entries whose GCal colour changes count as modified (last_synced_hash cleared), so the next push recolours their events.
  if (patch.gcalColorId !== undefined && patch.gcalColorId !== before.gcal_color_id) {
    await db.query(
      'update time_entries set updated_at = now(), last_synced_hash = null where category_id = $1 and deleted_at is null',
      [id],
    );
    await adoptUncategorised(db, id, patch.gcalColorId);
  }
  return getCategory(db, id);
}

/**
 * CAT-11: deletes a category (or merges it into `moveTo`), moving its entries first.
 * A backup of the affected entries is taken in the same statement as the move.
 */
export async function deleteCategory(db: Db, id: string, moveTo: string | null): Promise<number | null> {
  const [category] = await db.query<{ name: string }>('select name from categories where id = $1', [id]);
  if (!category) return null;
  const description = moveTo ? `Merge "${category.name}"` : `Delete "${category.name}"`;
  const moved = await db.query(
    `with snapshot as (
       insert into backups (trigger, description, entries)
       select 'category-change', $3, coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb)
         from time_entries e where e.category_id = $1
     )
     update time_entries set category_id = $2, updated_at = now()
      where category_id = $1
     returning id`,
    [id, moveTo, description],
  );
  await db.query('delete from categories where id = $1', [id]);
  await pruneBackups(db);
  return moved.length;
}

/**
 * Sets sort_order from the position of each id. `ids` must list every category.
 * The ids go in as JSON text (`$1::text::jsonb`): typed as jsonb, postgres.js would JSON-encode the string again.
 */
export async function reorderCategories(db: Db, ids: string[]): Promise<void> {
  await db.query(
    `update categories c set sort_order = x.ord, updated_at = now()
       from jsonb_array_elements_text($1::text::jsonb) with ordinality as x(id, ord)
      where c.id = x.id::uuid`,
    [JSON.stringify(ids)],
  );
}

export async function listCategoryIds(db: Db): Promise<string[]> {
  return (await db.query<{ id: string }>('select id from categories')).map((row) => row.id);
}
