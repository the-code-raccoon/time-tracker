import { getDb } from '../../server/db.js';
import { HttpError, authed, json, lastPathSegment, readJson } from '../../server/http.js';
import { deleteEntry, getEntry, updateEntry } from '../../server/repositories/entries.js';
import { checkTimes, parseEntryPatch, parseUuid } from '../../server/validation.js';

/** PATCH /api/entries/:id — partial update. */
export const PATCH = authed(async (request) => {
  const db = getDb();
  const id = parseUuid(lastPathSegment(request));
  const patch = parseEntryPatch(await readJson(request));

  if (patch.start !== undefined || patch.end !== undefined) {
    const existing = await getEntry(db, id);
    if (!existing) throw new HttpError(404, 'Entry not found');
    checkTimes(patch.start ?? existing.start, patch.end ?? existing.end);
  }

  const entry = await updateEntry(db, id, patch);
  if (!entry) throw new HttpError(404, 'Entry not found');
  return json(entry);
});

/** DELETE /api/entries/:id — soft delete. */
export const DELETE = authed(async (request) => {
  const deleted = await deleteEntry(getDb(), parseUuid(lastPathSegment(request)));
  if (!deleted) throw new HttpError(404, 'Entry not found');
  return new Response(null, { status: 204 });
});
