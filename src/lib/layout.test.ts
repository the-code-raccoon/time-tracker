import { describe, expect, it } from 'vitest';
import { layoutDay } from './layout';

const day = new Date('2026-10-05T00:00');
const entry = (id: string, start: string, end: string) => ({
  id,
  start: new Date(`2026-10-${start}`).toISOString(),
  end: new Date(`2026-10-${end}`).toISOString(),
});
const summary = (items: ReturnType<typeof entry>[]) =>
  layoutDay(items, day).map(({ item, top, height, column, columns }) => [item.id, top, height, column, columns]);

describe('layoutDay', () => {
  it('positions a single entry by wall-clock minutes', () => {
    expect(summary([entry('a', '05T09:00', '05T10:30')])).toEqual([['a', 540, 90, 0, 1]]);
  });

  it('ignores entries on other days', () => {
    expect(summary([entry('a', '04T09:00', '04T10:00'), entry('b', '06T00:00', '06T01:00')])).toEqual([]);
  });

  it('splits overlapping entries into columns', () => {
    expect(summary([entry('work', '05T09:00', '05T17:00'), entry('breakfast', '05T09:55', '05T10:20')])).toEqual([
      ['work', 540, 480, 0, 2],
      ['breakfast', 595, 25, 1, 2],
    ]);
  });

  it('reuses a free column and keeps the cluster width', () => {
    expect(
      summary([entry('a', '05T09:00', '05T12:00'), entry('b', '05T09:00', '05T10:00'), entry('c', '05T10:00', '05T11:00')]),
    ).toEqual([
      ['a', 540, 180, 0, 2],
      ['b', 540, 60, 1, 2],
      ['c', 600, 60, 1, 2],
    ]);
  });

  it('gives back-to-back entries the full width', () => {
    expect(summary([entry('a', '05T09:00', '05T09:30'), entry('b', '05T09:30', '05T10:00')])).toEqual([
      ['a', 540, 30, 0, 1],
      ['b', 570, 30, 0, 1],
    ]);
  });

  it('treats very short entries as at least 15 minutes tall so they do not cover each other', () => {
    expect(summary([entry('a', '05T09:00', '05T09:05'), entry('b', '05T09:05', '05T09:10')])).toEqual([
      ['a', 540, 5, 0, 2],
      ['b', 545, 5, 1, 2],
    ]);
  });

  it('clips entries that cross midnight on both sides', () => {
    const [first] = layoutDay([entry('late', '04T22:00', '05T02:30')], day);
    expect(first).toMatchObject({ top: 0, height: 150, continuesBefore: true, continuesAfter: false });
    const [second] = layoutDay([entry('late', '05T17:50', '06T02:30')], day);
    expect(second).toMatchObject({ top: 1070, height: 370, continuesBefore: false, continuesAfter: true });
  });

  it('runs an entry ending exactly at midnight to the bottom', () => {
    expect(summary([entry('a', '05T23:00', '06T00:00')])).toEqual([['a', 1380, 60, 0, 1]]);
  });
});
