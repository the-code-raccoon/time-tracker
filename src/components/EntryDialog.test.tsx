import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CATEGORIES, TITLES } from '../test/mockApi';
import { renderWithTheme } from '../test/render';
import { EntryDialog, type EntryDraft } from './EntryDialog';

const NOW = new Date('2026-10-05T15:00'); // 3pm
const draft: EntryDraft = { kind: 'create', start: new Date('2026-10-05T09:30'), end: new Date('2026-10-05T10:00') };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

function setup(onSubmit = vi.fn(async () => {}), initial: EntryDraft = draft) {
  const onClose = vi.fn();
  renderWithTheme(<EntryDialog draft={initial} categories={CATEGORIES} titles={TITLES} onSubmit={onSubmit} onClose={onClose} />);
  return { onSubmit, onClose, user: userEvent.setup() };
}

const field = (name: string) => screen.getByLabelText(name) as HTMLInputElement;

async function typeInto(user: ReturnType<typeof userEvent.setup>, name: string, text: string) {
  await user.clear(field(name));
  await user.type(field(name), `${text}{Enter}`);
}

describe('EntryDialog', () => {
  it('shows the Google Calendar-style date/time row', () => {
    setup();
    expect(field('Start date')).toHaveValue('Oct 5, 2026');
    expect(field('Start time')).toHaveValue('9:30am');
    expect(field('End time')).toHaveValue('10:00am');
    expect(field('End date')).toHaveValue('Oct 5, 2026');
    expect(field('Duration')).toHaveValue('30 min');
    expect(screen.getByText(/\(GMT-04:00\) Eastern Time - Toronto/)).toBeInTheDocument();
  });

  it('fills in the category when a past title is picked (TE-1a)', async () => {
    const { user, onSubmit } = setup();
    await user.type(screen.getByRole('combobox', { name: 'Title' }), 'snack');
    await user.click(await screen.findByRole('option', { name: 'eat snack' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ title: 'eat snack', categoryId: CATEGORIES[0].id })));
  });

  it('requires a title', async () => {
    const { user, onSubmit } = setup();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Add a title')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('keeps the duration when the start time moves (DT-9)', async () => {
    const { user } = setup();
    await typeInto(user, 'Start time', '9:40am');
    expect(field('Start time')).toHaveValue('9:40am');
    expect(field('End time')).toHaveValue('10:10am');
  });

  it('infers pm for a start time that has passed today (DT-6)', async () => {
    const { user } = setup();
    await typeInto(user, 'Start time', '9:30');
    expect(field('Start time')).toHaveValue('9:30pm');
  });

  it('infers the end time from the start time (DT-6)', async () => {
    const { user } = setup();
    await typeInto(user, 'End time', '11');
    expect(field('End time')).toHaveValue('11:00am');
    expect(field('Duration')).toHaveValue('1 h 30 min');
  });

  it('parses typed dates and defaults to the current year (DT-3)', async () => {
    const { user } = setup();
    await typeInto(user, 'Start date', 'oct 7');
    expect(field('Start date')).toHaveValue('Oct 7, 2026');
    expect(field('End date')).toHaveValue('Oct 7, 2026');
  });

  it('reverts input it cannot parse', async () => {
    const { user } = setup();
    await typeInto(user, 'Start date', 'someday');
    expect(field('Start date')).toHaveValue('Oct 5, 2026');
  });

  it('picks a date from the calendar popup (DT-2)', async () => {
    const { user } = setup();
    await user.click(field('Start date'));
    await user.click(screen.getByRole('button', { name: 'Friday, October 9, 2026' }));
    expect(field('Start date')).toHaveValue('Oct 9, 2026');
    await user.click(field('End date'));
    await user.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByRole('grid', { name: 'November 2026' })).toBeInTheDocument();
  });

  it('marks the end red and blocks saving when it is before the start (DT-7)', async () => {
    const { user, onSubmit } = setup();
    await user.type(screen.getByRole('combobox', { name: 'Title' }), 'chill');
    await typeInto(user, 'End date', 'sep 28');
    expect(field('End date')).toHaveAttribute('aria-invalid', 'true');
    expect(field('End time')).toHaveAttribute('aria-invalid', 'true');
    expect(field('Start time')).not.toHaveAttribute('aria-invalid');
    expect(screen.getByRole('alert')).toHaveTextContent('The end must be after the start.');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('sets the end from a typed or preset duration (DT-8)', async () => {
    const { user } = setup();
    await typeInto(user, 'Duration', '1h30');
    expect(field('End time')).toHaveValue('11:00am');
    await user.click(field('Duration'));
    await user.click(screen.getByRole('option', { name: '45 min' }));
    expect(field('End time')).toHaveValue('10:15am');
  });

  it('lists end times with their durations, like Google Calendar (DT-4)', async () => {
    const { user } = setup();
    await user.click(field('End time'));
    await user.click(screen.getByRole('option', { name: '10:45am (1.25 hrs)' }));
    expect(field('End time')).toHaveValue('10:45am');
  });

  it('saves with Ctrl+S, committing a field that is still being typed in', async () => {
    const { user, onSubmit, onClose } = setup();
    await user.type(screen.getByRole('combobox', { name: 'Title' }), 'journal');
    await user.clear(field('End time'));
    await user.type(field('End time'), '10:15');
    await user.keyboard('{Control>}s{/Control}');
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'journal', end: new Date('2026-10-05T10:15').toISOString() }),
      ),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('prefills a duplicated entry (CTX-4)', () => {
    setup(undefined, { ...draft, title: 'eat snack', categoryId: CATEGORIES[0].id, notes: 'apple' });
    expect(screen.getByRole('combobox', { name: 'Title' })).toHaveValue('eat snack');
    expect(screen.getByLabelText('Notes')).toHaveValue('apple');
    expect(screen.getByRole('heading', { name: 'New entry' })).toBeInTheDocument();
  });

  it('shows a server error and stays open', async () => {
    const { user, onClose } = setup(vi.fn(async () => Promise.reject(new Error('end must be after start'))));
    await user.type(screen.getByRole('combobox', { name: 'Title' }), 'x');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('end must be after start');
    expect(onClose).not.toHaveBeenCalled();
  });
});
