import { getAuthEnv, getGoogleEnv } from '../../server/env.js';
import { authed } from '../../server/http.js';
import { buildAuthUrl } from '../../server/google/oauth.js';
import { createState } from '../../server/google/state.js';

/** GET /api/google/connect — redirects to Google's consent screen. */
export const GET = authed(async (request) => {
  const { state, cookie } = createState(request, getAuthEnv().sessionSecret);
  return new Response(null, { status: 302, headers: { location: buildAuthUrl(getGoogleEnv(), state), 'set-cookie': cookie } });
});
