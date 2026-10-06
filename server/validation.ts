import { normalizeTitle } from '../shared/titles.js';
import type { TimeEntryInput } from '../shared/types.js';
import { HttpError } from './http.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ENTRY_MS = 24 * 60 * 60 * 1000;

export function parseUuid(value: string, what = 'id'): string {
  if (!UUID.test(value)) throw new HttpError(400, `Invalid ${what}`);
  return value;
}

function parseDate(value: unknown, field: string): string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value)) || !/T/.test(value)) {
    throw new HttpError(400, `${field} must be an ISO 8601 date-time`);
  }
  return new Date(value).toISOString();
}

function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new HttpError(400, 'Expected a JSON object');
  return body as Record<string, unknown>;
}

function parseFields(body: Record<string, unknown>): Partial<TimeEntryInput> {
  const result: Partial<TimeEntryInput> = {};
  if (body.title !== undefined) {
    if (typeof body.title !== 'string') throw new HttpError(400, 'title must be a string');
    const title = normalizeTitle(body.title);
    if (title.length === 0 || title.length > 200) throw new HttpError(400, 'title must be 1–200 characters');
    result.title = title;
  }
  if (body.start !== undefined) result.start = parseDate(body.start, 'start');
  if (body.end !== undefined) result.end = parseDate(body.end, 'end');
  if (body.categoryId !== undefined) {
    if (body.categoryId !== null && (typeof body.categoryId !== 'string' || !UUID.test(body.categoryId))) {
      throw new HttpError(400, 'categoryId must be a UUID or null');
    }
    result.categoryId = body.categoryId as string | null;
  }
  if (body.notes !== undefined) {
    if (body.notes !== null && typeof body.notes !== 'string') throw new HttpError(400, 'notes must be a string or null');
    result.notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes : null;
  }
  return result;
}

export function checkTimes(start: string, end: string): void {
  const duration = Date.parse(end) - Date.parse(start);
  if (duration <= 0) throw new HttpError(400, 'end must be after start');
  if (duration > MAX_ENTRY_MS) throw new HttpError(400, 'An entry can be at most 24 hours long');
}

export function parseEntryInput(body: unknown): Required<TimeEntryInput> {
  const fields = parseFields(asRecord(body));
  if (fields.title === undefined) throw new HttpError(400, 'title is required');
  if (fields.start === undefined || fields.end === undefined) throw new HttpError(400, 'start and end are required');
  checkTimes(fields.start, fields.end);
  return { title: fields.title, start: fields.start, end: fields.end, categoryId: fields.categoryId ?? null, notes: fields.notes ?? null };
}

export function parseEntryPatch(body: unknown): Partial<TimeEntryInput> {
  const fields = parseFields(asRecord(body));
  if (Object.keys(fields).length === 0) throw new HttpError(400, 'Nothing to update');
  return fields;
}

/** `from`/`to` query parameters for listing entries, limited to ~100 days. */
export function parseRange(url: URL): { from: Date; to: Date } {
  const from = new Date(parseDate(url.searchParams.get('from') ?? undefined, 'from'));
  const to = new Date(parseDate(url.searchParams.get('to') ?? undefined, 'to'));
  if (to <= from) throw new HttpError(400, 'to must be after from');
  if (to.getTime() - from.getTime() > 100 * MAX_ENTRY_MS) throw new HttpError(400, 'Range can be at most 100 days');
  return { from, to };
}
