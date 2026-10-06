-- 0007 could not help titles whose every entry had lost its category (e.g. all 163 "shower" entries). Re-derive each
-- untouched imported entry's category from its Google colour, exactly as the import maps it (fixed title categories,
-- then legacy colour map, then category colours, with no colour = the "Calendar default" category), then apply NORM-8
-- correctly: each title takes the most recent of those that maps to a category. Only uncategorised entries still as
-- imported are changed, a backup is taken first, and the result is recorded as synced so nothing is pushed to Google.
create temp table colour_category on commit drop as
  select e.id, e.title, e.starts_at,
         coalesce(
           tc.category_id,
           case when e.gcal_color_id is null
                then (select id from categories where gcal_color_id is null order by sort_order limit 1)
                else coalesce(gm.category_id, (select id from categories c where c.gcal_color_id = e.gcal_color_id order by sort_order limit 1))
           end
         ) as category_id
    from time_entries e
    left join title_categories tc on tc.title = e.title
    left join gcal_color_map gm on gm.gcal_color_id = e.gcal_color_id
   where e.gcal_event_id is not null and e.deleted_at is null
     and e.last_synced_hash is not distinct from e.app_hash;

create temp table norm8_repair2 on commit drop as
  select e.id, latest.category_id
    from time_entries e
    join (
      select distinct on (title) title, category_id from colour_category
       where category_id is not null
       order by title, starts_at desc
    ) latest using (title)
   where e.id in (select id from colour_category) and e.category_id is null;

insert into backups (trigger, description, entries)
  select 'manual', 'Before re-deriving import categories from colours (NORM-8)', coalesce(jsonb_agg(to_jsonb(e) - 'gcal_event'), '[]'::jsonb)
    from time_entries e where e.id in (select id from norm8_repair2)
  having count(*) > 0;

update time_entries e set category_id = r.category_id from norm8_repair2 r where e.id = r.id;

update time_entries e set last_synced_hash = e.app_hash, last_synced_category_id = e.category_id
  from norm8_repair2 r where e.id = r.id;
