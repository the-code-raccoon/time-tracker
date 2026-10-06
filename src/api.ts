import type {
  Category,
  CategoryInput,
  Conflict,
  ConflictChoice,
  GoogleStatus,
  PullSummary,
  SyncSummary,
  TimeEntry,
  TimeEntryInput,
  Timer,
  TimerInput,
  TitleSuggestion,
  BackupDetail,
  BackupSummary,
  Report,
  RestoreSummary,
  RestoreTarget,
} from '../shared/types';

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

/** The password step. Returns the Google sign-in URL to continue at; the session is set when Google redirects back. */
export async function login(password: string): Promise<string> {
  const { redirect } = await request<{ redirect: string }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ password }) });
  return redirect;
}

export async function logout(): Promise<void> {
  await request('/api/auth/logout', { method: 'POST' });
}

export function fetchEntries(from: Date, to: Date): Promise<TimeEntry[]> {
  const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
  return request(`/api/entries?${params}`);
}

/** Search (`/`): entries whose title or notes match, newest first. */
export function searchEntries(query: string): Promise<TimeEntry[]> {
  return request(`/api/entries?${new URLSearchParams({ q: query })}`);
}

/** TE-8: the last entry before `before`, or null. */
export function fetchPreviousEntry(before: Date): Promise<TimeEntry | null> {
  return request(`/api/entries?${new URLSearchParams({ before: before.toISOString() })}`);
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

/** Two-way sync: pull from Google, then push app changes (SYNC-1). */
export function syncWithGoogle(): Promise<SyncSummary> {
  return request('/api/sync', { method: 'POST' });
}

export function fetchConflicts(): Promise<Conflict[]> {
  return request('/api/sync/conflicts');
}

export function resolveConflicts(resolutions: { entryId: string; choice: ConflictChoice }[]): Promise<{ resolved: number }> {
  return request('/api/sync/resolve', { method: 'POST', body: JSON.stringify({ resolutions }) });
}

export function fetchTimer(): Promise<Timer | null> {
  return request('/api/timer');
}

export function startTimer(input: TimerInput): Promise<Timer> {
  return request('/api/timer', { method: 'POST', body: JSON.stringify(input) });
}

export function updateTimer(patch: Partial<TimerInput>): Promise<Timer> {
  return request('/api/timer', { method: 'PATCH', body: JSON.stringify(patch) });
}

export function discardTimer(): Promise<void> {
  return request('/api/timer', { method: 'DELETE' });
}

/** Stops the timer and logs it; returns the new entry. */
export function stopTimer(): Promise<TimeEntry> {
  return request('/api/timer/stop', { method: 'POST' });
}

const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** REP-1/REP-2 for [from, to), split into days in this device's time zone (TE-7). */
export function fetchReport(from: Date, to: Date): Promise<Report> {
  return request(`/api/reports?${new URLSearchParams({ from: from.toISOString(), to: to.toISOString(), tz: timeZone() })}`);
}

/** REP-3: download link for the entries in [from, to) as CSV (same-origin, so the session cookie goes with it). */
export function reportCsvUrl(from: Date, to: Date, name: string): string {
  return `/api/reports?${new URLSearchParams({ from: from.toISOString(), to: to.toISOString(), tz: timeZone(), format: 'csv', name })}`;
}

export function fetchBackups(): Promise<BackupSummary[]> {
  return request('/api/backups');
}

export function fetchBackup(id: string): Promise<BackupDetail> {
  return request(`/api/backups/${encodeURIComponent(id)}`);
}

/** BAK-4: restore all of a backup, or the items in `keys`. */
export function restoreBackup(id: string, target: RestoreTarget, keys?: string[]): Promise<RestoreSummary> {
  return request(`/api/backups/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify({ target, keys }) });
}
