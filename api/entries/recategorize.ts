import { getDb } from '../../server/db.js';
import { authed, json, readJson } from '../../server/http.js';
import { canonicalizeTitle, moveEntriesByTitle } from '../../server/repositories/entries.js';
import { asRecord, parseOptionalUuid, parseTitle } from '../../server/validation.js';

/** POST /api/entries/recategorize { title, categoryId } — move every entry with a title to a category (CAT-12). */
export const POST = authed(async (request) => {
  const body = asRecord(await readJson(request));
  const db = getDb();
  const title = await canonicalizeTitle(db, parseTitle(body.title));
  const moved = await moveEntriesByTitle(db, title, parseOptionalUuid(body.categoryId, 'categoryId'));
  return json({ moved });
});
