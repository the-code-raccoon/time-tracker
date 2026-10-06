-- M1: categories, time entries, login attempts.
-- RLS is enabled on every table with no policies: Supabase exposes the public schema over its REST API,
-- and this blocks the anon/authenticated roles. The app connects as the table owner, which bypasses RLS.

create table categories (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique check (length(name) between 1 and 60),
  app_color     text not null check (app_color ~ '^#[0-9a-fA-F]{6}$'),
  gcal_color_id text check (gcal_color_id ~ '^([1-9]|1[01])$'), -- null = calendar default colour
  sort_order    int  not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table categories enable row level security;

-- Seeded from PRD §2.1 (CAT-6). App colours start as the matching GCal colour and can be changed freely.
insert into categories (name, gcal_color_id, app_color, sort_order) values
  ('Wake up',               '4',  '#e67c73', 1),
  ('Food',                  '10', '#0b8043', 2),
  ('Japanese study',        '6',  '#f4511e', 3),
  ('Content / creative',    '3',  '#8e24aa', 4),
  ('Leisure',               '7',  '#039be5', 5),
  ('Work',                  '8',  '#616161', 6),
  ('Errands / outings',     '11', '#d50000', 7),
  ('Health appointments',   '9',  '#3f51b5', 8),
  ('Exercise',              '5',  '#f6bf26', 9),
  ('Self-care / logistics', null, '#a79b8e', 10);

create table time_entries (
  id               uuid primary key default gen_random_uuid(),
  title            text not null check (length(title) between 1 and 200),
  raw_title        text,                 -- title exactly as imported from GCal (NORM-4)
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  category_id      uuid references categories (id) on delete set null,
  notes            text,
  -- sync metadata (SYNC-4)
  gcal_event_id    text unique,
  gcal_etag        text,
  last_synced_hash text,
  deleted_at       timestamptz,          -- soft delete so deletions can be pushed
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index time_entries_range_idx on time_entries (starts_at, ends_at) where deleted_at is null;
alter table time_entries enable row level security;

create table login_attempts (
  ip           text not null,
  attempted_at timestamptz not null default now()
);
create index login_attempts_ip_idx on login_attempts (ip, attempted_at);
alter table login_attempts enable row level security;
