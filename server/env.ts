export type AuthEnv = { passwordHash: string; sessionSecret: string };

export function getAuthEnv(env: NodeJS.ProcessEnv = process.env): AuthEnv {
  const passwordHash = env.APP_PASSWORD_HASH;
  const sessionSecret = env.SESSION_SECRET;
  if (!passwordHash) throw new Error('APP_PASSWORD_HASH is not set');
  if (!sessionSecret || sessionSecret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters');
  return { passwordHash, sessionSecret };
}

export type GoogleEnv = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  calendarId: string;
  encryptionKey: string;
};

export function getGoogleEnv(env: NodeJS.ProcessEnv = process.env): GoogleEnv {
  const names = {
    clientId: 'GOOGLE_CLIENT_ID',
    clientSecret: 'GOOGLE_CLIENT_SECRET',
    redirectUri: 'GOOGLE_REDIRECT_URI',
    calendarId: 'GOOGLE_CALENDAR_ID',
    encryptionKey: 'TOKEN_ENCRYPTION_KEY',
  } as const;
  const missing = Object.values(names).filter((name) => !env[name]);
  if (missing.length > 0) throw new Error(`Google Calendar is not configured: set ${missing.join(', ')}`);
  return Object.fromEntries(Object.entries(names).map(([key, name]) => [key, env[name]])) as GoogleEnv;
}

export function isGoogleConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    getGoogleEnv(env);
    return true;
  } catch {
    return false;
  }
}

export type GoogleLoginEnv = { clientId: string; clientSecret: string; redirectUri: string; allowedEmail: string };

/** Google sign-in, the second login step. Its callback is /api/auth/callback on the same origin as GOOGLE_REDIRECT_URI. */
export function getGoogleLoginEnv(env: NodeJS.ProcessEnv = process.env): GoogleLoginEnv {
  const missing = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'ALLOWED_GOOGLE_EMAIL'].filter((name) => !env[name]);
  if (missing.length > 0) throw new Error(`Google sign-in is not configured: set ${missing.join(', ')}`);
  return {
    clientId: env.GOOGLE_CLIENT_ID!,
    clientSecret: env.GOOGLE_CLIENT_SECRET!,
    redirectUri: new URL('/api/auth/callback', env.GOOGLE_REDIRECT_URI).href,
    allowedEmail: env.ALLOWED_GOOGLE_EMAIL!.trim().toLowerCase(),
  };
}
