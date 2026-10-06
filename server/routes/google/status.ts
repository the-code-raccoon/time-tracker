import { getDb } from '../../db.js';
import { getGoogleEnv, isGoogleConfigured } from '../../env.js';
import { authed, json } from '../../http.js';
import { getAccount, getSyncState } from '../../repositories/google.js';
import type { GoogleStatus } from '../../../shared/types.js';

/** GET /api/google/status — connection and sync status for the Settings page. */
export const GET = authed(async () => {
  if (!isGoogleConfigured()) return json({ configured: false, connected: false } satisfies GoogleStatus);
  const db = getDb();
  const [account, state, [{ count }]] = await Promise.all([
    getAccount(db),
    getSyncState(db),
    db.query<{ count: number }>('select count(*)::int as count from sync_conflicts'),
  ]);
  return json({
    configured: true,
    connected: !!account,
    email: account?.email ?? null,
    calendarId: getGoogleEnv().calendarId,
    lastPullAt: state.last_pull_at ? new Date(state.last_pull_at).toISOString() : null,
    pendingConflicts: count,
  } satisfies GoogleStatus);
});
