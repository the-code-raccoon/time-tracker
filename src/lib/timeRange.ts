import { addMinutes, startOfDay } from 'date-fns';

/**
 * Start/end being edited, plus the last valid duration, so moving the start keeps it (DT-9)
 * even after the end was briefly set before the start.
 */
export type TimeRange = { start: Date; end: Date; durationMs: number };

export function createRange(start: Date, end: Date): TimeRange {
  return { start, end, durationMs: Math.max(end.getTime() - start.getTime(), 0) };
}

export const isValidRange = (range: TimeRange) => range.end > range.start;

const atMinutes = (day: Date, minutes: number) => addMinutes(startOfDay(day), minutes);
const minutesOf = (date: Date) => date.getHours() * 60 + date.getMinutes();

function moveStart(range: TimeRange, start: Date): TimeRange {
  return { ...range, start, end: new Date(start.getTime() + range.durationMs) };
}

function moveEnd(range: TimeRange, end: Date): TimeRange {
  const durationMs = end.getTime() - range.start.getTime();
  return { ...range, end, durationMs: durationMs > 0 ? durationMs : range.durationMs };
}

export const setStartDate = (range: TimeRange, day: Date) => moveStart(range, atMinutes(day, minutesOf(range.start)));
export const setStartTime = (range: TimeRange, minutes: number) => moveStart(range, atMinutes(range.start, minutes));
export const setEndDate = (range: TimeRange, day: Date) => moveEnd(range, atMinutes(day, minutesOf(range.end)));
export const setEndTime = (range: TimeRange, minutes: number) => moveEnd(range, atMinutes(range.end, minutes));

/** DT-8: end = start + duration. */
export function setDuration(range: TimeRange, minutes: number): TimeRange {
  return { ...range, end: addMinutes(range.start, minutes), durationMs: minutes * 60_000 };
}

/** TE-8: start where the last entry ended. The end stays put while it's still after the start; otherwise the duration is kept. */
export function startFrom(range: TimeRange, start: Date): TimeRange {
  if (range.end > start) return createRange(start, range.end);
  return moveStart(range, start);
}
