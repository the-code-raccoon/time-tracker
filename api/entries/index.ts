import { getDb } from '../../server/db.js';
import { authed, json, readJson } from '../../server/http.js';
import { createEntry, listEntries } from '../../server/repositories/entries.js';
import { parseEntryInput, parseRange } from '../../server/validation.js';

/** GET /api/entries?from=ISO&to=ISO — entries overlapping the range. */
export const GET = authed(async (request) => {
  const { from, to } = parseRange(new URL(request.url));
  return json(await listEntries(getDb(), from, to));
});

/** POST /api/entries — create an entry. */
export const POST = authed(async (request) => {
  const entry = await createEntry(getDb(), parseEntryInput(await readJson(request)));
  return json(entry, { status: 201 });
});
