import { getAuthEnv, getGoogleLoginEnv } from '../../env.js';
import { clearedLoginCookie, checkIdToken, readGoogleLogin } from '../../google/login.js';
import { exchangeLoginCode } from '../../google/oauth.js';
import { clientIp } from '../../http.js';
import { createSessionToken, sessionCookie } from '../../session.js';
import { getLimiter } from './login.js';

function redirect(location: string, cookies: string[]): Response {
  const headers = new Headers({ location });
  for (const cookie of cookies) headers.append('set-cookie', cookie);
  return new Response(null, { status: 302, headers });
}

/**
 * GET /api/auth/callback — Google redirects here after the second login step. The session is issued only when this
 * browser passed the password step (its signed login cookie matches) and Google vouches for ALLOWED_GOOGLE_EMAIL.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const { sessionSecret } = getAuthEnv();
  const fail = (message: string) => redirect(`/?${new URLSearchParams({ login_error: message })}`, [clearedLoginCookie(request)]);

  const attempt = readGoogleLogin(request, url.searchParams.get('state'), sessionSecret);
  if (!attempt) return fail('Your sign-in expired. Enter your password again.');

  const error = url.searchParams.get('error');
  if (error) return fail(error === 'access_denied' ? 'Google sign-in was cancelled.' : `Google sign-in failed: ${error}`);
  const code = url.searchParams.get('code');
  if (!code) return fail('Google returned no authorisation code.');

  const limiter = getLimiter();
  const ip = clientIp(request);
  if (await limiter.isBlocked(ip)) return fail('Too many attempts. Try again later.');

  try {
    const env = getGoogleLoginEnv();
    const tokens = await exchangeLoginCode(env, code, attempt.verifier);
    const refused = checkIdToken(tokens.id_token, { clientId: env.clientId, allowedEmail: env.allowedEmail, nonce: attempt.nonce });
    if (refused) {
      await limiter.recordFailure(ip);
      return fail(refused);
    }
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'Could not sign in with Google');
  }

  await limiter.reset(ip);
  return redirect('/', [clearedLoginCookie(request), sessionCookie(request, createSessionToken(sessionSecret))]);
}
