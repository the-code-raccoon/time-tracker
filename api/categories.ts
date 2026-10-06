import { getDb } from '../server/db.js';
import { authed, json } from '../server/http.js';
import { listCategories } from '../server/repositories/categories.js';

export const GET = authed(async () => json(await listCategories(getDb())));
