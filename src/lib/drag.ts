import { addDays, addMinutes } from 'date-fns';

/** §5.2d: drags move in 15-minute steps. */
export const DRAG_STEP_MINUTES = 15;
const MIN_ENTRY_MINUTES = 5;
const MAX_ENTRY_MINUTES = 24 * 60;

export type Times = { start: Date; end: Date };
type EntryTimes = { start: string; end: string };

const toStep = (minutes: number) => Math.round(minutes / DRAG_STEP_MINUTES) * DRAG_STEP_MINUTES;

/** A local wall-clock time on `day` (correct on daylight-saving days, unlike adding minutes to midnight). */
export const atWallMinutes = (day: Date, minutes: number) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, minutes);

/**
 * DRAG-1/2/9: moves an entry by whole 15-minute steps from its own time (9:40 → 9:55), and by whole days,
 * keeping its time of day and its duration. Entries crossing midnight move as one block.
 */
export function moveTimes(entry: EntryTimes, deltaMinutes: number, deltaDays: number): Times {
  const start = new Date(entry.start);
  const duration = new Date(entry.end).getTime() - start.getTime();
  const moved = addMinutes(addDays(start, deltaDays), toStep(deltaMinutes));
  return { start: moved, end: new Date(moved.getTime() + duration) };
}

/** DRAG-3: moves the end in 15-minute steps from its current time; at least 5 minutes and at most 24 hours long. */
export function resizeTimes(entry: EntryTimes, deltaMinutes: number): Times {
  const start = new Date(entry.start);
  const end = addMinutes(new Date(entry.end), toStep(deltaMinutes));
  const min = addMinutes(start, MIN_ENTRY_MINUTES);
  const max = addMinutes(start, MAX_ENTRY_MINUTES);
  return { start, end: end < min ? min : end > max ? max : end };
}

/**
 * DRAG-4: the range selected by dragging from `anchorMinutes` to `currentMinutes` (wall-clock minutes on `day`),
 * on the 15-minute grid. It always includes the slot under each end and is at least one slot long.
 */
export function createTimes(day: Date, anchorMinutes: number, currentMinutes: number): Times {
  const step = DRAG_STEP_MINUTES;
  const clamp = (minutes: number) => Math.min(Math.max(minutes, 0), MAX_ENTRY_MINUTES);
  const anchor = clamp(Math.floor(anchorMinutes / step) * step);
  const current = clamp(currentMinutes);
  const [from, to] =
    current >= anchor
      ? [anchor, Math.max(Math.ceil(current / step) * step, anchor + step)]
      : [Math.floor(current / step) * step, anchor + step];
  return { start: atWallMinutes(day, from), end: atWallMinutes(day, Math.min(to, MAX_ENTRY_MINUTES)) };
}

export const sameTimes = (a: Times, b: EntryTimes) => a.start.getTime() === Date.parse(b.start) && a.end.getTime() === Date.parse(b.end);
