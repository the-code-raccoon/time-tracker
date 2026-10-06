import { addDays } from 'date-fns';

export const MINUTES_PER_DAY = 24 * 60;

/** Short entries are drawn at least this tall, so layout treats them as at least this long. */
export const MIN_VISUAL_MINUTES = 15;

export type Positioned<T> = {
  item: T;
  /** Minutes from midnight (wall clock) where the block starts in this day, clipped to the day. */
  top: number;
  /** Minutes of height within this day. */
  height: number;
  column: number;
  columns: number;
  /** The entry continues from the previous day / into the next day. */
  continuesBefore: boolean;
  continuesAfter: boolean;
};

const wallClockMinutes = (date: Date) => date.getHours() * 60 + date.getMinutes();

/**
 * Lays out entries for one day column like Google Calendar: entries that overlap
 * (transitively) share the width of the column, each in the first free sub-column.
 */
export function layoutDay<T extends { start: string; end: string }>(items: T[], day: Date): Positioned<T>[] {
  const dayStart = day.getTime();
  const dayEnd = addDays(day, 1).getTime();

  const blocks = items
    .map((item) => ({ item, start: new Date(item.start), end: new Date(item.end) }))
    .filter(({ start, end }) => start.getTime() < dayEnd && end.getTime() > dayStart)
    .map(({ item, start, end }) => {
      const continuesBefore = start.getTime() < dayStart;
      const continuesAfter = end.getTime() > dayEnd;
      const top = continuesBefore ? 0 : wallClockMinutes(start);
      const bottom = continuesAfter || end.getTime() === dayEnd ? MINUTES_PER_DAY : wallClockMinutes(end);
      return { item, top, height: Math.max(bottom - top, 1), continuesBefore, continuesAfter };
    })
    .sort((a, b) => a.top - b.top || b.height - a.height);

  const result: Positioned<T>[] = [];
  let cluster: Positioned<T>[] = [];
  let columnEnds: number[] = [];
  let clusterEnd = -1;

  const flush = () => {
    for (const block of cluster) block.columns = columnEnds.length;
    result.push(...cluster);
    cluster = [];
    columnEnds = [];
  };

  for (const block of blocks) {
    const visualEnd = block.top + Math.max(block.height, MIN_VISUAL_MINUTES);
    if (block.top >= clusterEnd) flush();
    let column = columnEnds.findIndex((end) => end <= block.top);
    if (column === -1) column = columnEnds.push(0) - 1;
    columnEnds[column] = visualEnd;
    clusterEnd = Math.max(clusterEnd, visualEnd);
    cluster.push({ ...block, column, columns: 0 });
  }
  flush();
  return result;
}
