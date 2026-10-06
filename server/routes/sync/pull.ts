import { getDb } from '../../db.js';
import { getGoogleEnv } from '../../env.js';
import { authed, json } from '../../http.js';
import { withSyncErrors } from '../../sync/errors.js';
import { pull } from '../../sync/pull.js';

/** POST /api/sync/pull — bring Google Calendar changes into the app only (SYNC-2). */
export const POST = authed(async () => json(await withSyncErrors(() => pull(getDb(), getGoogleEnv()))));
