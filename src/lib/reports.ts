import { addDays, addMonths, addWeeks, format, isSameMonth, isSameYear, startOfDay, startOfMonth, startOfWeek } from 'date-fns';
import type { Category, Report } from '../../shared/types';

/** REP-1: the ranges a report can cover. */
export type ReportPreset = 'day' | 'week' | 'month' | 'custom';

export type DateRange = { start: Date; end: Date };

/** [start, end) for a preset around `date`: the day, the Sunday-first week, or the calendar month. */
export function presetRange(preset: Exclude<ReportPreset, 'custom'>, date: Date): DateRange {
  if (preset === 'day') return { start: startOfDay(date), end: addDays(startOfDay(date), 1) };
  if (preset === 'week') {
    const start = startOfWeek(date, { weekStartsOn: 0 });
    return { start, end: addDays(start, 7) };
  }
  return { start: startOfMonth(date), end: addMonths(startOfMonth(date), 1) };
}

export function shiftPreset(preset: Exclude<ReportPreset, 'custom'>, date: Date, direction: 1 | -1): Date {
  if (preset === 'day') return addDays(date, direction);
  return preset === 'week' ? addWeeks(date, direction) : addMonths(date, direction);
}

/** "Oct 5, 2026", "Oct 4 – 10, 2026", "Sep 27 – Oct 3, 2026", "Dec 28, 2026 – Jan 3, 2027" or "October 2026". */
export function rangeLabel({ start, end }: DateRange, preset: ReportPreset): string {
  const last = addDays(end, -1);
  if (preset === 'month') return format(start, 'MMMM yyyy');
  if (start.getTime() === startOfDay(last).getTime()) return format(start, 'MMM d, yyyy');
  if (!isSameYear(start, last)) return `${format(start, 'MMM d, yyyy')} – ${format(last, 'MMM d, yyyy')}`;
  if (isSameMonth(start, last)) return `${format(start, 'MMM d')} – ${format(last, 'd, yyyy')}`;
  return `${format(start, 'MMM d')} – ${format(last, 'MMM d, yyyy')}`;
}

/** Category id, or '' for uncategorised — the keys of Report.days[].minutes. */
export type SeriesKey = string;

export type Series = { key: SeriesKey; name: string; color: string; minutes: number; entries: number };

/**
 * The categories in the report, in the user's category order (CAT-8), uncategorised last. Colour follows the
 * category, never its rank, so a range without some category doesn't repaint the others.
 */
export function seriesOf(report: Report, categories: Category[], uncategorisedColor: string): Series[] {
  const totals = new Map(report.categories.map((c) => [c.categoryId ?? '', c]));
  const known: Series[] = categories
    .filter((c) => totals.has(c.id))
    .map((c) => ({ key: c.id, name: c.name, color: c.appColor, minutes: totals.get(c.id)!.minutes, entries: totals.get(c.id)!.entries }));
  const none = totals.get('');
  // A category deleted while the report was loading shows as uncategorised rather than disappearing.
  const orphans = report.categories.filter((c) => c.categoryId !== null && !categories.some((k) => k.id === c.categoryId));
  const rest = [none, ...orphans].filter((c) => c !== undefined);
  if (rest.length > 0) {
    known.push({
      key: '',
      name: 'No category',
      color: uncategorisedColor,
      minutes: rest.reduce((sum, c) => sum + c.minutes, 0),
      entries: rest.reduce((sum, c) => sum + c.entries, 0),
    });
  }
  return known;
}

/**
 * Uncategorised time is drawn hatched, so it never depends on colour alone: its grey is close to greys a category
 * might use (Graphite, for Work). For CSS backgrounds; the chart uses the matching SVG pattern.
 */
export const hatched = (color: string) => `repeating-linear-gradient(45deg, ${color} 0 2px, transparent 2px 4px)`;

/** Minutes for a series on a day, folding unknown categories into uncategorised like seriesOf does. */
export function dayMinutes(day: Report['days'][number], series: Series[], key: SeriesKey): number {
  if (key !== '') return day.minutes[key] ?? 0;
  const known = new Set(series.map((s) => s.key));
  return Object.entries(day.minutes).reduce((sum, [k, minutes]) => (k === '' || !known.has(k) ? sum + minutes : sum), 0);
}

/** Round hour ticks from 0 up to at least `maxHours`: steps of 1, 2, 4, 6, 12 or 24 h, about 4 of them. */
export function hourTicks(maxHours: number): number[] {
  const step = [1, 2, 4, 6, 12, 24].find((s) => maxHours / s <= 4) ?? 24;
  const top = Math.max(step, Math.ceil(maxHours / step) * step);
  return Array.from({ length: top / step + 1 }, (_, i) => i * step);
}

/** "8 h 40 min", "45 min", "0 min". */
export function minutesLabel(minutes: number): string {
  const rounded = Math.round(minutes);
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
