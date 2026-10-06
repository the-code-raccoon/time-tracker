-- NORM-7: some activities always belong to a category, whatever colour their events had in Google.
-- Checked on import before the event colour (and therefore before NORM-8's "most recent colour wins").
create table title_categories (
  title       text primary key check (title = lower(title)),
  category_id uuid not null references categories (id) on delete cascade
);
insert into title_categories (title, category_id)
  select 'exercise', id from categories where name = 'Exercise';
alter table title_categories enable row level security;
