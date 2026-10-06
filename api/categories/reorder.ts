import { getDb } from '../../server/db.js';
import { HttpError, authed, json, readJson } from '../../server/http.js';
import { listCategories, listCategoryIds, reorderCategories } from '../../server/repositories/categories.js';
import { asRecord, parseUuid } from '../../server/validation.js';

/** POST /api/categories/reorder { ids } — every category id, in the new order (CAT-8). */
export const POST = authed(async (request) => {
  const { ids } = asRecord(await readJson(request));
  if (!Array.isArray(ids)) throw new HttpError(400, 'ids must be an array');
  const parsed = ids.map((id) => parseUuid(String(id)));

  const db = getDb();
  const existing = await listCategoryIds(db);
  if (parsed.length !== existing.length || new Set(parsed).size !== parsed.length || !existing.every((id) => parsed.includes(id))) {
    throw new HttpError(400, 'ids must list every category exactly once');
  }
  await reorderCategories(db, parsed);
  return json(await listCategories(db));
});
