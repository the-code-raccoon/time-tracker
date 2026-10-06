import { getDb } from '../../db.js';
import { HttpError, authed, json } from '../../http.js';
import { stopTimer } from '../../repositories/timer.js';

/** POST /api/timer/stop — stop the timer and log it as an entry (TE-5). Returns the new entry. */
export const POST = authed(async () => {
  const result = await stopTimer(getDb());
  if ('entry' in result) return json(result.entry, { status: 201 });
  if (result.error === 'not-running') throw new HttpError(404, 'No timer is running');
  throw new HttpError(400, 'The timer ran for more than 24 hours. Change its start time or discard it.');
});
