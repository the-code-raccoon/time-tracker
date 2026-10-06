import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Timer } from '../../../shared/types';
import { CATEGORIES, iso, makeEntry, mockApi, requestsTo } from '../../test/mockApi';
import { renderWithProviders } from '../../test/render';
import { AppShell } from '../AppShell';

const NOW = new Date('2026-10-07T12:00:00');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const bodyOf = (fetchMock: ReturnType<typeof mockApi>, method: string, path: string, index = 0) =>
  JSON.parse(String(requestsTo(fetchMock, method, path)[index][1]?.body));

describe('timer (TE-5)', () => {
  it('starts with a title from autocomplete and its usual category', async () => {
    const user = userEvent.setup();
    let timer: Timer | null = null;
    const fetchMock = mockApi({
      'GET /api/timer': () => ({ status: 200, body: timer }),
      'POST /api/timer': (init) => {
        timer = { ...JSON.parse(String(init?.body)), startedAt: NOW.toISOString() };
        return { status: 201, body: timer };
      },
    });
    renderWithProviders(<AppShell onOpenSettings={() => {}} onLogout={() => {}} />);

    await user.click(await screen.findByRole('button', { name: 'Start timer' }));
    const dialog = await screen.findByRole('dialog', { name: 'Start timer' });
    await user.type(within(dialog).getByRole('combobox', { name: 'Title' }), 'chi');
    await user.click(await screen.findByRole('option', { name: 'chill' }));
    await user.click(within(dialog).getByRole('button', { name: 'Start' }));

    await waitFor(() => expect(requestsTo(fetchMock, 'POST', '/api/timer')).toHaveLength(1));
    expect(bodyOf(fetchMock, 'POST', '/api/timer')).toEqual({ title: 'chill', categoryId: CATEGORIES[1].id });
    expect(await screen.findByRole('button', { name: 'Timer: chill' })).toHaveTextContent('chill0:00');
  });

  it('shows a timer started on another device, and stops it into an entry with undo', async () => {
    const user = userEvent.setup();
    const running: Timer = { title: 'work', categoryId: null, startedAt: iso('2026-10-07T10:58:30') };
    const logged = makeEntry({ title: 'work', start: iso('2026-10-07T11:00'), end: iso('2026-10-07T12:00') });
    const fetchMock = mockApi({
      'GET /api/timer': () => ({ status: 200, body: requestsTo(fetchMock, 'POST', '/api/timer/stop').length ? null : running }),
      'POST /api/timer/stop': () => ({ status: 201, body: logged }),
      'DELETE /api/entries/*': () => ({ status: 204 }),
      'POST /api/timer': () => ({ status: 201, body: running }),
    });
    renderWithProviders(<AppShell onOpenSettings={() => {}} onLogout={() => {}} />);

    expect(await screen.findByRole('button', { name: 'Timer: work' })).toHaveTextContent('1:01:30');
    await user.click(screen.getByRole('button', { name: 'Stop timer' }));
    const snackbar = await screen.findByRole('alert');
    expect(snackbar).toHaveTextContent('Logged work');
    expect(await screen.findByRole('button', { name: 'Start timer' })).toBeInTheDocument();

    await user.click(within(snackbar).getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(requestsTo(fetchMock, 'POST', '/api/timer')).toHaveLength(2)); // stop + restart
    expect(requestsTo(fetchMock, 'DELETE', `/api/entries/${logged.id}`)).toHaveLength(1);
    expect(bodyOf(fetchMock, 'POST', '/api/timer', 1)).toEqual({ title: 'work', categoryId: null, startedAt: running.startedAt });
  });

  it('edits the start time before stopping', async () => {
    const user = userEvent.setup();
    const running: Timer = { title: 'work', categoryId: null, startedAt: iso('2026-10-07T11:00') };
    const fetchMock = mockApi({
      'GET /api/timer': () => ({ status: 200, body: running }),
      'PATCH /api/timer': (init) => ({ status: 200, body: { ...running, ...JSON.parse(String(init?.body)) } }),
      'POST /api/timer/stop': () => ({ status: 201, body: makeEntry() }),
    });
    renderWithProviders(<AppShell onOpenSettings={() => {}} onLogout={() => {}} />);

    await user.click(await screen.findByRole('button', { name: 'Timer: work' }));
    const dialog = screen.getByRole('dialog', { name: 'Timer' });
    const startedAt = within(dialog).getByLabelText('Started at');
    await user.clear(startedAt);
    await user.type(startedAt, '10:30{Enter}'); // at noon, "10:30" is this morning
    await user.click(within(dialog).getByRole('button', { name: 'Stop' }));

    await waitFor(() => expect(requestsTo(fetchMock, 'POST', '/api/timer/stop')).toHaveLength(1));
    expect(bodyOf(fetchMock, 'PATCH', '/api/timer')).toEqual({ startedAt: iso('2026-10-07T10:30') });
  });

  it('discards', async () => {
    const user = userEvent.setup();
    const fetchMock = mockApi({
      'GET /api/timer': () => ({ status: 200, body: { title: 'work', categoryId: null, startedAt: iso('2026-10-07T11:00') } }),
      'DELETE /api/timer': () => ({ status: 204 }),
    });
    renderWithProviders(<AppShell onOpenSettings={() => {}} onLogout={() => {}} />);
    await user.click(await screen.findByRole('button', { name: 'Timer: work' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(requestsTo(fetchMock, 'DELETE', '/api/timer')).toHaveLength(1));
    expect(requestsTo(fetchMock, 'POST', '/api/timer/stop')).toHaveLength(0);
  });
});
