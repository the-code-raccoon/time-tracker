import { getAuthEnv, getGoogleEnv } from '../../env.js';
import { authed } from '../../http.js';
import { buildAuthUrl } from '../../google/oauth.js';
import { createState } from '../../google/state.js';

/** GET /api/google/connect — redirects to Google's consent screen. */
export const GET = authed(async (request) => {
  const { state, cookie } = createState(request, getAuthEnv().sessionSecret);
  return new Response(null, { status: 302, headers: { location: buildAuthUrl(getGoogleEnv(), state), 'set-cookie': cookie } });
});
