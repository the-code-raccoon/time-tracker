import { describe, expect, it } from 'vitest';
import { formatPullSummary, formatSyncSummary } from './sync';

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

describe('formatSyncSummary (SYNC-8)', () => {
  const push = { created: 0, updated: 0, deleted: 0, conflicts: 0, remaining: 0, failed: [] as { entryId: string; title: string; error: string }[] };
  it.each([
    [{}, {}, 'Already up to date'],
    [{ imported: 2, updated: 1 }, { created: 1, deleted: 1 }, 'Synced 3 from Google, 2 to Google'],
    [{ conflicts: 1 }, { conflicts: 1 }, 'Already up to date · 2 entries need reconciling'],
    [{}, { updated: 5, remaining: 40 }, 'Synced 5 to Google · 40 more on the next sync'],
    [{}, { failed: [{ entryId: 'x', title: 'x', error: 'boom' }] }, 'Already up to date · 1 change failed'],
  ])('%j / %j → %s', (pullChanges, pushChanges, expected) => {
    expect(formatSyncSummary({ pull: { ...base, ...pullChanges }, push: { ...push, ...pushChanges } })).toBe(expected);
  });
});
