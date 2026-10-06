import { getDb } from '../../server/db.js';
import { authed, json } from '../../server/http.js';
import { listBackups } from '../../server/sync/restore.js';

/** GET /api/backups — every backup, newest first (BAK-4). */
export const GET = authed(async () => json(await listBackups(getDb())));
