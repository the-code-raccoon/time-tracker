import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TimeEntryInput } from '../../shared/types';
import { createEntry, deleteEntry, fetchCategories, fetchEntries, fetchTitles, updateEntry } from '../api';

export function useCategories() {
  return useQuery({ queryKey: ['categories'], queryFn: fetchCategories, staleTime: Infinity });
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

/** Create, update and delete entries; every change refreshes entry lists and title suggestions. */
export function useEntryMutations() {
  const queryClient = useQueryClient();
  const onSuccess = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['entries'] }),
      queryClient.invalidateQueries({ queryKey: ['titles'] }),
    ]);

  return {
    create: useMutation({ mutationFn: (input: TimeEntryInput) => createEntry(input), onSuccess }),
    update: useMutation({
      mutationFn: ({ id, patch }: { id: string; patch: Partial<TimeEntryInput> }) => updateEntry(id, patch),
      onSuccess,
    }),
    remove: useMutation({ mutationFn: (id: string) => deleteEntry(id), onSuccess }),
  };
}
