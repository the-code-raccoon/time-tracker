import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Category, CategoryInput, TimeEntryInput } from '../../shared/types';
import {
  createCategory,
  createEntry,
  deleteCategory,
  deleteEntry,
  fetchCategories,
  fetchEntries,
  fetchTitles,
  moveEntriesByTitle,
  reorderCategories,
  restoreEntry,
  updateCategory,
  updateEntry,
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

/** Refreshes everything derived from entries: lists, title suggestions and category stats. */
function useInvalidateAll() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(['entries', 'titles', 'categories'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
}

export function useEntryMutations() {
  const onSuccess = useInvalidateAll();
  return {
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
