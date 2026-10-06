import { getDb } from '../../server/db.js';
import { authed, json, readJson } from '../../server/http.js';
import { canonicalizeTitle, createEntry, listEntries, searchEntries } from '../../server/repositories/entries.js';
import { parseEntryInput, parseRange, parseSearchQuery } from '../../server/validation.js';

/** GET /api/entries?from=ISO&to=ISO — entries overlapping the range; GET /api/entries?q=text — search, newest first. */
export const GET = authed(async (request) => {
  const url = new URL(request.url);
  const query = parseSearchQuery(url);
  if (query !== null) return json(await searchEntries(getDb(), query));
  const { from, to } = parseRange(url);
  return json(await listEntries(getDb(), from, to));
});

/** POST /api/entries — create an entry. */
export const POST = authed(async (request) => {
  const db = getDb();
  const input = parseEntryInput(await readJson(request));
  const entry = await createEntry(db, { ...input, title: await canonicalizeTitle(db, input.title) });
  return json(entry, { status: 201 });
});
