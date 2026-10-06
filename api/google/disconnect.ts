import { getDb } from '../../server/db.js';
import { getGoogleEnv } from '../../server/env.js';
import { authed, json } from '../../server/http.js';
import { revokeToken } from '../../server/google/oauth.js';
import { deleteAccount } from '../../server/repositories/google.js';

/** POST /api/google/disconnect — forgets the Google account and revokes its token. Entries are kept. */
export const POST = authed(async () => {
  const refreshToken = await deleteAccount(getDb(), getGoogleEnv());
  if (refreshToken) await revokeToken(refreshToken);
  return json({ connected: false });
});
