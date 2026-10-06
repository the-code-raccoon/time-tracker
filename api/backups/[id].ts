import { getDb } from '../../server/db.js';
import { getGoogleEnv, isGoogleConfigured } from '../../server/env.js';
import { HttpError, authed, json, lastPathSegment, readJson } from '../../server/http.js';
import { withSyncErrors } from '../../server/sync/errors.js';
import { getBackup, restoreBackup } from '../../server/sync/restore.js';
import { asRecord, parseUuid } from '../../server/validation.js';

/** GET /api/backups/:id — what the backup contains, compared with now. */
export const GET = authed(async (request) => {
  const backup = await getBackup(getDb(), parseUuid(lastPathSegment(request)));
  if (!backup) throw new HttpError(404, 'Backup not found');
  return json(backup);
});

/** POST /api/backups/:id { target: 'app' | 'google' | 'both', keys?: string[] } — restore all of it, or the items in `keys`. */
export const POST = authed(async (request) => {
  const id = parseUuid(lastPathSegment(request));
  const { target, keys } = asRecord(await readJson(request));
  if (target !== 'app' && target !== 'google' && target !== 'both') throw new HttpError(400, "target must be 'app', 'google' or 'both'");
  if (keys !== undefined && (!Array.isArray(keys) || keys.length === 0 || keys.some((key) => typeof key !== 'string'))) {
    throw new HttpError(400, 'keys must be a non-empty array of item keys');
  }
  const env = isGoogleConfigured() ? getGoogleEnv() : null;
  const summary = await withSyncErrors(() => restoreBackup(getDb(), env, id, target, { keys: (keys as string[] | undefined) ?? null }));
  if (!summary) throw new HttpError(404, 'Backup not found');
  return json(summary);
});
