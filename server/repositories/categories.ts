import type { Category } from '../../shared/types.js';
import type { Db } from '../db.js';

type Row = { id: string; name: string; app_color: string; gcal_color_id: string | null; sort_order: number };

export async function listCategories(db: Db): Promise<Category[]> {
  const rows = await db.query<Row>(
    'select id, name, app_color, gcal_color_id, sort_order from categories order by sort_order, name',
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    appColor: row.app_color,
    gcalColorId: row.gcal_color_id,
    sortOrder: row.sort_order,
  }));
}
