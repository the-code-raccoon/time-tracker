import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveRoute } from './apiDevServer.ts';

const root = path.resolve(import.meta.dirname, '..');
const rel = (file: string | undefined) => file && path.relative(root, file);

describe('resolveRoute', () => {
  it.each([
    ['/api/auth/login', 'api/auth/login.ts'],
    ['/api/categories', 'api/categories/index.ts'],
    ['/api/categories/reorder', 'api/categories/reorder.ts'], // a static file wins over [id].ts
    ['/api/categories/8d1c0a5e-0000-4000-8000-000000000000', 'api/categories/[id].ts'],
    ['/api/entries', 'api/entries/index.ts'],
    ['/api/entries/8d1c0a5e-0000-4000-8000-000000000000', 'api/entries/[id].ts'],
  ])('%s → %s', (pathname, expected) => {
    expect(rel(resolveRoute(root, pathname))).toBe(expected);
  });

  it.each(['/api/nope', '/api/auth/login/extra', '/api/../package.json', '/api/entries/a/b'])('%s → not found', (pathname) => {
    expect(resolveRoute(root, pathname)).toBeUndefined();
  });
});
