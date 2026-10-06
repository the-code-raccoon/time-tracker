import { describe, expect, it } from 'vitest';
import { formatPullSummary } from './sync';

const base = { full: false, fetched: 0, imported: 0, updated: 0, deleted: 0, conflicts: 0, skipped: 0 };

describe('formatPullSummary', () => {
  it.each([
    [{}, 'Already up to date'],
    [{ imported: 2431 }, 'Imported 2,431 entries'],
    [{ imported: 1, updated: 2, deleted: 3 }, 'Imported 1 entry, updated 2, removed 3'],
    [{ updated: 2 }, 'Updated 2'],
    [{ conflicts: 1 }, 'Already up to date · 1 entry needs reconciling'],
    [{ updated: 1, conflicts: 3 }, 'Updated 1 · 3 entries need reconciling'],
  ])('%j → %s', (changes, expected) => {
    expect(formatPullSummary({ ...base, ...changes })).toBe(expected);
  });
});
