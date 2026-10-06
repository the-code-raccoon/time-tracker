import { getDb } from '../db.js';
import { authed, json } from '../http.js';
import { listTitleSuggestions } from '../repositories/entries.js';

/** GET /api/titles — past titles for autocomplete. */
export const GET = authed(async () => json(await listTitleSuggestions(getDb())));
