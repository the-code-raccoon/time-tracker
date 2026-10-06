import { describe, expect, it } from 'vitest';
import { createTimes, moveTimes, resizeTimes, sameTimes } from './drag';

const d = (iso: string) => new Date(iso); // no offset → local time
const entry = (start: string, end: string) => ({ start: d(start).toISOString(), end: d(end).toISOString() });
const local = ({ start, end }: { start: Date; end: Date }) => [start, end].map((date) => date.toISOString());
const expected = (start: string, end: string) => [d(start).toISOString(), d(end).toISOString()];

describe('moveTimes (DRAG-1, DRAG-2, DRAG-9)', () => {
  const coffee = entry('2026-10-05T09:40', '2026-10-05T10:10');

  it('moves in 15-minute steps from the entry\'s own time, keeping its duration', () => {
    expect(local(moveTimes(coffee, 15, 0))).toEqual(expected('2026-10-05T09:55', '2026-10-05T10:25'));
    expect(local(moveTimes(coffee, 30, 0))).toEqual(expected('2026-10-05T10:10', '2026-10-05T10:40'));
    expect(local(moveTimes(coffee, -15, 0))).toEqual(expected('2026-10-05T09:25', '2026-10-05T09:55'));
  });

  it('rounds the pointer distance to the nearest step', () => {
    expect(local(moveTimes(coffee, 7, 0))).toEqual(local(moveTimes(coffee, 0, 0)));
    expect(local(moveTimes(coffee, 8, 0))).toEqual(local(moveTimes(coffee, 15, 0)));
    expect(local(moveTimes(coffee, -22, 0))).toEqual(local(moveTimes(coffee, -15, 0)));
  });

  it('moves to another day at the same time of day', () => {
    expect(local(moveTimes(coffee, 0, 2))).toEqual(expected('2026-10-07T09:40', '2026-10-07T10:10'));
    expect(local(moveTimes(coffee, 15, -1))).toEqual(expected('2026-10-04T09:55', '2026-10-04T10:25'));
  });

  it('moves an entry that crosses midnight as one block', () => {
    const late = entry('2026-10-05T23:00', '2026-10-06T01:00');
    expect(local(moveTimes(late, 30, 0))).toEqual(expected('2026-10-05T23:30', '2026-10-06T01:30'));
  });

  it('keeps the wall-clock time when moving across a daylight-saving change', () => {
    const work = entry('2026-10-31T09:00', '2026-10-31T17:00'); // clocks go back on Nov 1
    expect(local(moveTimes(work, 0, 2))).toEqual(expected('2026-11-02T09:00', '2026-11-02T17:00'));
  });
});

describe('resizeTimes (DRAG-3)', () => {
  it('moves the end in 15-minute steps from its current time', () => {
    expect(local(resizeTimes(entry('2026-10-05T09:00', '2026-10-05T09:40'), 15))).toEqual(expected('2026-10-05T09:00', '2026-10-05T09:55'));
  });

  it('keeps at least 5 minutes, so 5-minute entries can still be resized', () => {
    expect(local(resizeTimes(entry('2026-10-05T09:00', '2026-10-05T09:05'), -60))).toEqual(expected('2026-10-05T09:00', '2026-10-05T09:05'));
    expect(local(resizeTimes(entry('2026-10-05T09:00', '2026-10-05T09:05'), 15))).toEqual(expected('2026-10-05T09:00', '2026-10-05T09:20'));
  });

  it('keeps at most 24 hours', () => {
    expect(local(resizeTimes(entry('2026-10-05T09:00', '2026-10-05T10:00'), 30 * 60))).toEqual(expected('2026-10-05T09:00', '2026-10-06T09:00'));
  });
});

describe('createTimes (DRAG-4)', () => {
  const day = d('2026-10-05T00:00');
  const at = (hour: number, minute = 0) => hour * 60 + minute;

  it('selects from the slot pressed to the slot under the pointer', () => {
    expect(local(createTimes(day, at(9, 5), at(10, 20)))).toEqual(expected('2026-10-05T09:00', '2026-10-05T10:30'));
  });

  it('is at least one slot long', () => {
    expect(local(createTimes(day, at(9, 5), at(9, 6)))).toEqual(expected('2026-10-05T09:00', '2026-10-05T09:15'));
  });

  it('works dragging upwards', () => {
    expect(local(createTimes(day, at(10, 5), at(8, 50)))).toEqual(expected('2026-10-05T08:45', '2026-10-05T10:15'));
  });

  it('stays within the day', () => {
    expect(local(createTimes(day, at(23, 0), at(25, 0)))).toEqual(expected('2026-10-05T23:00', '2026-10-06T00:00'));
    expect(local(createTimes(day, at(0, 30), -40))).toEqual(expected('2026-10-05T00:00', '2026-10-05T00:45'));
  });
});

it('sameTimes compares against stored ISO strings', () => {
  const stored = entry('2026-10-05T09:00', '2026-10-05T10:00');
  expect(sameTimes(moveTimes(stored, 5, 0), stored)).toBe(true);
  expect(sameTimes(moveTimes(stored, 10, 0), stored)).toBe(false);
});
