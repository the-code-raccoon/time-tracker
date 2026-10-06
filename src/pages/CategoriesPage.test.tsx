import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Category } from '../../shared/types';
import { CATEGORIES, mockApi, requestsTo } from '../test/mockApi';
import { renderWithProviders } from '../test/render';
import { CategoriesPage } from './CategoriesPage';

const body = (fetchMock: ReturnType<typeof mockApi>, method: string, path: string, index = 0) =>
  JSON.parse(String(requestsTo(fetchMock, method, path)[index][1]?.body));

function setup(routes = {}, categories: Category[] = CATEGORIES) {
  const fetchMock = mockApi({ 'GET /api/categories': () => ({ status: 200, body: categories }), ...routes });
  renderWithProviders(<CategoriesPage onBack={() => {}} />);
  return { fetchMock, user: userEvent.setup() };
}

describe('CategoriesPage', () => {
  it('lists categories with their GCal colour and stats (CAT-7)', async () => {
    setup();
    const list = screen.getByRole('list', { name: 'Categories' });
    const rows = await within(list).findAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Food');
    expect(rows[0]).toHaveTextContent('Basil in Google Calendar');
    expect(rows[0]).toHaveTextContent('3 entries · 0.8 h');
    expect(rows[1]).toHaveTextContent('Peacock in Google Calendar');
  });

  it('creates a category', async () => {
    const { fetchMock, user } = setup({ 'POST /api/categories': () => ({ status: 201, body: CATEGORIES[0] }) });
    await user.click(await screen.findByRole('button', { name: 'New category' }));
    const dialog = screen.getByRole('dialog', { name: 'New category' });
    await user.type(within(dialog).getByLabelText(/^Name/), 'Reading');
    await user.click(within(dialog).getByRole('radio', { name: 'Cobalt' }));
    await user.click(within(within(dialog).getByRole('radiogroup', { name: 'Colour in Google Calendar' })).getByRole('radio', { name: 'Lavender' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(requestsTo(fetchMock, 'POST', '/api/categories')).toHaveLength(1));
    expect(body(fetchMock, 'POST', '/api/categories')).toEqual({ name: 'Reading', appColor: '#4285f4', gcalColorId: '1' });
  });

  it('warns before recolouring synced events in Google Calendar (CAT-10)', async () => {
    const synced = [{ ...CATEGORIES[0], syncedCount: 12 }, CATEGORIES[1]];
    const { fetchMock, user } = setup({ 'PATCH /api/categories/*': () => ({ status: 200, body: synced[0] }) }, synced);
    await user.click(await screen.findByRole('button', { name: 'Edit Food' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit category' });
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();

    const gcal = within(dialog).getByRole('radiogroup', { name: 'Colour in Google Calendar' });
    await user.click(within(gcal).getByRole('radio', { name: 'Sage' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('12 events will be recoloured to Sage in Google Calendar on the next sync.');

    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(requestsTo(fetchMock, 'PATCH', `/api/categories/${CATEGORIES[0].id}`)).toHaveLength(1));
    expect(body(fetchMock, 'PATCH', '/api/categories/')).toMatchObject({ gcalColorId: '2' });
  });

  it('accepts a custom hex colour (CAT-9)', async () => {
    const { fetchMock, user } = setup({ 'PATCH /api/categories/*': () => ({ status: 200, body: CATEGORIES[0] }) });
    await user.click(await screen.findByRole('button', { name: 'Edit Food' }));
    const hex = screen.getByLabelText('Hex');
    await user.clear(hex);
    await user.type(hex, '#12AB34');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(requestsTo(fetchMock, 'PATCH', '/api/categories/')).toHaveLength(1));
    expect(body(fetchMock, 'PATCH', '/api/categories/')).toMatchObject({ appColor: '#12ab34' });
  });

  it('shows a name clash from the server', async () => {
    const { user } = setup({ 'POST /api/categories': () => ({ status: 409, body: { error: 'That name is already taken' } }) });
    await user.click(await screen.findByRole('button', { name: 'New category' }));
    await user.type(screen.getByLabelText(/^Name/), 'Food');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('That name is already taken')).toBeInTheDocument();
  });

  it('merges a category into another (CAT-11)', async () => {
    const { fetchMock, user } = setup({ 'DELETE /api/categories/*': () => ({ status: 200, body: { moved: 1 } }) });
    await user.click(await screen.findByRole('button', { name: 'More actions for Leisure' }));
    await user.click(screen.getByRole('menuitem', { name: 'Merge into…' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('All 1 entry will move');
    await user.click(within(dialog).getByRole('button', { name: 'Merge' }));
    await waitFor(() => expect(requestsTo(fetchMock, 'DELETE', '/api/categories/')).toHaveLength(1));
    expect(requestsTo(fetchMock, 'DELETE', '/api/categories/')[0][0]).toBe(`/api/categories/${CATEGORIES[1].id}?moveTo=${CATEGORIES[0].id}`);
  });

  it('deletes a category, leaving its entries uncategorised by default', async () => {
    const { fetchMock, user } = setup({ 'DELETE /api/categories/*': () => ({ status: 200, body: { moved: 3 } }) });
    await user.click(await screen.findByRole('button', { name: 'More actions for Food' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(requestsTo(fetchMock, 'DELETE', '/api/categories/')).toHaveLength(1));
    expect(requestsTo(fetchMock, 'DELETE', '/api/categories/')[0][0]).toBe(`/api/categories/${CATEGORIES[0].id}?moveTo=none`);
  });

  it('reorders from the menu (CAT-8)', async () => {
    const { fetchMock, user } = setup({ 'POST /api/categories/reorder': () => ({ status: 200, body: CATEGORIES }) });
    await user.click(await screen.findByRole('button', { name: 'More actions for Food' }));
    expect(screen.getByRole('menuitem', { name: 'Move up' })).toHaveAttribute('aria-disabled', 'true');
    await user.click(screen.getByRole('menuitem', { name: 'Move down' }));
    await waitFor(() => expect(requestsTo(fetchMock, 'POST', '/api/categories/reorder')).toHaveLength(1));
    expect(body(fetchMock, 'POST', '/api/categories/reorder')).toEqual({ ids: [CATEGORIES[1].id, CATEGORIES[0].id] });
  });

  it('moves entries by title (CAT-12)', async () => {
    const { fetchMock, user } = setup({ 'POST /api/entries/recategorize': () => ({ status: 200, body: { moved: 35 } }) });
    await user.click(await screen.findByRole('button', { name: 'Move entries by title' }));
    const dialog = screen.getByRole('dialog', { name: 'Move entries by title' });
    await user.type(within(dialog).getByRole('combobox', { name: 'Title' }), 'chi');
    await user.click(await screen.findByRole('option', { name: /chill/ }));
    expect(dialog).toHaveTextContent('35 entries titled “chill”');
    await user.click(within(dialog).getByRole('button', { name: 'Move' }));

    await waitFor(() => expect(requestsTo(fetchMock, 'POST', '/api/entries/recategorize')).toHaveLength(1));
    expect(body(fetchMock, 'POST', '/api/entries/recategorize')).toEqual({ title: 'chill', categoryId: CATEGORIES[0].id });
    expect(await screen.findByText('Moved 35 entries')).toBeInTheDocument();
  });
});
