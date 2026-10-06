-- M3: keep the last-seen Google event, so backups (BAK-1) can store what an event looked like before a push.
alter table time_entries add column gcal_event jsonb;

-- An entry deleted in the app is waiting to be deleted in Google while deleted_at > last_synced_at.
create index time_entries_pending_delete_idx on time_entries (deleted_at) where deleted_at is not null and gcal_event_id is not null;

-- The category when the entry was last in sync. The push recolours an existing event only if the category was
-- changed in the app since then (or a CAT-4 colour change forced it), so imported events keep their colours.
alter table time_entries add column last_synced_category_id uuid;
update time_entries set last_synced_category_id = category_id where last_synced_hash is not null;
