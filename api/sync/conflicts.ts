import { getDb } from '../../server/db.js';
import { authed, json } from '../../server/http.js';
import { listConflicts } from '../../server/sync/conflicts.js';

/** GET /api/sync/conflicts — entries changed both in the app and in Google (SYNC-7). */
export const GET = authed(async () => json(await listConflicts(getDb())));
