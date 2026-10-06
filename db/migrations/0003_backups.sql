-- §5.5 Backups. Snapshots of entries (and later, GCal events) taken before bulk changes; kept 30 days.
create table backups (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  trigger     text not null check (trigger in ('pre-sync', 'daily', 'manual', 'category-change', 'bulk-move')),
  description text,
  entries     jsonb not null default '[]'::jsonb,
  events      jsonb not null default '[]'::jsonb
);
create index backups_created_at_idx on backups (created_at);
alter table backups enable row level security;
