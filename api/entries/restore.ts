import { getDb } from '../../server/db.js';
import { HttpError, authed, json, readJson } from '../../server/http.js';
import { restoreEntry } from '../../server/repositories/entries.js';
import { asRecord, parseUuid } from '../../server/validation.js';

/** POST /api/entries/restore { id } — undo a delete (CTX-3). */
export const POST = authed(async (request) => {
  const { id } = asRecord(await readJson(request));
  const entry = await restoreEntry(getDb(), parseUuid(String(id)));
  if (!entry) throw new HttpError(404, 'No deleted entry with that id');
  return json(entry);
});
