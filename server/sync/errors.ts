import { GoogleApiError } from '../google/calendar.js';
import { GoogleAuthError } from '../google/oauth.js';
import { HttpError } from '../http.js';
import { NotConnectedError } from './pull.js';

/** Runs a sync step, turning Google/connection failures into user-facing HTTP errors. */
export async function withSyncErrors<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof NotConnectedError) throw new HttpError(409, 'Connect Google Calendar in Settings first');
    if (error instanceof GoogleAuthError) throw new HttpError(502, `Google sign-in expired or was revoked: ${error.message}. Reconnect in Settings.`);
    if (error instanceof GoogleApiError) throw new HttpError(502, `Google Calendar error: ${error.message}`);
    throw error;
  }
}
