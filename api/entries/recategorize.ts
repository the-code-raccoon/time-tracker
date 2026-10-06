import { getDb } from '../../server/db.js';
import { authed, json, readJson } from '../../server/http.js';
import { moveEntriesByTitle } from '../../server/repositories/entries.js';
import { asRecord, parseOptionalUuid, parseTitle } from '../../server/validation.js';

/** POST /api/entries/recategorize { title, categoryId } — move every entry with a title to a category (CAT-12). */
export const POST = authed(async (request) => {
  const body = asRecord(await readJson(request));
  const moved = await moveEntriesByTitle(getDb(), parseTitle(body.title), parseOptionalUuid(body.categoryId, 'categoryId'));
  return json({ moved });
});
