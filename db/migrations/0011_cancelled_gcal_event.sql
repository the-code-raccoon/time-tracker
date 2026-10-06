-- gcal_event is the Google event as last seen. Deletions (pulled from Google, or pushed from the app) used to leave
-- the live event there; record them as cancelled, so the Backups screen (BAK-4) compares backups with what Google has.
update time_entries
   set gcal_event = jsonb_build_object('id', gcal_event_id, 'status', 'cancelled')
 where deleted_at is not null and gcal_event_id is not null
   and last_synced_at is not null and deleted_at <= last_synced_at
   and (gcal_event ->> 'status') is distinct from 'cancelled';
