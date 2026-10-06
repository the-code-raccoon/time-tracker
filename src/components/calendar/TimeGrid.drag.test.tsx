import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { iso, makeEntry, mockApi, requestsTo, type Route } from '../../test/mockApi';
import { renderWithProviders } from '../../test/render';
import { AppShell } from '../AppShell';

// §5.2d in Week view. Wednesday 2026-10-07 is the 4th column. The grid is stubbed to 56 px of hour gutter plus seven
// 100 px columns, with midnight at y = 0; an hour is 48 px, so a minute is 0.8 px.
const NOW = new Date('2026-10-07T12:00:00');
const GUTTER = 56;
const COLUMN = 100;
const x = (dayIndex: number) => GUTTER + dayIndex * COLUMN + 50;
const y = (hours: number) => hours * 48;
const WED = 3;

const coffee = makeEntry({ title: 'coffee', start: iso('2026-10-07T09:40'), end: iso('2026-10-07T10:10') });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

async function setup(routes: Record<string, Route> = {}) {
  // The server keeps the last saved version, so the refetch after a save returns it.
  let saved = coffee;
  const fetchMock = mockApi({
    'GET /api/entries': () => ({ status: 200, body: [saved] }),
    'PATCH /api/entries/*': (init) => {
      saved = { ...saved, ...JSON.parse(String(init?.body)) };
      return { status: 200, body: saved };
    },
    ...routes,
  });
  renderWithProviders(<AppShell onOpenSettings={() => {}} onLogout={() => {}} />);
  // vi.waitFor rather than findBy*: it also works with fake timers (the touch tests).
  const block = await vi.waitFor(() => screen.getByRole('button', { name: /^coffee,/ }));
  const grid = screen.getByTestId('day-column-2026-10-07').parentElement!;
  grid.getBoundingClientRect = () => ({ left: 0, top: 0, width: GUTTER + 7 * COLUMN, height: y(24), right: GUTTER + 7 * COLUMN, bottom: y(24) }) as DOMRect;
  grid.parentElement!.getBoundingClientRect = () => ({ top: -10_000, bottom: 10_000 }) as DOMRect; // no auto-scroll
  return { fetchMock, block };
}

const pointer = (type: 'pointerdown' | 'pointermove' | 'pointerup', target: Element | Window, clientX: number, clientY: number, pointerType = 'mouse') =>
  fireEvent(target, new PointerEvent(type, { bubbles: true, cancelable: true, clientX, clientY, pointerId: 1, button: 0, pointerType }));

const patches = (fetchMock: ReturnType<typeof mockApi>) =>
  requestsTo(fetchMock, 'PATCH', '/api/entries/').map(([, init]) => JSON.parse(String(init?.body)));

