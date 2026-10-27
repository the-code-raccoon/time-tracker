import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TimeEntry } from '../../shared/types';
import { useEntryMutations, withTimes } from './data';

const entry = (overrides: Partial<TimeEntry>): TimeEntry => ({
  id: crypto.randomUUID(),
  title: 'work',
  start: '2026-10-07T13:00:00.000Z',
  end: '2026-10-07T14:00:00.000Z',
  categoryId: null,
  notes: null,
  gcalEventId: null,
  updatedAt: '2026-10-07T12:00:00.000Z',
  ...overrides,
});

const times = { start: '2026-10-07T15:00:00.000Z', end: '2026-10-07T16:00:00.000Z' };

describe('withTimes', () => {
  it('updates the matching entry in a list', () => {
    const a = entry({});
    const b = entry({});
    expect(withTimes([a, b], b.id, times)).toEqual([a, { ...b, ...times }]);
  });

  it('updates a single cached entry (the previous-entry lookup)', () => {
    const a = entry({});
    expect(withTimes(a, a.id, times)).toEqual({ ...a, ...times });
    const other = entry({});
    expect(withTimes(other, a.id, times)).toBe(other);
  });

  it('leaves null and undefined alone', () => {
    expect(withTimes(null, 'x', times)).toBeNull();
    expect(withTimes(undefined, 'x', times)).toBeUndefined();
  });
});

describe('useEntryMutations().reschedule', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('does not crash when a non-list entries query is cached (drag, then "Move after previous entry")', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const moved = entry({ title: 'moved' });
    const previous = entry({ title: 'previous' });
    queryClient.setQueryData(['entries', 'a', 'b'], [previous, moved]);
    queryClient.setQueryData(['entries', 'previous', moved.start], previous);
    queryClient.setQueryData(['entries', 'previous', 'none'], null);
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useEntryMutations(), { wrapper });

    act(() => result.current.reschedule({ entry: moved, times }));

    expect(queryClient.getQueryData(['entries', 'a', 'b'])).toEqual([previous, { ...moved, ...times }]);
    expect(queryClient.getQueryData(['entries', 'previous', moved.start])).toBe(previous);
    expect(queryClient.getQueryData(['entries', 'previous', 'none'])).toBeNull();
  });
});
