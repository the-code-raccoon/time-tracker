import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TimeEntry } from '../../shared/types';
import { CATEGORIES, mockApi, requestsTo } from '../test/mockApi';
import { renderWithProviders } from '../test/render';
import { AppShell } from './AppShell';

const NOW = new Date('2026-10-07T12:00:00'); // Wednesday, local (America/Toronto in tests)

const entry = (overrides: Partial<TimeEntry>): TimeEntry => ({
  id: crypto.randomUUID(),
  title: 'work',
  start: new Date('2026-10-07T09:00:00').toISOString(),
  end: new Date('2026-10-07T17:00:00').toISOString(),
  categoryId: null,
  notes: null,
  gcalEventId: null,
  updatedAt: NOW.toISOString(),
  ...overrides,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe('AppShell', () => {
  it('shows the current week and loads its entries', async () => {
    const fetchMock = mockApi({}, [entry({ title: 'work' }), entry({ title: 'eat snack', start: new Date('2026-10-07T10:00').toISOString(), end: new Date('2026-10-07T10:10').toISOString() })]);
    renderWithProviders(<AppShell onOpenSettings={() => {}} onLogout={() => {}} />);

    expect(screen.getByRole('heading', { name: 'October 2026' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /^work, 9 am – 5 pm/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^eat snack, 10 am – 10:10 am/ })).toBeInTheDocument();

    const [[url]] = requestsTo(fetchMock, 'GET', '/api/entries');
    const params = new URL(url.toString(), 'http://x').searchParams;
    expect(new Date(params.get('from')!)).toEqual(new Date('2026-10-04T00:00:00'));
    expect(new Date(params.get('to')!)).toEqual(new Date('2026-10-11T00:00:00'));
  });

  it('navigates between periods and views', async () => {
    const user = userEvent.setup();
    mockApi();
    renderWithProviders(<AppShell onOpenSettings={() => {}} onLogout={() => {}} />);

    await user.click(screen.getByRole('button', { name: 'Previous week' }));
    expect(screen.getByRole('heading', { name: 'Sep – Oct 2026' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Today' }));
    expect(screen.getByRole('heading', { name: 'October 2026' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Thursday, October 8' }));
    expect(screen.getByRole('heading', { name: 'October 8, 2026' })).toBeInTheDocument();
  });

  it('creates an entry by clicking an empty slot', async () => {
    const user = userEvent.setup();
    const fetchMock = mockApi({ 'POST /api/entries': (init) => ({ status: 201, body: entry(JSON.parse(String(init?.body))) }) });
    renderWithProviders(<AppShell onOpenSettings={() => {}} onLogout={() => {}} />);

    const column = screen.getByTestId('day-column-2026-10-07');
    column.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
    fireEvent.click(column, { clientY: 14.5 * 48 }); // 14:30

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Start date')).toHaveValue('Oct 7, 2026');
    expect(within(dialog).getByLabelText('Start time')).toHaveValue('2:30pm');
    expect(within(dialog).getByLabelText('End time')).toHaveValue('3:00pm');

    await user.type(within(dialog).getByRole('combobox', { name: 'Title' }), 'Read Manga');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(requestsTo(fetchMock, 'POST', '/api/entries')).toHaveLength(1));
    const body = JSON.parse(String(requestsTo(fetchMock, 'POST', '/api/entries')[0][1]?.body));
    expect(body).toEqual({
      title: 'Read Manga',
      start: new Date('2026-10-07T14:30').toISOString(),
      end: new Date('2026-10-07T15:00').toISOString(),
      categoryId: null,
      notes: null,
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText('Entry created')).toBeInTheDocument();
  });

  it('edits and deletes an existing entry', async () => {
    const user = userEvent.setup();
    const existing = entry({ title: 'chill', categoryId: CATEGORIES[1].id });
    const fetchMock = mockApi(
      {
        'PATCH /api/entries/*': () => ({ status: 200, body: existing }),
        'DELETE /api/entries/*': () => ({ status: 204 }),
      },
      [existing],
    );
    renderWithProviders(<AppShell onOpenSettings={() => {}} onLogout={() => {}} />);

    await user.click(await screen.findByRole('button', { name: /^chill,/ }));
    let dialog = screen.getByRole('dialog');
    const title = within(dialog).getByRole('combobox', { name: 'Title' });
    await user.clear(title);
    await user.type(title, 'nap');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(requestsTo(fetchMock, 'PATCH', `/api/entries/${existing.id}`)).toHaveLength(1));
    expect(JSON.parse(String(requestsTo(fetchMock, 'PATCH', '/api/entries/')[0][1]?.body))).toMatchObject({ title: 'nap', categoryId: CATEGORIES[1].id });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(await screen.findByRole('button', { name: /^chill,/ }));
    dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(requestsTo(fetchMock, 'DELETE', `/api/entries/${existing.id}`)).toHaveLength(1));
  });

  describe('context menu (§5.2c)', () => {
    const existing = entry({ title: 'chill', categoryId: CATEGORIES[1].id });

    it('opens on right-click and changes the category, with undo (CTX-2)', async () => {
      const user = userEvent.setup();
      const fetchMock = mockApi({ 'PATCH /api/entries/*': () => ({ status: 200, body: existing }) }, [existing]);
      renderWithProviders(<AppShell onOpenSettings={() => {}} onLogout={() => {}} />);

      fireEvent.contextMenu(await screen.findByRole('button', { name: /^chill,/ }), { clientX: 200, clientY: 300 });
      const menu = screen.getByRole('menu', { name: 'Actions for chill' });
      expect(within(menu).getByRole('button', { name: 'Leisure' })).toHaveAttribute('aria-pressed', 'true');

      await user.click(within(menu).getByRole('button', { name: 'Food' }));
      await waitFor(() => expect(requestsTo(fetchMock, 'PATCH', `/api/entries/${existing.id}`)).toHaveLength(1));
      expect(JSON.parse(String(requestsTo(fetchMock, 'PATCH', '/api/entries/')[0][1]?.body))).toEqual({ categoryId: CATEGORIES[0].id });
      expect(await screen.findByText('Moved to Food')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Undo' }));
      await waitFor(() => expect(requestsTo(fetchMock, 'PATCH', '/api/entries/')).toHaveLength(2));
      expect(JSON.parse(String(requestsTo(fetchMock, 'PATCH', '/api/entries/')[1][1]?.body))).toEqual({ categoryId: CATEGORIES[1].id });
    });

    it('deletes with undo (CTX-3)', async () => {
      const user = userEvent.setup();
      const fetchMock = mockApi(
        { 'DELETE /api/entries/*': () => ({ status: 204 }), 'POST /api/entries/restore': () => ({ status: 200, body: existing }) },
        [existing],
      );
      renderWithProviders(<AppShell onOpenSettings={() => {}} onLogout={() => {}} />);

      fireEvent.contextMenu(await screen.findByRole('button', { name: /^chill,/ }));
      await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
      await waitFor(() => expect(requestsTo(fetchMock, 'DELETE', `/api/entries/${existing.id}`)).toHaveLength(1));
      await user.click(await screen.findByRole('button', { name: 'Undo' }));
      await waitFor(() => expect(requestsTo(fetchMock, 'POST', '/api/entries/restore')).toHaveLength(1));
      expect(JSON.parse(String(requestsTo(fetchMock, 'POST', '/api/entries/restore')[0][1]?.body))).toEqual({ id: existing.id });
    });

    it('duplicates into a prefilled, unsaved editor (CTX-4)', async () => {
      const user = userEvent.setup();
      const fetchMock = mockApi({ 'POST /api/entries': (init) => ({ status: 201, body: entry(JSON.parse(String(init?.body))) }) }, [existing]);
      renderWithProviders(<AppShell onOpenSettings={() => {}} onLogout={() => {}} />);

      fireEvent.contextMenu(await screen.findByRole('button', { name: /^chill,/ }));
      await user.click(screen.getByRole('menuitem', { name: 'Duplicate' }));
      const dialog = screen.getByRole('dialog', { name: 'New entry' });
      expect(within(dialog).getByRole('combobox', { name: 'Title' })).toHaveValue('chill');
      expect(requestsTo(fetchMock, 'POST', '/api/entries')).toHaveLength(0);

      await user.click(within(dialog).getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(requestsTo(fetchMock, 'POST', '/api/entries')).toHaveLength(1));
      expect(JSON.parse(String(requestsTo(fetchMock, 'POST', '/api/entries')[0][1]?.body))).toMatchObject({
        title: 'chill',
        categoryId: CATEGORIES[1].id,
        start: existing.start,
        end: existing.end,
      });
    });

    it('opens on long-press on touch screens (CTX-1)', async () => {
      vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
      vi.setSystemTime(NOW);
      mockApi({}, [existing]);
      renderWithProviders(<AppShell onOpenSettings={() => {}} onLogout={() => {}} />);

      await vi.waitFor(() => screen.getByRole('button', { name: /^chill,/ }));
      const block = screen.getByRole('button', { name: /^chill,/ });
      fireEvent.pointerDown(block, { pointerType: 'touch', clientX: 50, clientY: 60 });
      vi.advanceTimersByTime(600);
      fireEvent.pointerUp(block, { pointerType: 'touch' });
      fireEvent.click(block);
      await vi.waitFor(() => screen.getByRole('menu', { name: 'Actions for chill' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('shows the schedule view grouped by day', async () => {
    const user = userEvent.setup();
    mockApi({}, [entry({ title: 'work' })]);
    renderWithProviders(<AppShell onOpenSettings={() => {}} onLogout={() => {}} />);

    await user.click(screen.getByRole('combobox', { name: 'View' }));
    await user.click(screen.getByRole('option', { name: 'Schedule' }));
    expect(await screen.findByText('OCT, WED')).toBeInTheDocument();
    expect(screen.getByText('8 h')).toBeInTheDocument();
  });
});
