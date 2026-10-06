import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Category, CategoryInput, ConflictChoice, RestoreTarget, TimeEntry, TimeEntryInput, TimerInput } from '../../shared/types';
import {
  createCategory,
  createEntry,
  deleteCategory,
  deleteEntry,
  discardTimer,
  disconnectGoogle,
  fetchCategories,
  fetchGoogleStatus,
  fetchBackup,
  fetchBackups,
  fetchEntries,
  fetchPreviousEntry,
  fetchReport,
  fetchTimer,
  fetchTitles,
  moveEntriesByTitle,
  fetchConflicts,
  pullFromGoogle,
  resolveConflicts,
  syncWithGoogle,
  reorderCategories,
  restoreBackup,
  restoreEntry,
  searchEntries,
  startTimer,
  stopTimer,
  updateCategory,
  updateEntry,
  updateTimer,
} from '../api';

export function useCategories() {
  return useQuery({ queryKey: ['categories'], queryFn: fetchCategories, staleTime: 60 * 1000 });
}

export function useTitles() {
  return useQuery({ queryKey: ['titles'], queryFn: fetchTitles, staleTime: 5 * 60 * 1000 });
}

export function useEntries(from: Date, to: Date) {
  return useQuery({
    queryKey: ['entries', from.toISOString(), to.toISOString()],
    queryFn: () => fetchEntries(from, to),
    placeholderData: keepPreviousData,
  });
}

/** TE-8: the last entry before `before`, for the new-entry editor. */
export function usePreviousEntry(before: Date) {
  return useQuery({
    queryKey: ['entries', 'previous', before.toISOString()],
    queryFn: () => fetchPreviousEntry(before),
    placeholderData: keepPreviousData,
  });
}

/** Refreshes everything derived from entries: lists, title suggestions, category stats and sync status. */
function useInvalidateAll() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      ['entries', 'titles', 'categories', 'google', 'conflicts', 'reports', 'backups'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    );
}

export function useSearch(query: string) {
  return useQuery({
    queryKey: ['entries', 'search', query],
    queryFn: () => searchEntries(query),
    enabled: query.trim().length > 0,
    placeholderData: keepPreviousData,
  });
}

type Times = { start: string; end: string };

export function useEntryMutations() {
  const queryClient = useQueryClient();
  const onSuccess = useInvalidateAll();

  /** Writes new times into every cached entry list, so a dropped entry stays where it was dropped (DRAG-5). */
  const setCachedTimes = (id: string, times: Times) =>
    queryClient.setQueriesData<TimeEntry[]>({ queryKey: ['entries'] }, (entries) =>
      entries?.map((entry) => (entry.id === id ? { ...entry, ...times } : entry)),
    );

  const rescheduleMutation = useMutation({
    mutationFn: ({ entry, times }: { entry: TimeEntry; times: Times }) => updateEntry(entry.id, times),
    onError: (_error, { entry }) => setCachedTimes(entry.id, { start: entry.start, end: entry.end }),
    onSettled: onSuccess,
  });

  return {
    /**
     * Moves or resizes an entry, showing the change at once and putting it back if the save fails. The cache is
     * written before the request starts (not in onMutate, which runs a microtask later) so the drag preview can be
     * cleared without the entry flashing back to its old place.
     */
    reschedule(variables: { entry: TimeEntry; times: Times }, options?: Parameters<typeof rescheduleMutation.mutate>[1]) {
      void queryClient.cancelQueries({ queryKey: ['entries'] });
      setCachedTimes(variables.entry.id, variables.times);
      rescheduleMutation.mutate(variables, options);
    },
    create: useMutation({ mutationFn: (input: TimeEntryInput) => createEntry(input), onSuccess }),
    update: useMutation({
      mutationFn: ({ id, patch }: { id: string; patch: Partial<TimeEntryInput> }) => updateEntry(id, patch),
      onSuccess,
    }),
    remove: useMutation({ mutationFn: (id: string) => deleteEntry(id), onSuccess }),
    restore: useMutation({ mutationFn: (id: string) => restoreEntry(id), onSuccess }),
    moveByTitle: useMutation({
      mutationFn: ({ title, categoryId }: { title: string; categoryId: string | null }) => moveEntriesByTitle(title, categoryId),
      onSuccess,
    }),
  };
}

