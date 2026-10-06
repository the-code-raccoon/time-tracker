import { describe, expect, it } from 'vitest';
import * as categoriesReorder from './routes/categories/reorder.js';
import * as category from './routes/categories/[id].js';
import * as categories from './routes/categories/index.js';
import * as entry from './routes/entries/[id].js';
import * as login from './routes/auth/login.js';
import { dispatch, matchRoute } from './router.js';

describe('matchRoute', () => {
  it.each([
    ['/api/auth/login', login],
    ['/api/categories', categories],
    ['/api/categories/', categories],
    ['/api/categories/reorder', categoriesReorder], // a fixed path wins over :id
    ['/api/categories/8d1c0a5e-0000-4000-8000-000000000000', category],
    ['/api/entries/8d1c0a5e-0000-4000-8000-000000000000', entry],
  ])('%s', (pathname, expected) => {
    expect(matchRoute(pathname)).toBe(expected);
  });

  it.each(['/api', '/api/', '/api/nope', '/api/auth/login/extra', '/api/../package.json', '/api/entries/a/b', '/entries'])(
    '%s → not found',
    (pathname) => {
      expect(matchRoute(pathname)).toBeUndefined();
    },
  );
});

describe('dispatch', () => {
  it('answers 404 for an unknown path', async () => {
    const response = await dispatch(new Request('http://localhost/api/nope'));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Not found' });
  });

  it('answers 405 for a method the route does not handle', async () => {
    const response = await dispatch(new Request('http://localhost/api/auth/login'));
    expect(response.status).toBe(405);
  });

  it('only calls exported HTTP methods', async () => {
    // login.ts also exports getLimiter, which must not be reachable as a method.
    const response = await dispatch(new Request('http://localhost/api/auth/login', { method: 'getLimiter' }));
    expect(response.status).toBe(405);
  });

  it('calls the handler for the method', async () => {
    const response = await dispatch(new Request('http://localhost/api/auth/logout', { method: 'POST' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ authenticated: false });
  });
});
