export type AuthEnv = { passwordHash: string; sessionSecret: string };

export function getAuthEnv(env: NodeJS.ProcessEnv = process.env): AuthEnv {
  const passwordHash = env.APP_PASSWORD_HASH;
  const sessionSecret = env.SESSION_SECRET;
  if (!passwordHash) throw new Error('APP_PASSWORD_HASH is not set');
  if (!sessionSecret || sessionSecret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters');
  return { passwordHash, sessionSecret };
}