export function useCategoryMutations() {
  const queryClient = useQueryClient();
  const onSuccess = useInvalidateAll();
  return {
    create: useMutation({ mutationFn: (input: CategoryInput) => createCategory(input), onSuccess }),
    update: useMutation({
      mutationFn: ({ id, patch }: { id: string; patch: Partial<CategoryInput> }) => updateCategory(id, patch),
      onSuccess,
    }),
    remove: useMutation({
      mutationFn: ({ id, moveTo }: { id: string; moveTo: string | null }) => deleteCategory(id, moveTo),
      onSuccess,
    }),
    reorder: useMutation({
      mutationFn: (ids: string[]) => reorderCategories(ids),
      // Show the new order immediately; roll back if the server rejects it.
      onMutate: async (ids) => {
        await queryClient.cancelQueries({ queryKey: ['categories'] });
        const previous = queryClient.getQueryData<Category[]>(['categories']);
        if (previous) {
          const byId = new Map(previous.map((c) => [c.id, c]));
          queryClient.setQueryData(['categories'], ids.map((id, i) => ({ ...byId.get(id)!, sortOrder: i + 1 })));
        }
        return { previous };
      },
      onError: (_error, _ids, context) => queryClient.setQueryData(['categories'], context?.previous),
      onSettled: () => queryClient.invalidateQueries({ queryKey: ['categories'] }),
    }),
  };
}

export function useGoogleStatus() {
  return useQuery({ queryKey: ['google'], queryFn: fetchGoogleStatus });
}

/** Pull only (used for the first import, so it can be reviewed before anything is written to Google). */
export function usePull() {
  return useMutation({ mutationFn: pullFromGoogle, onSuccess: useInvalidateAll() });
}

/** Two-way sync (SYNC-1), then refresh everything. */
export function useSync() {
  return useMutation({ mutationFn: syncWithGoogle, onSuccess: useInvalidateAll() });
}

export function useConflicts(enabled = true) {
  return useQuery({ queryKey: ['conflicts'], queryFn: fetchConflicts, enabled });
}

export function useResolveConflicts() {
  return useMutation({
    mutationFn: (resolutions: { entryId: string; choice: ConflictChoice }[]) => resolveConflicts(resolutions),
    onSuccess: useInvalidateAll(),
  });
}

export function useDisconnectGoogle() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: disconnectGoogle, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['google'] }) });
}

export function useTimer() {
  // TE-5: the timer lives on the server, so check again whenever the app comes back into view
  // (a timer started on the phone shows up on the desktop).
  return useQuery({ queryKey: ['timer'], queryFn: fetchTimer, refetchOnWindowFocus: true, staleTime: 30 * 1000 });
}

export function useTimerMutations() {
  const queryClient = useQueryClient();
  const invalidateAll = useInvalidateAll();
  const setTimer = (timer: unknown) => queryClient.setQueryData(['timer'], timer ?? null);
  // A 404/409 means another device changed the timer: show what's there now.
  const onError = () => queryClient.invalidateQueries({ queryKey: ['timer'] });
  return {
    start: useMutation({ mutationFn: (input: TimerInput) => startTimer(input), onSuccess: setTimer, onError }),
    update: useMutation({ mutationFn: (patch: Partial<TimerInput>) => updateTimer(patch), onSuccess: setTimer, onError }),
    discard: useMutation({ mutationFn: discardTimer, onSuccess: () => setTimer(null), onError }),
    stop: useMutation({
      mutationFn: stopTimer,
      onSuccess: () => {
        setTimer(null);
        return invalidateAll();
      },
      onError,
    }),
  };
}

export function useReport(from: Date, to: Date) {
  return useQuery({
    queryKey: ['reports', from.toISOString(), to.toISOString()],
    queryFn: () => fetchReport(from, to),
    placeholderData: keepPreviousData,
  });
}

export function useBackups() {
  return useQuery({ queryKey: ['backups'], queryFn: fetchBackups });
}

export function useBackup(id: string | null) {
  return useQuery({ queryKey: ['backups', id], queryFn: () => fetchBackup(id!), enabled: id !== null });
}

export function useRestoreBackup() {
  return useMutation({
    mutationFn: ({ id, target, keys }: { id: string; target: RestoreTarget; keys?: string[] }) => restoreBackup(id, target, keys),
    onSuccess: useInvalidateAll(),
  });
}
