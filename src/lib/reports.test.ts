import { describe, expect, it } from 'vitest';
import type { Category, Report } from '../../shared/types';
import { dayMinutes, hourTicks, minutesLabel, presetRange, rangeLabel, seriesOf, shiftPreset } from './reports';

const d = (iso: string) => new Date(iso);

describe('report ranges (REP-1)', () => {
  it.each([
    ['day', '2026-10-07T15:00', '2026-10-07T00:00', '2026-10-08T00:00', 'Oct 7, 2026'],
    ['week', '2026-10-07T15:00', '2026-10-04T00:00', '2026-10-11T00:00', 'Oct 4 – 10, 2026'],
    ['week', '2026-10-01T15:00', '2026-09-27T00:00', '2026-10-04T00:00', 'Sep 27 – Oct 3, 2026'],
    ['week', '2026-12-30T15:00', '2026-12-27T00:00', '2027-01-03T00:00', 'Dec 27, 2026 – Jan 2, 2027'],
    ['month', '2026-10-07T15:00', '2026-10-01T00:00', '2026-11-01T00:00', 'October 2026'],
  ] as const)('%s of %s', (preset, date, start, end, label) => {
    const range = presetRange(preset, d(date));
    expect(range).toEqual({ start: d(start), end: d(end) });
    expect(rangeLabel(range, preset)).toBe(label);
  });

  it('labels a custom range', () => {
    expect(rangeLabel({ start: d('2026-04-13T00:00'), end: d('2026-10-06T00:00') }, 'custom')).toBe('Apr 13 – Oct 5, 2026');
  });

  it('steps by the preset', () => {
    expect(shiftPreset('month', d('2026-10-31T12:00'), 1)).toEqual(d('2026-11-30T12:00'));
    expect(shiftPreset('week', d('2026-10-07T12:00'), -1)).toEqual(d('2026-09-30T12:00'));
  });
});

describe('series', () => {
  const cat = (id: string, name: string, sortOrder: number): Category => ({
    id, name, appColor: `#00000${sortOrder}`, gcalColorId: null, sortOrder, entryCount: 0, totalMinutes: 0, syncedCount: 0,
  });
  const categories = [cat('food', 'Food', 1), cat('work', 'Work', 2), cat('gym', 'Exercise', 3)];
  const report: Report = {
    days: [{ date: '2026-10-05', minutes: { work: 480, '': 30, gone: 15 } }],
    categories: [
      { categoryId: 'work', minutes: 480, entries: 1 },
      { categoryId: null, minutes: 30, entries: 2 },
      { categoryId: 'gone', minutes: 15, entries: 1 },
      { categoryId: 'food', minutes: 10, entries: 1 },
    ],
    activities: [],
  };

  it('follows the category order, with uncategorised (and deleted categories) last', () => {
    expect(seriesOf(report, categories, '#5f6368').map((s) => [s.key, s.name, s.color, s.minutes, s.entries])).toEqual([
      ['food', 'Food', '#000001', 10, 1],
      ['work', 'Work', '#000002', 480, 1],
      ['', 'No category', '#5f6368', 45, 3],
    ]);
  });

  it('reads a day\'s minutes the same way', () => {
    const series = seriesOf(report, categories, '#5f6368');
    expect(dayMinutes(report.days[0], series, 'work')).toBe(480);
    expect(dayMinutes(report.days[0], series, '')).toBe(45);
    expect(dayMinutes(report.days[0], series, 'food')).toBe(0);
  });
});

describe('formatting', () => {
  it.each([
    [0, [0, 1]],
    [3.5, [0, 1, 2, 3, 4]],
    [7, [0, 2, 4, 6, 8]],
    [17.2, [0, 6, 12, 18]],
    [26, [0, 12, 24, 36]],
  ])('ticks for %f h', (max, ticks) => {
    expect(hourTicks(max)).toEqual(ticks);
  });

  it.each([
    [0, '0 min'],
    [45, '45 min'],
    [120, '2 h'],
    [520.4, '8 h 40 min'],
  ])('%f min → %s', (minutes, label) => {
    expect(minutesLabel(minutes)).toBe(label);
  });
});
