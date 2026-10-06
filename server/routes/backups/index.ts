import { getDb } from '../../db.js';
import { authed, json } from '../../http.js';
import { listBackups } from '../../sync/restore.js';

/** GET /api/backups — every backup, newest first (BAK-4). */
export const GET = authed(async () => json(await listBackups(getDb())));
