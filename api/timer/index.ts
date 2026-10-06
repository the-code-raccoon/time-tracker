import { getDb } from '../../server/db.js';
import { HttpError, authed, json, readJson } from '../../server/http.js';
import { canonicalizeTitle } from '../../server/repositories/entries.js';
import { discardTimer, getTimer, startTimer, updateTimer } from '../../server/repositories/timer.js';
import { parseTimerInput, parseTimerPatch } from '../../server/validation.js';

/** GET /api/timer — the running timer, or null (TE-5). */
export const GET = authed(async () => json(await getTimer(getDb())));

/** POST /api/timer { title, categoryId?, startedAt? } — start the timer. 409 if one is already running. */
export const POST = authed(async (request) => {
  const db = getDb();
  const input = parseTimerInput(await readJson(request));
  const timer = await startTimer(db, { ...input, title: await canonicalizeTitle(db, input.title) });
  if (!timer) throw new HttpError(409, 'A timer is already running');
  return json(timer, { status: 201 });
});

/** PATCH /api/timer — edit the running timer's title, category or start time. */
export const PATCH = authed(async (request) => {
  const db = getDb();
  const patch = parseTimerPatch(await readJson(request));
  if (patch.title !== undefined) patch.title = await canonicalizeTitle(db, patch.title);
  const timer = await updateTimer(db, patch);
  if (!timer) throw new HttpError(404, 'No timer is running');
  return json(timer);
});

/** DELETE /api/timer — discard the running timer without logging it. */
export const DELETE = authed(async () => {
  if (!(await discardTimer(getDb()))) throw new HttpError(404, 'No timer is running');
  return new Response(null, { status: 204 });
});
