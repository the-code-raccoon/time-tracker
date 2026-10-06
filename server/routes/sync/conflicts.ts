import { getDb } from '../../db.js';
import { authed, json } from '../../http.js';
import { listConflicts } from '../../sync/conflicts.js';

/** GET /api/sync/conflicts — entries changed both in the app and in Google (SYNC-7). */
export const GET = authed(async () => json(await listConflicts(getDb())));
