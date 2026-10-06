-- M4: the running timer (TE-5). A single row, stored server-side so a timer started on one device can be
-- seen and stopped on another. No row = no timer running.
create table timer (
  id          int primary key default 1 check (id = 1),
  title       text not null check (length(title) between 1 and 200),
  category_id uuid references categories (id) on delete set null,
  started_at  timestamptz not null
);
alter table timer enable row level security;
