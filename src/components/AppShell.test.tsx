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
    renderWithProviders(<AppShell onLogout={() => {}} />);

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
    renderWithProviders(<AppShell onLogout={() => {}} />);

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
    renderWithProviders(<AppShell onLogout={() => {}} />);

    const column = screen.getByTestId('day-column-2026-10-07');
    column.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
    fireEvent.click(column, { clientY: 14.5 * 48 }); // 14:30

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Start')).toHaveValue('2026-10-07T14:30');
    expect(within(dialog).getByLabelText('End')).toHaveValue('2026-10-07T15:00');

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
    renderWithProviders(<AppShell onLogout={() => {}} />);

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

  it('shows the schedule view grouped by day', async () => {
    const user = userEvent.setup();
    mockApi({}, [entry({ title: 'work' })]);
    renderWithProviders(<AppShell onLogout={() => {}} />);

    await user.click(screen.getByRole('combobox', { name: 'View' }));
    await user.click(screen.getByRole('option', { name: 'Schedule' }));
    expect(await screen.findByText('OCT, WED')).toBeInTheDocument();
    expect(screen.getByText('8 h')).toBeInTheDocument();
  });
});
