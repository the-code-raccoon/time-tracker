import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CATEGORIES, TITLES } from '../test/mockApi';
import { renderWithTheme } from '../test/render';
import { EntryDialog } from './EntryDialog';

const draft = { kind: 'create' as const, start: new Date('2026-10-07T09:00'), end: new Date('2026-10-07T09:30') };

function setup(onSubmit = vi.fn(async () => {})) {
  const onClose = vi.fn();
  renderWithTheme(<EntryDialog draft={draft} categories={CATEGORIES} titles={TITLES} onSubmit={onSubmit} onClose={onClose} />);
  return { onSubmit, onClose, user: userEvent.setup() };
}

describe('EntryDialog', () => {
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

  it('rejects an end before the start', async () => {
    const { user, onSubmit } = setup();
    await user.type(screen.getByRole('combobox', { name: 'Title' }), 'chill');
    const end = screen.getByLabelText('End');
    await user.clear(end);
    await user.type(end, '2026-10-07T08:00');
    expect(screen.getByText('End must be after start')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('keeps the duration when the start moves', async () => {
    const { user } = setup();
    const start = screen.getByLabelText('Start');
    await user.clear(start);
    await user.type(start, '2026-10-07T10:15');
    expect(screen.getByLabelText('End')).toHaveValue('2026-10-07T10:45');
    expect(screen.getByText('30 min')).toBeInTheDocument();
  });

  it('saves with Ctrl+S', async () => {
    const { user, onSubmit, onClose } = setup();
    await user.type(screen.getByRole('combobox', { name: 'Title' }), 'journal');
    await user.keyboard('{Control>}s{/Control}');
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ title: 'journal' })));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('shows a server error and stays open', async () => {
    const { user, onClose } = setup(vi.fn(async () => Promise.reject(new Error('end must be after start'))));
    await user.type(screen.getByRole('combobox', { name: 'Title' }), 'x');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('end must be after start');
    expect(onClose).not.toHaveBeenCalled();
  });
});
