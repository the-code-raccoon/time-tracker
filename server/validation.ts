import { normalizeTitle } from '../shared/titles.js';
import { GCAL_COLORS } from '../shared/gcalColors.js';
import type { CategoryInput, TimeEntryInput, TimerInput } from '../shared/types.js';
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

export function parseCategoryFields(body: unknown, { partial }: { partial: boolean }): Partial<CategoryInput> {
  const record = asRecord(body);
  const result: Partial<CategoryInput> = {};
  if (record.name !== undefined || !partial) {
    if (typeof record.name !== 'string' || !record.name.trim() || record.name.trim().length > 60) {
      throw new HttpError(400, 'name must be 1–60 characters');
    }
    result.name = record.name.trim().replace(/\s+/g, ' ');
  }
  if (record.appColor !== undefined || !partial) {
    if (typeof record.appColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(record.appColor)) {
      throw new HttpError(400, 'appColor must be a #rrggbb colour');
    }
    result.appColor = record.appColor.toLowerCase();
  }
  if (record.gcalColorId !== undefined || !partial) {
    const value = record.gcalColorId ?? null;
    if (value !== null && !GCAL_COLORS.some((color) => color.id === value)) {
      throw new HttpError(400, 'gcalColorId must be a Google Calendar colour id (1–11) or null');
    }
    result.gcalColorId = value as string | null;
  }
  if (partial && Object.keys(result).length === 0) throw new HttpError(400, 'Nothing to update');
  return result;
}

export function parseOptionalUuid(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !UUID.test(value)) throw new HttpError(400, `${field} must be a UUID or null`);
  return value;
}

export function parseTitle(value: unknown): string {
  if (typeof value !== 'string') throw new HttpError(400, 'title must be a string');
  const title = normalizeTitle(value);
  if (!title) throw new HttpError(400, 'title is required');
  return title;
}

/** `q` for searching entries: normalised like a title (NORM-1), so "Make+eat" finds "make + eat lunch". */
export function parseSearchQuery(url: URL): string | null {
  const q = url.searchParams.get('q');
  if (q === null) return null;
  const query = normalizeTitle(q);
  if (query.length === 0 || query.length > 200) throw new HttpError(400, 'q must be 1–200 characters');
  return query;
}

const CLOCK_SKEW_MS = 60 * 1000;

function parseTimerFields(body: Record<string, unknown>): Partial<TimerInput> {
  const result: Partial<TimerInput> = {};
  if (body.title !== undefined) {
    const title = parseTitle(body.title);
    if (title.length > 200) throw new HttpError(400, 'title must be 1–200 characters');
    result.title = title;
  }
  if (body.categoryId !== undefined) result.categoryId = parseOptionalUuid(body.categoryId, 'categoryId');
  if (body.startedAt !== undefined) {
    result.startedAt = parseDate(body.startedAt, 'startedAt');
    if (Date.parse(result.startedAt) > Date.now() + CLOCK_SKEW_MS) throw new HttpError(400, 'startedAt can\'t be in the future');
  }
  return result;
}

export function parseTimerInput(body: unknown): Required<TimerInput> {
  const fields = parseTimerFields(asRecord(body));
  if (fields.title === undefined) throw new HttpError(400, 'title is required');
  return { title: fields.title, categoryId: fields.categoryId ?? null, startedAt: fields.startedAt ?? new Date().toISOString() };
}

export function parseTimerPatch(body: unknown): Partial<TimerInput> {
  const fields = parseTimerFields(asRecord(body));
  if (Object.keys(fields).length === 0) throw new HttpError(400, 'Nothing to update');
  return fields;
}

export { asRecord };
