import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { iso, makeEntry, mockApi, requestsTo } from '../test/mockApi';
import { renderWithProviders } from '../test/render';
import { AppShell } from './AppShell';

const NOW = new Date('2026-10-07T12:00:00'); // Wednesday

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

// hidden: the toolbar is aria-hidden while a dialog is open.
const heading = () => screen.getByRole('heading', { level: 1, hidden: true }).textContent;

describe('keyboard shortcuts (§5.7)', () => {
  it('navigates periods and switches views', async () => {
    const user = userEvent.setup();
    mockApi();
    renderWithProviders(<AppShell onOpenSettings={() => {}} onLogout={() => {}} />);

    await user.keyboard('k');
    expect(heading()).toBe('Sep – Oct 2026');
    await user.keyboard('j');
    expect(heading()).toBe('October 2026');
    await user.keyboard('d');
    expect(heading()).toBe('October 7, 2026');
    await user.keyboard('n');
    expect(heading()).toBe('October 8, 2026');
    await user.keyboard('pp');
    expect(heading()).toBe('October 6, 2026');
    await user.keyboard('t');
    expect(heading()).toBe('October 7, 2026');
    await user.keyboard('3');
    expect(screen.getByTestId('month-day-2026-09-27')).toBeInTheDocument();
    await user.keyboard('j');
    expect(heading()).toBe('November 2026');
    await user.keyboard('a');
    expect(screen.getByRole('combobox', { name: 'View' })).toHaveTextContent('Schedule');
    await user.keyboard('w');
    expect(screen.getByRole('combobox', { name: 'View' })).toHaveTextContent('Week');
    await user.keyboard('x');
    expect(screen.getByRole('combobox', { name: 'View' })).toHaveTextContent('2 days');
    await user.keyboard('4');
    expect(screen.getByRole('combobox', { name: 'View' })).toHaveTextContent('2 days');
  });

  it('is off while typing, inside dialogs and with modifiers', async () => {
    const user = userEvent.setup();
    mockApi();
    renderWithProviders(<AppShell onOpenSettings={() => {}} onLogout={() => {}} />);

    await user.keyboard('c');
    const dialog = await screen.findByRole('dialog', { name: 'New entry' });
    await user.keyboard('kd'); // typed into the title
    expect(within(dialog).getByRole('combobox', { name: 'Title' })).toHaveValue('kd');
    expect(heading()).toBe('October 2026');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.keyboard('{Control>}k{/Control}');
    expect(heading()).toBe('October 2026');
  });

  it('is off while another page is shown', async () => {
    const user = userEvent.setup();
    mockApi();
    renderWithProviders(<AppShell onOpenSettings={() => {}} onLogout={() => {}} active={false} />);
    await user.keyboard('k');
    expect(heading()).toBe('October 2026');
  });

  it('opens settings and runs a sync', async () => {
    const user = userEvent.setup();
    const onOpenSettings = vi.fn();
    const fetchMock = mockApi({ 'POST /api/sync': () => ({ status: 409, body: { error: 'not connected' } }) });
    renderWithProviders(<AppShell onOpenSettings={onOpenSettings} onLogout={() => {}} />);
    await user.keyboard('s');
    expect(onOpenSettings).toHaveBeenCalled();
    await user.keyboard('r');
    await waitFor(() => expect(requestsTo(fetchMock, 'POST', '/api/sync')).toHaveLength(1));
  });

  it('opens, deletes and undoes the selected entry (e, Delete, z)', async () => {
    const user = userEvent.setup();
    const work = makeEntry();
    const fetchMock = mockApi(
      { 'DELETE /api/entries/*': () => ({ status: 204 }), 'POST /api/entries/restore': () => ({ status: 200, body: work }) },
      [work],
    );
    renderWithProviders(<AppShell onOpenSettings={() => {}} onLogout={() => {}} />);

    await user.keyboard('e'); // nothing selected
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    act(() => screen.getByRole('button', { name: /^work,/ }).focus());
    await user.keyboard('e');
    expect(await screen.findByRole('dialog', { name: 'Edit entry' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    act(() => screen.getByRole('button', { name: /^work,/ }).focus());
    await user.keyboard('{Delete}');
    await waitFor(() => expect(requestsTo(fetchMock, 'DELETE', `/api/entries/${work.id}`)).toHaveLength(1));
    expect(await screen.findByText('Entry deleted')).toBeInTheDocument();

    act(() => (document.activeElement as HTMLElement | null)?.blur());
    await user.keyboard('z');
    await waitFor(() => expect(requestsTo(fetchMock, 'POST', '/api/entries/restore')).toHaveLength(1));
    await user.keyboard('z'); // nothing left to undo
    expect(requestsTo(fetchMock, 'POST', '/api/entries/restore')).toHaveLength(1);
  });

  it('goes to a typed date (g)', async () => {
    const user = userEvent.setup();
    mockApi();
    renderWithProviders(<AppShell onOpenSettings={() => {}} onLogout={() => {}} />);
    await user.keyboard('dg');
    const dialog = await screen.findByRole('dialog', { name: 'Go to date' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Date' }), 'nonsense{Enter}');
    expect(within(dialog).getByText("Couldn't read that date")).toBeInTheDocument();
    await user.clear(within(dialog).getByRole('textbox', { name: 'Date' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Date' }), 'dec 25{Enter}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(heading()).toBe('December 25, 2026');
  });

  it('shows the help dialog (?)', async () => {
    const user = userEvent.setup();
    mockApi();
    renderWithProviders(<AppShell onOpenSettings={() => {}} onLogout={() => {}} />);
    await user.keyboard('?');
    const dialog = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(within(dialog).getByText('Go to a date')).toBeInTheDocument();
  });

  it('searches (/) and opens the picked entry on its day', async () => {
    const user = userEvent.setup();
    const manga = makeEntry({ title: 'read manga', start: iso('2026-09-12T20:00'), end: iso('2026-09-12T21:00') });
    const fetchMock = mockApi({
      'GET /api/entries': (_, url) => ({ status: 200, body: url.searchParams.get('q') === 'manga' ? [manga] : [] }),
    });
    renderWithProviders(<AppShell onOpenSettings={() => {}} onLogout={() => {}} />);

    await user.keyboard('/');
    const search = await screen.findByRole('textbox', { name: 'Search entries' });
    await user.type(search, 'manga');
    const results = screen.getByRole('list', { name: 'Results' });
    expect(await within(results).findByText('Sat, Sep 12 2026', {}, { timeout: 2000 })).toBeInTheDocument();
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('dialog', { name: 'Edit entry' })).toBeInTheDocument();
    expect(heading()).toBe('September 12, 2026');
    expect(requestsTo(fetchMock, 'GET', '/api/entries?q=').length).toBeGreaterThan(0);
  });
});

describe('month view (TE-2)', () => {
  const day = (n: number, title: string, hour: number) =>
    makeEntry({ title, start: iso(`2026-10-${String(n).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00`), end: iso(`2026-10-${String(n).padStart(2, '0')}T${String(hour).padStart(2, '0')}:30`) });

  it('lists entries per day, with the rest behind "N more"', async () => {
    const user = userEvent.setup();
    const busy = [day(7, 'wake up', 7), day(7, 'eat snack', 8), day(7, 'work', 9), day(7, 'gym', 18), day(7, 'chill', 20), day(7, 'journal', 22)];
    const fetchMock = mockApi({}, [...busy, day(14, 'stream', 19)]);
    renderWithProviders(<AppShell onOpenSettings={() => {}} onLogout={() => {}} />);
    await user.keyboard('m');

    const [[url]] = requestsTo(fetchMock, 'GET', '/api/entries').slice(-1);
    const params = new URL(url.toString(), 'http://x').searchParams;
    expect([params.get('from'), params.get('to')]).toEqual([iso('2026-09-27T00:00'), iso('2026-11-01T00:00')]);

    const wednesday = screen.getByTestId('month-day-2026-10-07');
    expect(await within(wednesday).findByRole('button', { name: /^wake up, 7 am/ })).toBeInTheDocument();
    expect(within(wednesday).getAllByRole('button', { name: /, \d/ })).toHaveLength(3); // 3 shown + "3 more" (4 fit)
    await user.click(within(wednesday).getByRole('button', { name: '3 more' }));
    const popover = screen.getByRole('dialog', { name: 'Wednesday, October 7' });
    expect(within(popover).getAllByRole('button', { name: /, \d/ })).toHaveLength(6);

    await user.click(within(popover).getByRole('button', { name: /^journal,/ }));
    expect(await screen.findByRole('dialog', { name: 'Edit entry' })).toBeInTheDocument();
  });

  it('opens a day from its number, and right-click opens the entry menu', async () => {
    const user = userEvent.setup();
    mockApi({}, [day(14, 'stream', 19)]);
    renderWithProviders(<AppShell onOpenSettings={() => {}} onLogout={() => {}} />);
    await user.keyboard('m');

    fireEvent.contextMenu(await screen.findByRole('button', { name: /^stream,/ }), { clientX: 10, clientY: 10 });
    expect(screen.getByRole('menu', { name: 'Actions for stream' })).toBeInTheDocument();
    await user.keyboard('{Escape}');

    await user.click(within(screen.getByTestId('month-day-2026-10-14')).getByRole('button', { name: 'Wednesday, October 14' }));
    expect(heading()).toBe('October 14, 2026');
  });

  it('shows an entry crossing midnight on both days', async () => {
    const user = userEvent.setup();
    mockApi({}, [makeEntry({ title: 'stream', start: iso('2026-10-07T21:00'), end: iso('2026-10-08T01:30') })]);
    renderWithProviders(<AppShell onOpenSettings={() => {}} onLogout={() => {}} />);
    await user.keyboard('m');
    expect(await within(screen.getByTestId('month-day-2026-10-07')).findByText('9 pm')).toBeInTheDocument();
    expect(within(screen.getByTestId('month-day-2026-10-08')).getByText('until 1:30 am')).toBeInTheDocument();
  });
});
