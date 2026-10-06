import { getDb } from '../../server/db.js';
import { getGoogleEnv } from '../../server/env.js';
import { authed, json } from '../../server/http.js';
import { withSyncErrors } from '../../server/sync/errors.js';
import { pull } from '../../server/sync/pull.js';

/** POST /api/sync/pull — bring Google Calendar changes into the app only (SYNC-2). */
export const POST = authed(async () => json(await withSyncErrors(() => pull(getDb(), getGoogleEnv()))));
