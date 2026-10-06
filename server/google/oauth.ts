import type { GoogleEnv } from '../env.js';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

export const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/calendar.events'];

export type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
};

export class GoogleAuthError extends Error {}

/** Consent URL. `prompt=consent` + `access_type=offline` makes Google return a refresh token every time. */
export function buildAuthUrl(env: GoogleEnv, state: string): string {
  const params = new URLSearchParams({
    client_id: env.clientId,
    redirect_uri: env.redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `${AUTH_URL}?${params}`;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  const json = (await response.json().catch(() => ({}))) as TokenResponse & { error?: string; error_description?: string };
  if (!response.ok) throw new GoogleAuthError(json.error_description ?? json.error ?? `Token request failed (${response.status})`);
  return json;
}

export function exchangeCode(env: GoogleEnv, code: string): Promise<TokenResponse> {
  return tokenRequest({
    code,
    client_id: env.clientId,
    client_secret: env.clientSecret,
    redirect_uri: env.redirectUri,
    grant_type: 'authorization_code',
  });
}

export function refreshAccessToken(env: GoogleEnv, refreshToken: string): Promise<TokenResponse> {
  return tokenRequest({
    refresh_token: refreshToken,
    client_id: env.clientId,
    client_secret: env.clientSecret,
    grant_type: 'refresh_token',
  });
}

export async function revokeToken(token: string): Promise<void> {
  await fetch(`${REVOKE_URL}?${new URLSearchParams({ token })}`, { method: 'POST' }).catch(() => undefined);
}

/** Email from the id_token. It came straight from Google's token endpoint over TLS, so the payload is trusted as-is. */
export function emailFromIdToken(idToken: string | undefined): string | null {
  const payload = idToken?.split('.')[1];
  if (!payload) return null;
  try {
    return (JSON.parse(Buffer.from(payload, 'base64url').toString()) as { email?: string }).email ?? null;
  } catch {
    return null;
  }
}
