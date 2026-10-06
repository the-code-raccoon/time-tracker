import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Report } from '../../shared/types';
import { CATEGORIES, mockApi, requestsTo } from '../test/mockApi';
import { renderWithProviders } from '../test/render';
import { ReportsPage } from './ReportsPage';

const NOW = new Date('2026-10-07T12:00:00'); // Wednesday
const [food, leisure] = CATEGORIES;

const report: Report = {
  days: [
    { date: '2026-10-04', minutes: {} },
    { date: '2026-10-05', minutes: { [food.id]: 45, [leisure.id]: 90 } },
    { date: '2026-10-06', minutes: { [leisure.id]: 120, '': 30 } },
    ...['07', '08', '09', '10'].map((d) => ({ date: `2026-10-${d}`, minutes: {} })),
  ],
  categories: [
    { categoryId: leisure.id, minutes: 210, entries: 3 },
    { categoryId: food.id, minutes: 45, entries: 2 },
    { categoryId: null, minutes: 30, entries: 1 },
  ],
  activities: [
    { title: 'chill', categoryId: leisure.id, minutes: 210, entries: 3 },
    { title: 'eat snack', categoryId: food.id, minutes: 45, entries: 2 },
  ],
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const params = (fetchMock: ReturnType<typeof mockApi>) => {
  const [[url]] = requestsTo(fetchMock, 'GET', '/api/reports').slice(-1);
  return new URL(url.toString(), 'http://x').searchParams;
};

describe('Reports (§5.6)', () => {
  it('shows totals, the chart legend and tables for this week (REP-1, REP-2)', async () => {
    const fetchMock = mockApi({ 'GET /api/reports': () => ({ status: 200, body: report }) });
    renderWithProviders(<ReportsPage onBack={() => {}} />);

    expect(await screen.findByText('4 h 45 min')).toBeInTheDocument(); // logged
    expect(screen.getByText('Oct 4 – 10, 2026')).toBeInTheDocument();
    expect([params(fetchMock).get('from'), params(fetchMock).get('to')]).toEqual([
      new Date('2026-10-04T00:00').toISOString(),
      new Date('2026-10-11T00:00').toISOString(),
    ]);
    expect(params(fetchMock).get('tz')).toBe('America/Toronto');

    // Daily average over the days so far (Sun–Wed).
    expect(screen.getByText('1 h 11 min')).toBeInTheDocument();
    const legend = screen.getByRole('list', { name: 'Legend' });
    expect(within(legend).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Food', 'Leisure', 'No category']);

    const byCategory = screen.getByRole('table', { name: 'Time by category' });
    expect(within(byCategory).getAllByRole('row').slice(1).map((row) => row.textContent)).toEqual([
      'Leisure3 h 30 min74%3',
      'Food45 min16%2',
      'No category30 min11%1',
    ]);
    expect(within(screen.getByRole('table', { name: 'Top activities' })).getByText('chill')).toBeInTheDocument();
  });

  it('shows a day\'s breakdown on focus, and the same numbers as a table', async () => {
    const user = userEvent.setup();
    mockApi({ 'GET /api/reports': () => ({ status: 200, body: report }) });
    renderWithProviders(<ReportsPage onBack={() => {}} />);

    const monday = await screen.findByRole('img', { name: /^Monday, October 5: 2 h 15 min\. Food 45 min, Leisure 1 h 30 min$/ });
    fireEvent.focus(monday);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Mon, Oct 52 h 15 min45 minFood1 h 30 minLeisure');
    fireEvent.keyDown(monday, { key: 'ArrowRight' });
    expect(screen.getByRole('tooltip')).toHaveTextContent('Tue, Oct 6');

    await user.click(screen.getByRole('button', { name: 'Table' }));
    const table = screen.getByRole('table', { name: 'Hours per day' });
    expect(within(table).getByRole('row', { name: /Tue, Oct 6/ })).toHaveTextContent('Tue, Oct 6—2 h30 min2 h 30 min');
  });

  it('moves between periods and offers the range as a CSV download (REP-3)', async () => {
    const user = userEvent.setup();
    const fetchMock = mockApi({ 'GET /api/reports': () => ({ status: 200, body: report }) });
    renderWithProviders(<ReportsPage onBack={() => {}} />);

    await user.click(screen.getByRole('button', { name: 'Month' }));
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByText('September 2026')).toBeInTheDocument();
    await waitFor(() => expect(params(fetchMock).get('from')).toBe(new Date('2026-09-01T00:00').toISOString()));

    const csv = new URL(screen.getByRole('link', { name: 'Export CSV' }).getAttribute('href')!, 'http://x');
    expect(csv.pathname).toBe('/api/reports');
    expect(Object.fromEntries(csv.searchParams)).toMatchObject({
      format: 'csv',
      from: new Date('2026-09-01T00:00').toISOString(),
      to: new Date('2026-10-01T00:00').toISOString(),
      name: '2026-09-01_2026-09-30',
    });
  });

  it('takes a custom range', async () => {
    const user = userEvent.setup();
    const fetchMock = mockApi({ 'GET /api/reports': () => ({ status: 200, body: report }) });
    renderWithProviders(<ReportsPage onBack={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Custom' }));
    const from = screen.getByLabelText('From');
    await user.clear(from);
    await user.type(from, 'apr 13{Enter}');
    await waitFor(() => expect(params(fetchMock).get('from')).toBe(new Date('2026-04-13T00:00').toISOString()));
    expect(params(fetchMock).get('to')).toBe(new Date('2026-10-08T00:00').toISOString());
  });

  it('says when nothing was logged', async () => {
    mockApi({ 'GET /api/reports': () => ({ status: 200, body: { days: [], categories: [], activities: [] } }) });
    renderWithProviders(<ReportsPage onBack={() => {}} />);
    expect(await screen.findByText('Nothing logged in this range.')).toBeInTheDocument();
  });
});
