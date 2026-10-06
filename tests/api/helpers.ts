import { vi } from 'vitest';
import { setDb } from '../../server/db.js';
import { createSessionToken } from '../../server/session.js';
import { createTestDb, type TestDb } from '../../server/testing/testDb.js';

const SECRET = 't'.repeat(32);

/** Points the API at a fresh PGlite database and stubs auth env vars. */
export async function setupApi(): Promise<TestDb> {
  vi.stubEnv('APP_PASSWORD_HASH', 'scrypt:1:1:1:x:x');
  vi.stubEnv('SESSION_SECRET', SECRET);
  const db = await createTestDb();
  setDb(db);
  return db;
}

export async function teardownApi(db: TestDb): Promise<void> {
  setDb(undefined);
  await db.close();
  vi.unstubAllEnvs();
}

export function apiRequest(path: string, init: RequestInit & { json?: unknown; authed?: boolean } = {}): Request {
  const { json, authed = true, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (authed) headers.set('cookie', `tt_session=${createSessionToken(SECRET)}`);
  if (json !== undefined) headers.set('content-type', 'application/json');
  return new Request(`https://app.example${path}`, {
    ...rest,
    headers,
    body: json === undefined ? rest.body : JSON.stringify(json),
  });
}

export async function readJson<T>(response: Response | Promise<Response>): Promise<T> {
  return (await (await response).json()) as T;
}
