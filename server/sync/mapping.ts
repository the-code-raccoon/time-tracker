import { createHash } from 'node:crypto';
import { normalizeTitle } from '../../shared/titles.js';
import type { GoogleEvent } from '../google/calendar.js';

export const UNTITLED = '(no title)';
const MAX_TITLE = 200;

/** Hash of the event fields the app cares about. A different hash means the event changed in Google. */
export function remoteHash(event: GoogleEvent): string {
  const fields = [
    event.status ?? 'confirmed',
    event.summary ?? '',
    event.description ?? '',
    event.colorId ?? '',
    event.start?.dateTime ?? event.start?.date ?? '',
    event.end?.dateTime ?? event.end?.date ?? '',
  ];
  return createHash('sha256').update(JSON.stringify(fields)).digest('hex');
}

/** NORM-1 + NORM-2: normalise, then map through the alias table to the canonical title. */
export function canonicalTitle(raw: string | undefined, aliases: Map<string, string>): string {
  const normalized = normalizeTitle(raw ?? '') || UNTITLED;
  return (aliases.get(normalized) ?? normalized).slice(0, MAX_TITLE);
}

export type ColourMap = {
  /** colorId → category id (categories.gcal_color_id plus legacy gcal_color_map). */
  byColor: Map<string, string>;
  /** Category for events with no colour (the calendar default). */
  defaultCategoryId: string | null;
  /** Canonical title → category, which wins over the colour (NORM-7, e.g. exercise → Exercise). */
  byTitle?: Map<string, string>;
};

export function categoryFor(event: GoogleEvent, title: string, colours: ColourMap): string | null {
  const fixed = colours.byTitle?.get(title);
  if (fixed) return fixed;
  return event.colorId ? (colours.byColor.get(event.colorId) ?? null) : colours.defaultCategoryId;
}

export type EntryFields = {
  title: string;
  raw_title: string | null;
  starts_at: string;
  ends_at: string;
  category_id: string | null;
  notes: string | null;
  gcal_event_id: string;
  gcal_etag: string | null;
  gcal_color_id: string | null;
  gcal_remote_hash: string;
};

export type Classified =
  | { kind: 'entry'; fields: EntryFields }
  | { kind: 'removed' } // cancelled in Google
  | { kind: 'skip'; reason: 'all-day' | 'zero-length' };

/** Turns a Google event into entry fields, or says why it isn't a time entry. */
export function classifyEvent(event: GoogleEvent, aliases: Map<string, string>, colours: ColourMap): Classified {
  if (event.status === 'cancelled') return { kind: 'removed' };
  const start = event.start?.dateTime;
  const end = event.end?.dateTime;
  if (!start || !end) return { kind: 'skip', reason: 'all-day' };
  if (Date.parse(end) <= Date.parse(start)) return { kind: 'skip', reason: 'zero-length' };
  const title = canonicalTitle(event.summary, aliases);
  return {
    kind: 'entry',
    fields: {
      title,
      raw_title: event.summary ?? null,
      starts_at: new Date(start).toISOString(),
      ends_at: new Date(end).toISOString(),
      category_id: categoryFor(event, title, colours),
      notes: event.description?.trim() ? event.description : null,
      gcal_event_id: event.id,
      gcal_etag: event.etag ?? null,
      gcal_color_id: event.colorId ?? null,
      gcal_remote_hash: remoteHash(event),
    },
  };
}
