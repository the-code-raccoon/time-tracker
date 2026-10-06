import { format } from 'date-fns';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function monthIndex(word: string): number {
  if (word.length < 3) return -1;
  const index = MONTHS.indexOf(word.slice(0, 3));
  const full = new Date(2000, index, 1).toLocaleString('en', { month: 'long' }).toLowerCase();
  // "oct", "octo", "october" and "sept" are fine; "octopus" is not.
  return index !== -1 && (full.startsWith(word) || word === 'sept') ? index : -1;
}

function makeDate(year: number, month: number, day: number): Date | null {
  const date = new Date(year, month, day);
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day ? date : null;
}

const toYear = (text: string | undefined, fallback: number) =>
  text === undefined ? fallback : text.length === 2 ? 2000 + Number(text) : Number(text);

/**
 * DT-3: parses a typed date such as "oct 5", "5 oct", "October 5 2027", "10/5", "10/5/27" or "2026-10-05".
 * A missing year means the current year. Returns local midnight, or null if it can't be parsed.
 */
export function parseDateInput(text: string, now = new Date()): Date | null {
  const input = text.trim().toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ');
  const year = now.getFullYear();

  if (input === 'today') return makeDate(year, now.getMonth(), now.getDate());
  if (input === 'tomorrow') return new Date(year, now.getMonth(), now.getDate() + 1);
  if (input === 'yesterday') return new Date(year, now.getMonth(), now.getDate() - 1);

  let match = input.match(/^([a-z]+)\.? (\d{1,2})(?:st|nd|rd|th)?(?: (\d{4}))?$/);
  if (match) {
    const month = monthIndex(match[1]);
    return month === -1 ? null : makeDate(toYear(match[3], year), month, Number(match[2]));
  }
  match = input.match(/^(\d{1,2})(?:st|nd|rd|th)? ([a-z]+)\.?(?: (\d{4}))?$/);
  if (match) {
    const month = monthIndex(match[2]);
    return month === -1 ? null : makeDate(toYear(match[3], year), month, Number(match[1]));
  }
  match = input.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) return makeDate(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  match = input.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2}|\d{4}))?$/);
  if (match) return makeDate(toYear(match[3], year), Number(match[1]) - 1, Number(match[2]));
  return null;
}

/** "Oct 5, 2026" */
export function formatDateLabel(date: Date): string {
  return format(date, 'MMM d, yyyy');
}

export const MINUTES_PER_DAY = 24 * 60;

/**
 * DT-5/DT-6: parses a typed time such as "9:30", "930", "9", "9:30p", "9.30 pm" or "21:30" into minutes after midnight.
 * A 12-hour time without am/pm becomes the first match at or after `referenceMinutes`; if both have passed, pm.
 * Times from 13:00, `0:xx` and times with a leading zero ("09:30") are 24-hour times.
 */
export function parseTimeInput(text: string, referenceMinutes: number): number | null {
  const input = text.trim().toLowerCase().replace(/\s+/g, '').replace('.', ':');
  const match = input.match(/^(\d{1,4})(?::(\d{2}))?(a|am|p|pm)?$/);
  if (!match) return null;

  let [, digits, minuteText, meridiem] = match;
  if (minuteText === undefined && digits.length > 2) {
    minuteText = digits.slice(-2);
    digits = digits.slice(0, -2);
  }
  if (digits.length > 2) return null;
  const hour = Number(digits);
  const minute = Number(minuteText ?? 0);
  if (minute > 59) return null;

  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    return ((hour % 12) + (meridiem.startsWith('p') ? 12 : 0)) * 60 + minute;
  }
  if (hour > 23) return null;
  if (hour >= 13 || hour === 0 || digits.startsWith('0')) return hour * 60 + minute;

  const am = (hour % 12) * 60 + minute;
  const pm = am + 12 * 60;
  return am >= referenceMinutes ? am : pm;
}

export const minutesOfDay = (date: Date) => date.getHours() * 60 + date.getMinutes();

/** "9:30am", "10:00am", "5:10pm" — Google Calendar's format. */
export function formatTimeLabel(date: Date): string {
  return format(date, 'h:mmaaa');
}

/** Parses a duration such as "90", "1:30", "1h30", "1 h 30 min", "1.5h", "45m" or "2 hrs" into minutes. */
export function parseDuration(text: string): number | null {
  const input = text.trim().toLowerCase();
  let minutes: number | null = null;

  let match = input.match(/^(\d+)$/);
  if (match) minutes = Number(match[1]);

  match = minutes === null ? input.match(/^(\d+):(\d{2})$/) : null;
  if (match) minutes = Number(match[2]) < 60 ? Number(match[1]) * 60 + Number(match[2]) : null;

  match = minutes === null ? input.match(/^(?:(\d+(?:\.\d+)?)\s*h(?:ours?|rs?|r)?)?\s*(?:(\d+)\s*m?(?:in(?:ute)?s?)?)?$/) : null;
  if (match && (match[1] !== undefined || match[2] !== undefined)) {
    minutes = Math.round(Number(match[1] ?? 0) * 60) + Number(match[2] ?? 0);
  }

  return minutes !== null && minutes > 0 && minutes <= MINUTES_PER_DAY ? minutes : null;
}

/** Google Calendar's end-time list labels: "30 mins", "1 hr", "1.25 hrs". */
export function formatDurationShort(minutes: number): string {
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'}`;
  const hours = Math.round((minutes / 60) * 100) / 100;
  return `${hours} hr${hours === 1 ? '' : 's'}`;
}
