import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { GoogleStatus } from '../../../shared/types';
import { mockApi, requestsTo } from '../../test/mockApi';
import { renderWithProviders } from '../../test/render';
import { GoogleCalendarSection } from './GoogleCalendarSection';

const connected: GoogleStatus = {
  configured: true,
  connected: true,
  email: 'me@example.com',
  calendarId: 'schedule@group.calendar.google.com',
  lastPullAt: null,
  pendingConflicts: 0,
};

function setup(status: GoogleStatus, routes = {}, oauthResult: Parameters<typeof GoogleCalendarSection>[0]['oauthResult'] = null) {
  const fetchMock = mockApi({ 'GET /api/google/status': () => ({ status: 200, body: status }), ...routes });
  renderWithProviders(<GoogleCalendarSection oauthResult={oauthResult} />);
  return { fetchMock, user: userEvent.setup() };
}

describe('GoogleCalendarSection', () => {
  it('explains when the server is not configured', async () => {
    setup({ configured: false, connected: false });
    expect(await screen.findByText(/isn't set up on the server/)).toBeInTheDocument();
  });

  it('offers to connect', async () => {
    setup({ ...connected, connected: false, email: null });
    expect(await screen.findByRole('button', { name: 'Connect Google Calendar' })).toBeInTheDocument();
  });

  it('shows the OAuth result', async () => {
    setup(connected, {}, { result: 'error', detail: 'Access was not granted.' });
    expect(await screen.findByText("Couldn't connect Google Calendar: Access was not granted.")).toBeInTheDocument();
  });

  it('imports the first time, then shows the summary', async () => {
    const { fetchMock, user } = setup(connected, {
      'POST /api/sync/pull': () => ({ status: 200, body: { full: true, fetched: 10, imported: 9, updated: 0, deleted: 0, conflicts: 0, skipped: 1 } }),
    });
    expect(await screen.findByText('Connected as me@example.com')).toBeInTheDocument();
    expect(screen.getByText('Not synced yet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Import from Google Calendar' }));
    expect(await screen.findByText('Imported 9 entries')).toBeInTheDocument();
    expect(requestsTo(fetchMock, 'POST', '/api/sync/pull')).toHaveLength(1);
  });

  it('shows pending conflicts and pull errors', async () => {
    const { user } = setup(
      { ...connected, lastPullAt: new Date().toISOString(), pendingConflicts: 2 },
      { 'POST /api/sync/pull': () => ({ status: 502, body: { error: 'Google sign-in expired or was revoked' } }) },
    );
    expect(await screen.findByText(/2 entries were changed in both places/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sync now' }));
    expect(await screen.findByText('Google sign-in expired or was revoked')).toBeInTheDocument();
  });

  it('disconnects after confirming', async () => {
    const { fetchMock, user } = setup(connected, { 'POST /api/google/disconnect': () => ({ status: 200, body: { connected: false } }) });
    await user.click(await screen.findByRole('button', { name: 'Disconnect' }));
    expect(screen.getByText('Disconnect? Your entries stay in the app.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Disconnect' }));
    await waitFor(() => expect(requestsTo(fetchMock, 'POST', '/api/google/disconnect')).toHaveLength(1));
  });
});
