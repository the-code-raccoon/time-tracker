import { getDb } from '../../server/db.js';
import { getAuthEnv, getGoogleEnv } from '../../server/env.js';
import { emailFromIdToken, exchangeCode } from '../../server/google/oauth.js';
import { clearedStateCookie, verifyState } from '../../server/google/state.js';
import { saveAccount } from '../../server/repositories/google.js';

const SETTINGS = '/settings';

function redirect(result: string, detail?: string): Response {
  const params = new URLSearchParams({ google: result, ...(detail ? { detail } : {}) });
  return new Response(null, { status: 302, headers: { location: `${SETTINGS}?${params}`, 'set-cookie': clearedStateCookie() } });
}

/**
 * GET /api/google/callback — Google redirects here after consent.
 * No session check: the strict session cookie isn't sent on this cross-site redirect. The signed state cookie,
 * which only a signed-in user can obtain from /api/google/connect, authorises the request instead.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (!verifyState(request, url.searchParams.get('state'), getAuthEnv().sessionSecret)) return redirect('error', 'Invalid or expired sign-in attempt. Try again.');

  const error = url.searchParams.get('error');
  if (error) return redirect('error', error === 'access_denied' ? 'Access was not granted.' : error);
  const code = url.searchParams.get('code');
  if (!code) return redirect('error', 'Google returned no authorisation code.');

  try {
    const env = getGoogleEnv();
    const tokens = await exchangeCode(env, code);
    if (!tokens.scope?.includes('calendar.events')) return redirect('error', 'Calendar access was not granted. Tick the calendar permission and try again.');
    await saveAccount(getDb(), env, tokens, emailFromIdToken(tokens.id_token));
    return redirect('connected');
  } catch (err) {
    return redirect('error', err instanceof Error ? err.message : 'Could not connect to Google');
  }
}
