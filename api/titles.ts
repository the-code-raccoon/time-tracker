import { getDb } from '../server/db.js';
import { authed, json } from '../server/http.js';
import { listTitleSuggestions } from '../server/repositories/entries.js';

/** GET /api/titles — past titles for autocomplete. */
export const GET = authed(async () => json(await listTitleSuggestions(getDb())));
