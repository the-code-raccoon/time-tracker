-- Supabase performance advisor: index the category foreign key, and give login_attempts a primary key.
create index time_entries_category_id_idx on time_entries (category_id);
alter table login_attempts add column id bigint generated always as identity primary key;
