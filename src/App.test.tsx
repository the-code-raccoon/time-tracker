import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import { mockApi } from './test/mockApi';
import { renderWithTheme } from './test/render';

describe('App', () => {
  it('shows the login page when there is no session', async () => {
    mockApi({ 'GET /api/auth/session': () => ({ status: 401 }) });
    renderWithTheme(<App />);
    expect(await screen.findByLabelText(/^password/i)).toBeInTheDocument();
  });

  it('shows the calendar when already signed in', async () => {
    mockApi();
    renderWithTheme(<App />);
    expect(await screen.findByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('signs in, then signs out', async () => {
    const user = userEvent.setup();
    const fetchMock = mockApi({
      'GET /api/auth/session': () => ({ status: 401 }),
      'POST /api/auth/login': () => ({ status: 200 }),
      'POST /api/auth/logout': () => ({ status: 200 }),
    });
    renderWithTheme(<App />);

    await user.type(await screen.findByLabelText(/^password/i), 'hunter2hunter2');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ password: 'hunter2hunter2' }) }),
    );

    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(screen.getByLabelText(/^password/i)).toBeInTheDocument());
  });

  it('shows the server error for a wrong password', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/auth/session': () => ({ status: 401 }),
      'POST /api/auth/login': () => ({ status: 401, body: { error: 'Incorrect password' } }),
    });
    renderWithTheme(<App />);

    await user.type(await screen.findByLabelText(/^password/i), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect password');
  });

  it('returns to the login page when the session expires', async () => {
    mockApi({ 'GET /api/entries': () => ({ status: 401, body: { error: 'Unauthorized' } }) });
    renderWithTheme(<App />);
    expect(await screen.findByLabelText(/^password/i)).toBeInTheDocument();
  });
});
