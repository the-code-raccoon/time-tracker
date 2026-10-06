import { getDb } from '../../server/db.js';
import { authed, json } from '../../server/http.js';
import { buildReport, exportEntries, toCsv } from '../../server/repositories/reports.js';
import { parseReportRange } from '../../server/validation.js';

/**
 * GET /api/reports?from=ISO&to=ISO&tz=Area/City — time per category per day (REP-1, REP-2).
 * With `format=csv`, every entry in the range as a CSV download instead (REP-3).
 */
export const GET = authed(async (request) => {
  const url = new URL(request.url);
  const { from, to, timeZone } = parseReportRange(url);
  const db = getDb();
  if (url.searchParams.get('format') !== 'csv') return json(await buildReport(db, from, to, timeZone));

  const rows = await exportEntries(db, from, to, timeZone);
  const csv = toCsv([
    ['Start', 'End', 'Minutes', 'Title', 'Category', 'Notes'],
    ...rows.map((r) => [r.start, r.end, r.minutes, r.title, r.category, r.notes]),
  ]);
  const name = `time-entries-${url.searchParams.get('name') ?? 'export'}.csv`.replace(/[^\w.-]/g, '_');
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${name}"`,
      'cache-control': 'no-store',
    },
  });
});
