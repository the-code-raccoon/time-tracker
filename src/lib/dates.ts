import { addDays, format, isSameMonth, isSameYear, startOfDay, startOfWeek } from 'date-fns';

export type ViewMode = 'day' | 'week' | 'schedule';

export const VIEW_LABELS: Record<ViewMode, string> = { day: 'Day', week: 'Week', schedule: 'Schedule' };

const SCHEDULE_DAYS = 14;
const SPAN: Record<ViewMode, number> = { day: 1, week: 7, schedule: SCHEDULE_DAYS };

/** Visible [start, end) range for a view, in local time. Weeks start on Sunday, like Google Calendar. */
export function viewRange(view: ViewMode, date: Date): { start: Date; end: Date } {
  const start = view === 'week' ? startOfWeek(date, { weekStartsOn: 0 }) : startOfDay(date);
  return { start, end: addDays(start, SPAN[view]) };
}

/** The date one period before (-1) or after (+1). */
export function shiftDate(view: ViewMode, date: Date, direction: 1 | -1): Date {
  return addDays(date, SPAN[view] * direction);
}

export function daysBetween(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  for (let day = startOfDay(start); day < end; day = addDays(day, 1)) days.push(day);
  return days;
}

/** Toolbar title, e.g. "October 5, 2026", "Sep 27 – Oct 3, 2026" or "October 2026". */
export function rangeTitle(view: ViewMode, date: Date): string {
  if (view === 'day') return format(date, 'MMMM d, yyyy');
  const { start, end } = viewRange(view, date);
  const last = addDays(end, -1);
  if (isSameMonth(start, last)) return format(start, 'MMMM yyyy');
  if (isSameYear(start, last)) return `${format(start, 'MMM')} – ${format(last, 'MMM yyyy')}`;
  return `${format(start, 'MMM yyyy')} – ${format(last, 'MMM yyyy')}`;
}

/** Value for <input type="datetime-local">. */
export function toLocalInput(date: Date): string {
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

/** Parses an <input type="datetime-local"> value as local time. */
export function fromLocalInput(value: string): Date | null {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime()) ? date : null;
}

export function formatTime(date: Date): string {
  return format(date, date.getMinutes() === 0 ? 'h a' : 'h:mm a').toLowerCase();
}

export function formatTimeRange(start: Date, end: Date): string {
  return `${formatTime(start)} – ${formatTime(end)}`;
}

export function formatDuration(start: Date, end: Date): string {
  const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** Rounds a date down to a multiple of `step` minutes. */
export function snapMinutes(date: Date, step: number): Date {
  const snapped = new Date(date);
  snapped.setMinutes(Math.floor(date.getMinutes() / step) * step, 0, 0);
  return snapped;
}
