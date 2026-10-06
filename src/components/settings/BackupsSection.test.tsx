import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { BackupDetail, BackupSummary } from '../../../shared/types';
import { CATEGORIES, mockApi, requestsTo } from '../../test/mockApi';
import { renderWithProviders } from '../../test/render';
import { BackupsSection } from './BackupsSection';
import { InstallSection } from './InstallSection';

const summary: BackupSummary = {
  id: '30000000-0000-4000-8000-000000000001',
  createdAt: new Date('2026-10-05T08:00').toISOString(),
  trigger: 'daily',
  description: 'Daily backup',
  entryCount: 3,
  eventCount: 2,
};
const copy = (title: string, start: string, extra = {}) => ({
  deleted: false,
  title,
  start: new Date(`2026-10-05T${start}`).toISOString(),
  end: new Date(new Date(`2026-10-05T${start}`).getTime() + 30 * 60_000).toISOString(),
  categoryId: CATEGORIES[1].id,
  notes: null,
  ...extra,
});
const detail: BackupDetail = {
  ...summary,
  items: [
    { key: 'a', entryId: 'a', eventId: 'ga', app: copy('work', '09:00'), google: copy('work', '09:00', { colorId: '8' }), appChanged: true, googleChanged: false },
    { key: 'b', entryId: 'b', eventId: null, app: copy('journal', '22:00', { deleted: true }), google: null, appChanged: true, googleChanged: false },
    { key: 'c', entryId: 'c', eventId: 'gc', app: copy('chill', '20:00'), google: copy('chill', '20:00', { colorId: '7' }), appChanged: false, googleChanged: false },
  ],
};
const connected = { configured: true, connected: true, email: null, calendarId: 'cal', lastPullAt: null, pendingConflicts: 0 };

describe('Backups (BAK-4)', () => {
  it('lists backups and shows what differs from now', async () => {
    const user = userEvent.setup();
    mockApi({ 'GET /api/backups': () => ({ status: 200, body: [summary] }), 'GET /api/backups/*': () => ({ status: 200, body: detail }) });
    renderWithProviders(<BackupsSection />);

    await user.click(await screen.findByRole('button', { name: /Daily backup.*3 entries · 2 events/ }));
    const dialog = await screen.findByRole('dialog', { name: /Daily backup · Oct 5, 2026/ });
    const list = await within(dialog).findByRole('list', { name: 'Backed-up items' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2); // chill is the same as now
    expect(within(list).getAllByText('Differs from now')).toHaveLength(2);
    expect(within(list).getByText('Deleted')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('switch', { name: 'Only what differs from now' }));
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    await user.type(within(dialog).getByRole('textbox', { name: 'Filter by title' }), 'chi');
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
  });

  it('restores chosen items after confirming, and reports the result', async () => {
    const user = userEvent.setup();
    const fetchMock = mockApi({
      'GET /api/backups': () => ({ status: 200, body: [summary] }),
      'GET /api/backups/*': () => ({ status: 200, body: detail }),
      'POST /api/backups/*': () => ({ status: 200, body: { app: 1, google: 0, unchanged: 0, remaining: 0, failed: [] } }),
    });
    renderWithProviders(<BackupsSection />);
    await user.click(await screen.findByRole('button', { name: /Daily backup/ }));
    const dialog = await screen.findByRole('dialog', { name: /Daily backup ·/ });

    expect(await within(dialog).findByRole('button', { name: 'Restore 2' })).toBeEnabled();
    await user.click(within(dialog).getByRole('checkbox', { name: 'Select work' }));
    await user.click(within(dialog).getByRole('button', { name: 'Restore 1 selected' }));
    const confirm = await screen.findByRole('dialog', { name: 'Restore 1 item to the app?' });
    expect(confirm).toHaveTextContent('The next sync sends them to Google Calendar.');
    await user.click(within(confirm).getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(requestsTo(fetchMock, 'POST', `/api/backups/${summary.id}`)).toHaveLength(1));
    expect(JSON.parse(String(requestsTo(fetchMock, 'POST', '/api/backups/')[0][1]?.body))).toEqual({ target: 'app', keys: ['a'] });
    expect(await within(dialog).findByRole('status')).toHaveTextContent('1 restored in the app.');
  });

  it('offers Google Calendar only when connected', async () => {
    const user = userEvent.setup();
    mockApi({ 'GET /api/backups': () => ({ status: 200, body: [summary] }), 'GET /api/backups/*': () => ({ status: 200, body: detail }) });
    renderWithProviders(<BackupsSection />);
    await user.click(await screen.findByRole('button', { name: /Daily backup/ }));
    await user.click(await screen.findByRole('combobox', { name: 'Restore to' }));
    expect(screen.getByRole('option', { name: 'Google Calendar' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('restores everything to Google, sending no keys', async () => {
    const user = userEvent.setup();
    const changedInGoogle = { ...detail, items: detail.items.map((item) => ({ ...item, googleChanged: item.google !== null })) };
    const fetchMock = mockApi({
      'GET /api/google/status': () => ({ status: 200, body: connected }),
      'GET /api/backups': () => ({ status: 200, body: [summary] }),
      'GET /api/backups/*': () => ({ status: 200, body: changedInGoogle }),
      'POST /api/backups/*': () => ({ status: 200, body: { app: 0, google: 1, unchanged: 1, remaining: 1, failed: [] } }),
    });
    renderWithProviders(<BackupsSection />);
    await user.click(await screen.findByRole('button', { name: /Daily backup/ }));
    const dialog = await screen.findByRole('dialog', { name: /Daily backup ·/ });
    await user.click(within(dialog).getByRole('switch', { name: 'Only what differs from now' }));
    await user.click(await within(dialog).findByRole('combobox', { name: 'Restore to' }));
    await user.click(screen.getByRole('option', { name: 'Google Calendar' }));
    await user.click(within(dialog).getByRole('button', { name: 'Restore 2' }));
    await user.click(within(await screen.findByRole('dialog', { name: /to google calendar\?/ })).getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(requestsTo(fetchMock, 'POST', '/api/backups/')).toHaveLength(1));
    expect(JSON.parse(String(requestsTo(fetchMock, 'POST', '/api/backups/')[0][1]?.body))).toEqual({ target: 'google' });
    expect(await within(dialog).findByRole('status')).toHaveTextContent('1 restored in Google Calendar. 1 more ran out of time: restore again to finish.');
  });
});

describe('Install app (PWA)', () => {
  it('uses the browser\'s install prompt when there is one', async () => {
    const user = userEvent.setup();
    renderWithProviders(<InstallSection />);
    expect(screen.getByText(/Add to Home Screen/)).toBeInTheDocument();

    const prompt = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: async () => {},
      userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    });
    act(() => void window.dispatchEvent(prompt));
    expect(prompt.defaultPrevented).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Install' }));
    act(() => void window.dispatchEvent(new Event('appinstalled')));
    expect(screen.getByText("You're using the installed app.")).toBeInTheDocument();
  });
});
