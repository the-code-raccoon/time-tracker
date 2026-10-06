import { decrypt, encrypt } from '../crypto.js';
import type { Db } from '../db.js';
import type { GoogleEnv } from '../env.js';
import { refreshAccessToken, type TokenResponse } from '../google/oauth.js';

type AccountRow = {
  email: string | null;
  refresh_token_enc: string;
  access_token_enc: string | null;
  access_token_expires_at: Date | null;
  connected_at: Date;
};

export type SyncStateRow = {
  sync_token: string | null;
  last_pull_at: Date | null;
  full_import_done_at: Date | null;
};

export async function saveAccount(db: Db, env: GoogleEnv, tokens: TokenResponse, email: string | null): Promise<void> {
  if (!tokens.refresh_token) throw new Error('Google did not return a refresh token');
  await db.query(
    `insert into google_account (id, email, refresh_token_enc, access_token_enc, access_token_expires_at, scope, connected_at)
     values (1, $1, $2, $3, now() + ($4::int * interval '1 second'), $5, now())
     on conflict (id) do update set email = excluded.email, refresh_token_enc = excluded.refresh_token_enc,
       access_token_enc = excluded.access_token_enc, access_token_expires_at = excluded.access_token_expires_at,
       scope = excluded.scope, connected_at = excluded.connected_at`,
    [email, encrypt(tokens.refresh_token, env.encryptionKey), encrypt(tokens.access_token, env.encryptionKey), tokens.expires_in, tokens.scope ?? null],
  );
}

export async function getAccount(db: Db): Promise<AccountRow | null> {
  const [row] = await db.query<AccountRow>(
    'select email, refresh_token_enc, access_token_enc, access_token_expires_at, connected_at from google_account where id = 1',
  );
  return row ?? null;
}

/** Deletes the account and resets sync state, returning the refresh token so it can be revoked. */
export async function deleteAccount(db: Db, env: GoogleEnv): Promise<string | null> {
  const account = await getAccount(db);
  await db.query('delete from google_account where id = 1');
  await db.query('update sync_state set sync_token = null where id = 1');
  return account ? decrypt(account.refresh_token_enc, env.encryptionKey) : null;
}

const EXPIRY_MARGIN_MS = 60_000;

/** A valid access token, refreshed (and stored) when it is about to expire. Null when not connected. */
export async function getAccessToken(db: Db, env: GoogleEnv): Promise<string | null> {
  const account = await getAccount(db);
  if (!account) return null;
  const expiresAt = account.access_token_expires_at ? new Date(account.access_token_expires_at).getTime() : 0;
  if (account.access_token_enc && expiresAt - EXPIRY_MARGIN_MS > Date.now()) {
    return decrypt(account.access_token_enc, env.encryptionKey);
  }
  const tokens = await refreshAccessToken(env, decrypt(account.refresh_token_enc, env.encryptionKey));
  await db.query(
    `update google_account set access_token_enc = $1, access_token_expires_at = now() + ($2::int * interval '1 second') where id = 1`,
    [encrypt(tokens.access_token, env.encryptionKey), tokens.expires_in],
  );
  return tokens.access_token;
}

export async function getSyncState(db: Db): Promise<SyncStateRow> {
  const [row] = await db.query<SyncStateRow>('select sync_token, last_pull_at, full_import_done_at from sync_state where id = 1');
  return row;
}
