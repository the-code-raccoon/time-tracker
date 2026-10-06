import { describe, expect, it } from 'vitest';
import { daysBetween, formatDuration, formatElapsed, formatTimeRange, rangeTitle, shiftDate, snapMinutes, viewRange } from './dates';

const d = (iso: string) => new Date(iso); // no offset → local time

describe('viewRange', () => {
  it('day covers one local day', () => {
    expect(viewRange('day', d('2026-10-05T15:30'))).toEqual({ start: d('2026-10-05T00:00'), end: d('2026-10-06T00:00') });
  });

  it('two-day covers the previous day and the date', () => {
    expect(viewRange('two-day', d('2026-10-05T15:30'))).toEqual({ start: d('2026-10-04T00:00'), end: d('2026-10-06T00:00') });
  });

  it('week starts on Sunday', () => {
    expect(viewRange('week', d('2026-10-07T12:00'))).toEqual({ start: d('2026-10-04T00:00'), end: d('2026-10-11T00:00') });
  });

  it('month covers whole weeks around the month', () => {
    expect(viewRange('month', d('2026-10-20T12:00'))).toEqual({ start: d('2026-09-27T00:00'), end: d('2026-11-01T00:00') });
    // Starts on a Sunday and ends on a Saturday: no extra weeks.
    expect(viewRange('month', d('2026-02-10T12:00'))).toEqual({ start: d('2026-02-01T00:00'), end: d('2026-03-01T00:00') });
    // Six weeks.
    const { start, end } = viewRange('month', d('2026-08-15T12:00'));
    expect([start, daysBetween(start, end).length]).toEqual([d('2026-07-26T00:00'), 42]);
  });

  it('schedule covers 14 days from the date', () => {
    const { start, end } = viewRange('schedule', d('2026-10-05T12:00'));
    expect(daysBetween(start, end)).toHaveLength(14);
  });
});

describe('shiftDate', () => {
  it.each([
    ['day', 1, '2026-10-06T09:00'],
    ['two-day', 1, '2026-10-07T09:00'],
    ['two-day', -1, '2026-10-03T09:00'],
    ['week', -1, '2026-09-28T09:00'],
    ['schedule', 1, '2026-10-19T09:00'],
    ['month', 1, '2026-11-05T09:00'],
    ['month', -1, '2026-09-05T09:00'],
  ] as const)('%s %i', (view, direction, expected) => {
    expect(shiftDate(view, d('2026-10-05T09:00'), direction)).toEqual(d(expected));
  });
});

describe('rangeTitle', () => {
  it.each([
    ['day', '2026-10-05T12:00', 'October 5, 2026'],
    ['week', '2026-10-14T12:00', 'October 2026'],
    ['week', '2026-10-01T12:00', 'Sep – Oct 2026'],
    ['week', '2026-12-30T12:00', 'Dec 2026 – Jan 2027'],
    ['month', '2026-10-01T12:00', 'October 2026'],
  ] as const)('%s of %s', (view, date, expected) => {
    expect(rangeTitle(view, d(date))).toBe(expected);
  });
});

describe('rangeTitle (short, for phones)', () => {
  it.each([
    ['day', '2026-10-05T12:00', 'Oct 5'],
    ['week', '2026-10-14T12:00', 'Oct 2026'],
    ['week', '2026-10-01T12:00', 'Sep – Oct 2026'],
  ] as const)('%s of %s', (view, date, expected) => {
    expect(rangeTitle(view, d(date), true)).toBe(expected);
  });
});

describe('formatting', () => {
  it('formats time ranges like Google Calendar', () => {
    expect(formatTimeRange(d('2026-10-05T09:00'), d('2026-10-05T10:30'))).toBe('9 am – 10:30 am');
  });

  it.each([
    ['2026-10-05T09:00', '2026-10-05T09:05', '5 min'],
    ['2026-10-05T09:00', '2026-10-05T11:00', '2 h'],
    ['2026-10-05T17:50', '2026-10-06T02:30', '8 h 40 min'],
  ])('duration %s → %s', (start, end, expected) => {
    expect(formatDuration(d(start), d(end))).toBe(expected);
  });

  it('snaps down to the step', () => {
    expect(snapMinutes(d('2026-10-05T09:44:59'), 15)).toEqual(d('2026-10-05T09:30'));
  });
});

describe('formatElapsed', () => {
  it.each([
    [0, '0:00'],
    [65_000, '1:05'],
    [12 * 60_000 + 34_000, '12:34'],
    [3_723_000, '1:02:03'],
    [-5000, '0:00'],
  ])('%i ms → %s', (ms, expected) => {
    expect(formatElapsed(ms)).toBe(expected);
  });
});