describe('drag and drop (§5.2d)', () => {
  it('moves in 15-minute steps from the entry\'s own time, to another day, with a preview and undo', async () => {
    const { fetchMock, block } = await setup();
    pointer('pointerdown', block, x(WED), y(9.75));
    pointer('pointermove', window, x(WED), y(9.75) + 2); // under 4 px: still a click
    expect(screen.queryByTestId('drag-preview')).not.toBeInTheDocument();

    pointer('pointermove', window, x(WED + 1), y(9.75) + 17 * 0.8); // 17 minutes → one step, and a day later
    const preview = await screen.findByTestId('drag-preview');
    expect(preview).toHaveTextContent('9:55 am – 10:25 am');
    expect(within(screen.getByTestId('day-column-2026-10-08')).getByTestId('drag-preview')).toBeInTheDocument();
    expect(block).toHaveStyle({ opacity: '0.4' });

    pointer('pointerup', window, x(WED + 1), y(9.75) + 17 * 0.8);
    fireEvent.click(block); // the click that ends a drag doesn't open the editor
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await waitFor(() => expect(patches(fetchMock)).toHaveLength(1));
    expect(patches(fetchMock)[0]).toEqual({ start: iso('2026-10-08T09:55'), end: iso('2026-10-08T10:25') });
    expect(await screen.findByRole('button', { name: /^coffee, 9:55 am – 10:25 am/ })).toBeInTheDocument();

    fireEvent.click(within(await screen.findByRole('alert')).getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(patches(fetchMock)).toHaveLength(2));
    expect(patches(fetchMock)[1]).toEqual({ start: coffee.start, end: coffee.end });
  });

  it('resizes from the bottom edge', async () => {
    const { fetchMock, block } = await setup();
    const handle = block.querySelector('[data-resize-handle]')!;
    pointer('pointerdown', handle, x(WED), y(10.1));
    pointer('pointermove', window, x(WED), y(10.1) + 25 * 0.8);
    pointer('pointerup', window, x(WED), y(10.1) + 25 * 0.8);
    await waitFor(() => expect(patches(fetchMock)).toHaveLength(1));
    expect(patches(fetchMock)[0]).toEqual({ start: coffee.start, end: iso('2026-10-07T10:40') });
    expect(await screen.findByText('Entry resized')).toBeInTheDocument();
  });

  it('can\'t resize below 5 minutes', async () => {
    const { fetchMock, block } = await setup();
    pointer('pointerdown', block.querySelector('[data-resize-handle]')!, x(WED), y(10.1));
    pointer('pointermove', window, x(WED), y(8));
    pointer('pointerup', window, x(WED), y(8));
    await waitFor(() => expect(patches(fetchMock)).toHaveLength(1));
    expect(patches(fetchMock)[0]).toEqual({ start: coffee.start, end: iso('2026-10-07T09:45') });
  });

  it('opens the editor for a click that moves less than 4 px (DRAG-6)', async () => {
    const { fetchMock, block } = await setup();
    pointer('pointerdown', block, x(WED), y(9.75));
    pointer('pointermove', window, x(WED) + 2, y(9.75) + 2);
    pointer('pointerup', window, x(WED) + 2, y(9.75) + 2);
    fireEvent.click(block);
    expect(await screen.findByRole('dialog', { name: 'Edit entry' })).toBeInTheDocument();
    expect(patches(fetchMock)).toHaveLength(0);
  });

  it('cancels on Escape (DRAG-6)', async () => {
    const { fetchMock, block } = await setup();
    pointer('pointerdown', block, x(WED), y(9.75));
    pointer('pointermove', window, x(WED), y(12));
    expect(await screen.findByTestId('drag-preview')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('drag-preview')).not.toBeInTheDocument();
    pointer('pointerup', window, x(WED), y(12));
    fireEvent.click(block);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(patches(fetchMock)).toHaveLength(0);
  });

  it('puts the entry back and shows the error when the save fails (DRAG-5)', async () => {
    const { block } = await setup({ 'PATCH /api/entries/*': () => ({ status: 500, body: { error: 'Database is down' } }) });
    pointer('pointerdown', block, x(WED), y(9.75));
    pointer('pointermove', window, x(WED), y(11.75));
    pointer('pointerup', window, x(WED), y(11.75));
    expect(await screen.findByText("Couldn't move the entry: Database is down")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^coffee, 9:40 am – 10:10 am/ })).toBeInTheDocument();
  });

  it('creates by dragging across empty space (DRAG-4)', async () => {
    await setup();
    const thursday = screen.getByTestId('day-column-2026-10-08');
    pointer('pointerdown', thursday, x(WED + 1), y(14.1)); // 2:06 pm → the 2:00 slot
    pointer('pointermove', window, x(WED + 1), y(15.3)); // 3:18 pm → through the 3:15 slot
    expect(await screen.findByTestId('drag-preview')).toHaveTextContent('2 pm – 3:30 pm');
    pointer('pointerup', window, x(WED + 1), y(15.3));
    fireEvent.click(thursday);

    const dialog = await screen.findByRole('dialog', { name: 'New entry' });
    expect(within(dialog).getByLabelText('Start date')).toHaveValue('Oct 8, 2026');
    expect(within(dialog).getByLabelText('Start time')).toHaveValue('2:00pm');
    expect(within(dialog).getByLabelText('End time')).toHaveValue('3:30pm');
  });

  describe('touch (DRAG-8)', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
      vi.setSystemTime(NOW);
    });

    it('drags after a long press', async () => {
      const { fetchMock, block } = await setup();
      pointer('pointerdown', block, x(WED), y(9.75), 'touch');
      vi.advanceTimersByTime(600);
      pointer('pointermove', window, x(WED), y(10.75), 'touch');
      pointer('pointerup', window, x(WED), y(10.75), 'touch');
      await vi.waitFor(() => expect(patches(fetchMock)).toHaveLength(1));
      expect(patches(fetchMock)[0]).toEqual({ start: iso('2026-10-07T10:40'), end: iso('2026-10-07T11:10') });
    });

    it('scrolls instead when the finger moves before the long press', async () => {
      const { fetchMock, block } = await setup();
      pointer('pointerdown', block, x(WED), y(9.75), 'touch');
      pointer('pointermove', window, x(WED), y(10.75), 'touch');
      vi.advanceTimersByTime(600);
      pointer('pointermove', window, x(WED), y(11.75), 'touch');
      pointer('pointerup', window, x(WED), y(11.75), 'touch');
      expect(screen.queryByTestId('drag-preview')).not.toBeInTheDocument();
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(patches(fetchMock)).toHaveLength(0);
    });
  });
});
