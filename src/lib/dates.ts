import { addDays, addMonths, endOfMonth, endOfWeek, format, isSameMonth, isSameYear, startOfDay, startOfMonth, startOfWeek } from 'date-fns';

export type ViewMode = 'day' | 'two-day' | 'week' | 'month' | 'schedule';

export const VIEW_LABELS: Record<ViewMode, string> = { day: 'Day', 'two-day': '2 days', week: 'Week', month: 'Month', schedule: 'Schedule' };

/** §5.7: the letter and number key that switch to each view (Google Calendar's; `x` / `4` is its custom view). */
export const VIEW_KEYS: Record<ViewMode, [letter: string, digit: string]> = {
  day: ['d', '1'],
  'two-day': ['x', '4'],
  week: ['w', '2'],
  month: ['m', '3'],
  schedule: ['a', '5'],
};

const SCHEDULE_DAYS = 14;
const SPAN: Record<Exclude<ViewMode, 'month'>, number> = { day: 1, 'two-day': 2, week: 7, schedule: SCHEDULE_DAYS };

/**
 * Visible [start, end) range for a view, in local time. Weeks start on Sunday, like Google Calendar.
 * Month view shows whole weeks: from the Sunday on or before the 1st to the Saturday on or after the last day.
 * 2-day view shows the day before the date and the date itself.
 */
export function viewRange(view: ViewMode, date: Date): { start: Date; end: Date } {
  if (view === 'month') {
    return {
      start: startOfWeek(startOfMonth(date), { weekStartsOn: 0 }),
      end: addDays(startOfDay(endOfWeek(endOfMonth(date), { weekStartsOn: 0 })), 1),
    };
  }
  const start =
    view === 'week' ? startOfWeek(date, { weekStartsOn: 0 }) : view === 'two-day' ? addDays(startOfDay(date), -1) : startOfDay(date);
  return { start, end: addDays(start, SPAN[view]) };
}

/** The date one period before (-1) or after (+1). */
export function shiftDate(view: ViewMode, date: Date, direction: 1 | -1): Date {
  return view === 'month' ? addMonths(date, direction) : addDays(date, SPAN[view] * direction);
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
  if (view === 'month') return format(date, short ? 'MMM yyyy' : 'MMMM yyyy');
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

/** Running timer: "4:05", "12:34" or "1:02:03". */
export function formatElapsed(ms: number): string {
  const seconds = Math.max(Math.floor(ms / 1000), 0);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
