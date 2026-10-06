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
