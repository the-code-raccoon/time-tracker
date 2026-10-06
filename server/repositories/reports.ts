import type { Report } from '../../shared/types.js';
import type { Db } from '../db.js';

const TOP_ACTIVITIES = 15;

/** Entries overlapping [from, to), each cut to the range: `clipped` is in seconds. */
const CLIPPED = `
  with clipped as (
    select e.id, e.title, e.category_id, e.starts_at,
           greatest(e.starts_at, $1::timestamptz) as s, least(e.ends_at, $2::timestamptz) as t
      from time_entries e
     where e.deleted_at is null and e.starts_at < $2 and e.ends_at > $1
  )`;

const minutes = (seconds: number | string) => Math.round((Number(seconds) / 60) * 100) / 100;

/**
 * REP-1/REP-2: minutes per category per local day in `timeZone`, totals per category and the top activities.
 * Overlapping entries each count in full, so a day can add up to more than 24 hours.
 */
export async function buildReport(db: Db, from: Date, to: Date, timeZone: string): Promise<Report> {
  const params = [from.toISOString(), to.toISOString(), timeZone];
  const dayRows = await db.query<{ day: string; category_id: string | null; seconds: number }>(
    `${CLIPPED}, days as (
       select d::date as day, (d::date::timestamp at time zone $3) as ds, ((d::date + 1)::timestamp at time zone $3) as de
         from generate_series(($1::timestamptz at time zone $3)::date, (($2::timestamptz - interval '1 microsecond') at time zone $3)::date, interval '1 day') d
     )
     select to_char(days.day, 'YYYY-MM-DD') as day, c.category_id,
            sum(extract(epoch from least(c.t, days.de) - greatest(c.s, days.ds)))::float8 as seconds
       from days join clipped c on c.s < days.de and c.t > days.ds
      group by days.day, c.category_id
      order by days.day`,
    params,
  );
  const allDays = await db.query<{ day: string }>(
    `select to_char(d, 'YYYY-MM-DD') as day
       from generate_series(($1::timestamptz at time zone $3)::date, (($2::timestamptz - interval '1 microsecond') at time zone $3)::date, interval '1 day') d`,
    params,
  );
  const byDay = new Map(allDays.map(({ day }) => [day, {} as Record<string, number>]));
  for (const row of dayRows) {
    const day = byDay.get(row.day);
    if (day) day[row.category_id ?? ''] = minutes(row.seconds);
  }

  const categories = await db.query<{ category_id: string | null; seconds: number; entries: number }>(
    `${CLIPPED}
     select category_id, sum(extract(epoch from t - s))::float8 as seconds, count(*)::int as entries
       from clipped group by category_id order by seconds desc`,
    params.slice(0, 2),
  );
  const activities = await db.query<{ title: string; category_id: string | null; seconds: number; entries: number }>(
    `${CLIPPED}
     select title, (array_agg(category_id order by starts_at desc))[1] as category_id,
            sum(extract(epoch from t - s))::float8 as seconds, count(*)::int as entries
       from clipped group by title order by seconds desc, title limit $3`,
    [...params.slice(0, 2), TOP_ACTIVITIES],
  );

  return {
    days: [...byDay].map(([date, values]) => ({ date, minutes: values })),
    categories: categories.map((r) => ({ categoryId: r.category_id, minutes: minutes(r.seconds), entries: r.entries })),
    activities: activities.map((r) => ({ title: r.title, categoryId: r.category_id, minutes: minutes(r.seconds), entries: r.entries })),
  };
}

export type ExportRow = { start: string; end: string; minutes: number; title: string; category: string | null; notes: string | null };

/** REP-3: every entry overlapping [from, to), with local times in `timeZone`. */
export async function exportEntries(db: Db, from: Date, to: Date, timeZone: string): Promise<ExportRow[]> {
  return db.query<ExportRow>(
    `select to_char(e.starts_at at time zone $3, 'YYYY-MM-DD HH24:MI') as start,
            to_char(e.ends_at at time zone $3, 'YYYY-MM-DD HH24:MI') as "end",
            round(extract(epoch from e.ends_at - e.starts_at) / 60)::int as minutes,
            e.title, c.name as category, e.notes
       from time_entries e left join categories c on c.id = e.category_id
      where e.deleted_at is null and e.starts_at < $2 and e.ends_at > $1
      order by e.starts_at, e.ends_at`,
    [from.toISOString(), to.toISOString(), timeZone],
  );
}

/** RFC 4180 CSV. Cells starting with = + - @ are prefixed with ' so spreadsheets don't run them as formulas. */
export function toCsv(rows: (string | number | null)[][]): string {
  const cell = (value: string | number | null) => {
    if (value === null) return '';
    let text = String(value);
    if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
