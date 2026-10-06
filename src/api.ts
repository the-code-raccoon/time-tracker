import type { Category, TimeEntry, TimeEntryInput, TitleSuggestion } from '../shared/types';

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
