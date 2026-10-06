import { getDb } from '../../db.js';
import { getGoogleEnv } from '../../env.js';
import { authed, json } from '../../http.js';
import { revokeToken } from '../../google/oauth.js';
import { deleteAccount } from '../../repositories/google.js';

/** POST /api/google/disconnect — forgets the Google account and revokes its token. Entries are kept. */
export const POST = authed(async () => {
  const refreshToken = await deleteAccount(getDb(), getGoogleEnv());
  if (refreshToken) await revokeToken(refreshToken);
  return json({ connected: false });
});
