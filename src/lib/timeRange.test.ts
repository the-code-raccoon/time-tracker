import { describe, expect, it } from 'vitest';
import { createRange, isValidRange, setDuration, setEndDate, setEndTime, setStartDate, setStartTime } from './timeRange';

const d = (iso: string) => new Date(iso);
const range = createRange(d('2026-10-05T09:30'), d('2026-10-05T10:00'));
const at = (hour: number, minute = 0) => hour * 60 + minute;

describe('time range editing', () => {
  it('moving the start time keeps the duration (DT-9 example)', () => {
    const next = setStartTime(range, at(9, 40));
    expect(next.start).toEqual(d('2026-10-05T09:40'));
    expect(next.end).toEqual(d('2026-10-05T10:10'));
  });

  it('moving the start date keeps the time and the duration', () => {
    const next = setStartDate(createRange(d('2026-10-05T23:30'), d('2026-10-06T00:30')), d('2026-10-07T00:00'));
    expect(next.start).toEqual(d('2026-10-07T23:30'));
    expect(next.end).toEqual(d('2026-10-08T00:30'));
  });

  it('changing the end never moves the start (DT-10) and updates the duration', () => {
    const next = setEndTime(range, at(11));
    expect(next.start).toEqual(range.start);
    expect(next.end).toEqual(d('2026-10-05T11:00'));
    expect(setStartTime(next, at(10)).end).toEqual(d('2026-10-05T11:30'));
  });

  it('an end before the start is invalid and keeps the last valid duration (DT-7)', () => {
    const invalid = setEndDate(range, d('2026-09-28T00:00'));
    expect(isValidRange(invalid)).toBe(false);
    expect(invalid.durationMs).toBe(30 * 60_000);
    const fixed = setStartTime(invalid, at(14));
    expect(isValidRange(fixed)).toBe(true);
    expect(fixed.end).toEqual(d('2026-10-05T14:30'));
  });

  it('setting a duration sets the end (DT-8)', () => {
    expect(setDuration(range, 90).end).toEqual(d('2026-10-05T11:00'));
    expect(setDuration(range, 180).durationMs).toBe(180 * 60_000);
  });

  it('can cross midnight', () => {
    expect(setDuration(createRange(d('2026-10-05T23:00'), d('2026-10-05T23:30')), 120).end).toEqual(d('2026-10-06T01:00'));
  });
});
