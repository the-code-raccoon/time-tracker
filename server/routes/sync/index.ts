import { getDb } from '../../db.js';
import { getGoogleEnv } from '../../env.js';
import { authed, json } from '../../http.js';
import { ensureDailyBackup } from '../../repositories/backups.js';
import { withSyncErrors } from '../../sync/errors.js';
import { pull } from '../../sync/pull.js';
import { push } from '../../sync/push.js';
import type { SyncSummary } from '../../../shared/types.js';

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
