import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { renderWithTheme } from './test/render';

type Route = (init?: RequestInit) => { status: number; body?: unknown };

function mockApi(routes: Record<string, Route>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${input.toString()}`;
    const route = routes[key];
    if (!route) throw new Error(`Unexpected request: ${key}`);
    const { status, body = {} } = route(init);
    return new Response(JSON.stringify(body), { status });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('App', () => {
  it('shows the login page when there is no session', async () => {
    mockApi({ 'GET /api/auth/session': () => ({ status: 401 }) });
    renderWithTheme(<App />);
    expect(await screen.findByLabelText(/^password/i)).toBeInTheDocument();
  });

  it('shows the app when already signed in', async () => {
    mockApi({ 'GET /api/auth/session': () => ({ status: 200, body: { authenticated: true } }) });
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
});
