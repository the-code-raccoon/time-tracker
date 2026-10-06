import { getDb } from '../../db.js';
import { HttpError, authed, json, readJson } from '../../http.js';
import { restoreEntry } from '../../repositories/entries.js';
import { asRecord, parseUuid } from '../../validation.js';

/** POST /api/entries/restore { id } — undo a delete (CTX-3). */
export const POST = authed(async (request) => {
  const { id } = asRecord(await readJson(request));
  const entry = await restoreEntry(getDb(), parseUuid(String(id)));
  if (!entry) throw new HttpError(404, 'No deleted entry with that id');
  return json(entry);
});
