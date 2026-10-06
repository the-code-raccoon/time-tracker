-- CAT-13 for categories whose GCal colour was set before that rule existed: uncategorised imported entries that are
-- still as imported join the category whose GCal colour matches theirs. Their events already have that colour, so they
-- are recorded as in sync (nothing is pushed). A backup is taken first.
create temp table adopt on commit drop as
  select e.id, (select c.id from categories c where c.gcal_color_id is not distinct from e.gcal_color_id order by c.sort_order limit 1) as category_id
    from time_entries e
   where e.category_id is null and e.deleted_at is null and e.gcal_event_id is not null
     and e.last_synced_hash is not distinct from e.app_hash;
delete from adopt where category_id is null;

insert into backups (trigger, description, entries)
  select 'manual', 'Before adding uncategorised entries to the category with their colour', coalesce(jsonb_agg(to_jsonb(e) - 'gcal_event'), '[]'::jsonb)
    from time_entries e where e.id in (select id from adopt)
  having count(*) > 0;

update time_entries e set category_id = a.category_id, updated_at = now() from adopt a where e.id = a.id;
update time_entries e set last_synced_hash = e.app_hash, last_synced_category_id = e.category_id from adopt a where e.id = a.id;
