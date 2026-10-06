import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
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

  it('continues to Google sign-in after the password', async () => {
    const user = userEvent.setup();
    const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => undefined);
    const fetchMock = mockApi({
      'GET /api/auth/session': () => ({ status: 401 }),
      'POST /api/auth/login': () => ({ status: 200, body: { redirect: 'https://accounts.google.com/o/oauth2/v2/auth?state=s' } }),
    });
    renderWithTheme(<App />);

    await user.type(await screen.findByLabelText(/^password/i), 'hunter2hunter2');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ password: 'hunter2hunter2' }) }),
    );
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth?state=s'));
    expect(screen.getByRole('button', { name: 'Continuing to Google…' })).toBeDisabled();
  });

  it('shows why the Google sign-in failed and tidies the URL', async () => {
    window.history.replaceState(null, '', '/?login_error=That+Google+account+is+not+allowed+to+sign+in.');
    mockApi({ 'GET /api/auth/session': () => ({ status: 401 }) });
    renderWithTheme(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('That Google account is not allowed to sign in.');
    expect(window.location.search).toBe('');
  });

  it('signs out', async () => {
    const user = userEvent.setup();
    mockApi({ 'POST /api/auth/logout': () => ({ status: 200 }) });
    renderWithTheme(<App />);
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
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect password');
  });

  it('returns to the login page when the session expires', async () => {
    mockApi({ 'GET /api/entries': () => ({ status: 401, body: { error: 'Unauthorized' } }) });
    renderWithTheme(<App />);
    expect(await screen.findByLabelText(/^password/i)).toBeInTheDocument();
  });
});
