import { getDb } from '../../db.js';
import { HttpError, authed, json, readJson } from '../../http.js';
import { resolveConflicts } from '../../sync/conflicts.js';
import { asRecord, parseUuid } from '../../validation.js';
import type { ConflictChoice } from '../../../shared/types.js';

/** POST /api/sync/resolve { resolutions: [{ entryId, choice: 'app' | 'google' }] } — the next sync applies them. */
export const POST = authed(async (request) => {
  const { resolutions } = asRecord(await readJson(request));
  if (!Array.isArray(resolutions) || resolutions.length === 0) throw new HttpError(400, 'resolutions must be a non-empty array');
  const parsed = resolutions.map((item) => {
    const { entryId, choice } = asRecord(item);
    if (choice !== 'app' && choice !== 'google') throw new HttpError(400, "choice must be 'app' or 'google'");
    return { entryId: parseUuid(String(entryId), 'entryId'), choice: choice as ConflictChoice };
  });
  return json({ resolved: await resolveConflicts(getDb(), parsed) });
});
