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

/**
 * Toolbar title, e.g. "October 5, 2026", "Sep – Oct 2026" or "October 2026".
 * `short` is for phones: "Oct 5" and "Oct 2026".
 */
export function rangeTitle(view: ViewMode, date: Date, short = false): string {
  if (view === 'day') return format(date, short ? 'MMM d' : 'MMMM d, yyyy');
  const { start, end } = viewRange(view, date);
  const last = addDays(end, -1);
  if (isSameMonth(start, last)) return format(start, short ? 'MMM yyyy' : 'MMMM yyyy');
  if (isSameYear(start, last)) return `${format(start, 'MMM')} – ${format(last, 'MMM yyyy')}`;
  return `${format(start, 'MMM yyyy')} – ${format(last, 'MMM yyyy')}`;
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

/** Total hours, e.g. "27.8 h" or "298 h". */
export function formatHours(minutes: number): string {
  const hours = minutes / 60;
  return `${hours >= 100 ? Math.round(hours) : Math.round(hours * 10) / 10} h`;
}
