import type { Category, CategoryInput, GoogleStatus, PullSummary, TimeEntry, TimeEntryInput, TitleSuggestion } from '../shared/types';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  if (response.status === 204) return undefined as T;
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new ApiError(response.status, body.error ?? response.statusText);
  return body as T;
}

export async function getSession(): Promise<boolean> {
  try {
    await request('/api/auth/session');
    return true;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return false;
    throw error;
  }
}

export async function login(password: string): Promise<void> {
  await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ password }) });
}

export async function logout(): Promise<void> {
  await request('/api/auth/logout', { method: 'POST' });
}

export function fetchEntries(from: Date, to: Date): Promise<TimeEntry[]> {
  const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
  return request(`/api/entries?${params}`);
}

export function createEntry(input: TimeEntryInput): Promise<TimeEntry> {
  return request('/api/entries', { method: 'POST', body: JSON.stringify(input) });
}

export function updateEntry(id: string, patch: Partial<TimeEntryInput>): Promise<TimeEntry> {
  return request(`/api/entries/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

export function deleteEntry(id: string): Promise<void> {
  return request(`/api/entries/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function fetchCategories(): Promise<Category[]> {
  return request('/api/categories');
}

export function fetchTitles(): Promise<TitleSuggestion[]> {
  return request('/api/titles');
}

export function restoreEntry(id: string): Promise<TimeEntry> {
  return request('/api/entries/restore', { method: 'POST', body: JSON.stringify({ id }) });
}

export function moveEntriesByTitle(title: string, categoryId: string | null): Promise<{ moved: number }> {
  return request('/api/entries/recategorize', { method: 'POST', body: JSON.stringify({ title, categoryId }) });
}

export function createCategory(input: CategoryInput): Promise<Category> {
  return request('/api/categories', { method: 'POST', body: JSON.stringify(input) });
}

export function updateCategory(id: string, patch: Partial<CategoryInput>): Promise<Category> {
  return request(`/api/categories/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

/** Deletes a category, moving its entries to `moveTo` (merge) or leaving them uncategorised (null). */
export function deleteCategory(id: string, moveTo: string | null): Promise<{ moved: number }> {
  const params = new URLSearchParams({ moveTo: moveTo ?? 'none' });
  return request(`/api/categories/${encodeURIComponent(id)}?${params}`, { method: 'DELETE' });
}

export function reorderCategories(ids: string[]): Promise<Category[]> {
  return request('/api/categories/reorder', { method: 'POST', body: JSON.stringify({ ids }) });
}

export function fetchGoogleStatus(): Promise<GoogleStatus> {
  return request('/api/google/status');
}

export function disconnectGoogle(): Promise<void> {
  return request('/api/google/disconnect', { method: 'POST' });
}

export function pullFromGoogle(): Promise<PullSummary> {
  return request('/api/sync/pull', { method: 'POST' });
}

/** Full-page navigation to Google's consent screen (the server redirects). */
export function connectGoogle(): void {
  window.location.assign('/api/google/connect');
}
