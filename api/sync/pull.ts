import { getDb } from '../../server/db.js';
import { getGoogleEnv } from '../../server/env.js';
import { HttpError, authed, json } from '../../server/http.js';
import { GoogleAuthError } from '../../server/google/oauth.js';
import { GoogleApiError } from '../../server/google/calendar.js';
import { NotConnectedError, pull } from '../../server/sync/pull.js';

/** POST /api/sync/pull — bring Google Calendar changes into the app (SYNC-1, SYNC-2). */
export const POST = authed(async () => {
  try {
    return json(await pull(getDb(), getGoogleEnv()));
  } catch (error) {
    if (error instanceof NotConnectedError) throw new HttpError(409, 'Connect Google Calendar in Settings first');
    if (error instanceof GoogleAuthError) throw new HttpError(502, `Google sign-in expired or was revoked: ${error.message}. Reconnect in Settings.`);
    if (error instanceof GoogleApiError) throw new HttpError(502, `Google Calendar error: ${error.message}`);
    throw error;
  }
});
