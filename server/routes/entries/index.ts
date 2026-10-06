import { getDb } from '../../db.js';
import { authed, json, readJson } from '../../http.js';
import { canonicalizeTitle, createEntry, listEntries, previousEntry, searchEntries } from '../../repositories/entries.js';
import { parseBefore, parseEntryInput, parseRange, parseSearchQuery } from '../../validation.js';

/**
 * GET /api/entries?from=ISO&to=ISO — entries overlapping the range; GET /api/entries?q=text — search, newest first;
 * GET /api/entries?before=ISO — the last entry before that time, or null (TE-8).
 */
export const GET = authed(async (request) => {
  const url = new URL(request.url);
  const query = parseSearchQuery(url);
  if (query !== null) return json(await searchEntries(getDb(), query));
  const before = parseBefore(url);
  if (before !== null) return json(await previousEntry(getDb(), before));
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
