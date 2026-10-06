-- M2: Google account, sync state, pull bookkeeping, title aliases and legacy colour mapping.

-- Single row: the connected Google account. Tokens are AES-256-GCM encrypted with TOKEN_ENCRYPTION_KEY (AUTH-6).
create table google_account (
  id                      int primary key default 1 check (id = 1),
  email                   text,
  refresh_token_enc       text not null,
  access_token_enc        text,
  access_token_expires_at timestamptz,
  scope                   text,
  connected_at            timestamptz not null default now()
);
alter table google_account enable row level security;

-- Single row: incremental sync state (SYNC-9).
create table sync_state (
  id                  int primary key default 1 check (id = 1),
  sync_token          text,
  last_pull_at        timestamptz,
  full_import_done_at timestamptz
);
insert into sync_state (id) values (1);
alter table sync_state enable row level security;

-- Epoch seconds of a timestamptz. extract() is only STABLE in general, but epoch doesn't depend on the
-- session time zone, so this is safe to mark IMMUTABLE for use in a generated column.
create function tt_epoch(ts timestamptz) returns text
  language sql immutable parallel safe
  set search_path = pg_catalog
  as $$ select extract(epoch from ts)::text $$;

-- Hash of the entry's own fields. "Changed in the app since the last sync" = app_hash <> last_synced_hash.
alter table time_entries
  add column app_hash text generated always as (md5(
    title || '|' || tt_epoch(starts_at) || '|' || tt_epoch(ends_at) || '|' ||
    coalesce(category_id::text, '') || '|' || coalesce(notes, '')
  )) stored,
  -- Hash of the Google event as last seen. "Changed in Google" = new event hash <> gcal_remote_hash.
  add column gcal_remote_hash text,
  add column gcal_color_id text,
  add column last_synced_at timestamptz;

-- Both sides changed the same entry: kept until reconciled (SYNC-5 – SYNC-7; the Reconcile screen is M3).
create table sync_conflicts (
  entry_id     uuid primary key references time_entries (id) on delete cascade,
  remote_event jsonb not null,   -- the Google event as pulled; status 'cancelled' = deleted in Google
  detected_at  timestamptz not null default now()
);
alter table sync_conflicts enable row level security;

-- NORM-2 / NORM-7: normalised title → canonical title. Applied on import and on save.
create table title_aliases (
  alias text primary key check (alias = lower(alias)),
  title text not null
);
insert into title_aliases (alias, title) values
  ('gym', 'exercise'),
  ('cardio', 'exercise'),
  ('gym + cardio', 'exercise'),
  ('cardio + gym', 'exercise'),
  ('chilling', 'chill'),
  ('eating', 'eat'),
  ('make + eat preworkout', 'make + eat pre-workout'),
  ('make + eat pre workout', 'make + eat pre-workout'),
  ('eat preworkout', 'eat pre-workout'),
  ('eat pre workout', 'eat pre-workout'),
  ('eat + make pre workout', 'make + eat pre-workout'),
  ('eat + make preworkout', 'make + eat pre-workout');
alter table title_aliases enable row level security;

-- Extra GCal colours that map to a category on import (legacy colours, §2.1). Primary colours come from categories.gcal_color_id.
create table gcal_color_map (
  gcal_color_id text primary key check (gcal_color_id ~ '^([1-9]|1[01])$'),
  category_id   uuid not null references categories (id) on delete cascade
);
insert into gcal_color_map (gcal_color_id, category_id)
  select '1', id from categories where name = 'Leisure';  -- Lavender (`tiering`) → Leisure
alter table gcal_color_map enable row level security;
