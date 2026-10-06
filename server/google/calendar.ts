const API = 'https://www.googleapis.com/calendar/v3';

export type GoogleEventTime = { dateTime?: string; date?: string; timeZone?: string };

export type GoogleEvent = {
  id: string;
  status?: 'confirmed' | 'tentative' | 'cancelled';
  etag?: string;
  summary?: string;
  description?: string;
  colorId?: string;
  start?: GoogleEventTime;
  end?: GoogleEventTime;
  updated?: string;
};

type EventsPage = { items?: GoogleEvent[]; nextPageToken?: string; nextSyncToken?: string; summary?: string };

/** Google answered 410 Gone: the sync token expired and a full sync is needed (SYNC-9). */
export class SyncTokenExpiredError extends Error {}

export class GoogleApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const FIELDS = 'items(id,status,etag,summary,description,colorId,start,end,updated),nextPageToken,nextSyncToken,summary';

/**
 * Lists every event (all pages). With a sync token, only changes since then — including deletions.
 * Recurring events are expanded into instances (`singleEvents`), as SYNC-11 requires.
 */
export async function listAllEvents(
  accessToken: string,
  calendarId: string,
  syncToken: string | null,
): Promise<{ events: GoogleEvent[]; nextSyncToken: string; calendarName?: string }> {
  const events: GoogleEvent[] = [];
  let pageToken: string | undefined;
  let calendarName: string | undefined;

  for (;;) {
    const params = new URLSearchParams({ singleEvents: 'true', showDeleted: 'true', maxResults: '2500', fields: FIELDS });
    if (syncToken) params.set('syncToken', syncToken);
    if (pageToken) params.set('pageToken', pageToken);

    const response = await fetch(`${API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (response.status === 410) throw new SyncTokenExpiredError('Sync token expired');
    const page = (await response.json().catch(() => ({}))) as EventsPage & { error?: { message?: string } };
    if (!response.ok) throw new GoogleApiError(response.status, page.error?.message ?? `Google Calendar request failed (${response.status})`);

    events.push(...(page.items ?? []));
    calendarName ??= page.summary;
    if (page.nextPageToken) {
      pageToken = page.nextPageToken;
      continue;
    }
    if (!page.nextSyncToken) throw new GoogleApiError(502, 'Google Calendar returned no sync token');
    return { events, nextSyncToken: page.nextSyncToken, calendarName };
  }
}

/** Fields the app writes. `null` clears a field (e.g. colorId → calendar default). */
export type EventWrite = {
  summary?: string;
  description?: string | null;
  colorId?: string | null;
  start?: { dateTime: string };
  end?: { dateTime: string };
};

/** The event changed in Google since we last saw it (If-Match failed), or is gone. */
export class EventChangedError extends Error {
  readonly gone: boolean;

  constructor(gone: boolean) {
    super(gone ? 'Event no longer exists in Google Calendar' : 'Event changed in Google Calendar');
    this.gone = gone;
  }
}

async function eventRequest(accessToken: string, calendarId: string, path: string, init: RequestInit & { etag?: string | null } = {}) {
  const { etag, ...rest } = init;
  const headers = new Headers(rest.headers);
  headers.set('authorization', `Bearer ${accessToken}`);
  if (rest.body) headers.set('content-type', 'application/json');
  if (etag) headers.set('if-match', etag);
  const response = await fetch(`${API}/calendars/${encodeURIComponent(calendarId)}/events${path}`, { ...rest, headers });
  if (response.status === 412) throw new EventChangedError(false);
  if (response.status === 404 || response.status === 410) throw new EventChangedError(true);
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new GoogleApiError(response.status, body.error?.message ?? `Google Calendar request failed (${response.status})`);
  }
  return response;
}

export async function insertEvent(accessToken: string, calendarId: string, event: EventWrite): Promise<GoogleEvent> {
  const response = await eventRequest(accessToken, calendarId, '', { method: 'POST', body: JSON.stringify(event) });
  return (await response.json()) as GoogleEvent;
}

/** Patches an event only if it is unchanged since `etag` (otherwise EventChangedError). */
export async function patchEvent(accessToken: string, calendarId: string, eventId: string, event: EventWrite, etag: string | null): Promise<GoogleEvent> {
  const response = await eventRequest(accessToken, calendarId, `/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    body: JSON.stringify(event),
    etag,
  });
  return (await response.json()) as GoogleEvent;
}

/** Deletes an event. Already gone counts as success. */
export async function deleteEvent(accessToken: string, calendarId: string, eventId: string, etag: string | null): Promise<void> {
  try {
    await eventRequest(accessToken, calendarId, `/${encodeURIComponent(eventId)}`, { method: 'DELETE', etag });
  } catch (error) {
    if (error instanceof EventChangedError && error.gone) return;
    throw error;
  }
}

/** The current event, or a cancelled stub if it no longer exists. */
export async function getEvent(accessToken: string, calendarId: string, eventId: string): Promise<GoogleEvent> {
  try {
    const response = await eventRequest(accessToken, calendarId, `/${encodeURIComponent(eventId)}`);
    return (await response.json()) as GoogleEvent;
  } catch (error) {
    if (error instanceof EventChangedError && error.gone) return { id: eventId, status: 'cancelled' };
    throw error;
  }
}
