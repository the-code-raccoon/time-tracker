import { getDb } from '../../server/db.js';
import { getGoogleEnv } from '../../server/env.js';
import { authed, json } from '../../server/http.js';
import { ensureDailyBackup } from '../../server/repositories/backups.js';
import { withSyncErrors } from '../../server/sync/errors.js';
import { pull } from '../../server/sync/pull.js';
import { push } from '../../server/sync/push.js';
import type { SyncSummary } from '../../shared/types.js';

/**
 * POST /api/sync — two-way sync (SYNC-1): pull Google's changes first (which detects conflicts),
 * then push the app's changes that don't conflict.
 */
export const POST = authed(async () => {
  const db = getDb();
  const env = getGoogleEnv();
  await ensureDailyBackup(db);
  const summary: SyncSummary = await withSyncErrors(async () => {
    const pulled = await pull(db, env);
    return { pull: pulled, push: await push(db, env) };
  });
  return json(summary);
});
