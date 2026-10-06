import { getDb } from '../../server/db.js';
import { authed, json, readJson } from '../../server/http.js';
import { createCategory, listCategories } from '../../server/repositories/categories.js';
import { parseCategoryFields } from '../../server/validation.js';
import type { CategoryInput } from '../../shared/types.js';

/** GET /api/categories — all categories with entry counts and total time. */
export const GET = authed(async () => json(await listCategories(getDb())));

/** POST /api/categories — create a category. */
export const POST = authed(async (request) => {
  const input = parseCategoryFields(await readJson(request), { partial: false }) as CategoryInput;
  return json(await createCategory(getDb(), input), { status: 201 });
});
