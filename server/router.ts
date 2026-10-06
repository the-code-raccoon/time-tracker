import * as login from './routes/auth/login.js';
import * as logout from './routes/auth/logout.js';
import * as session from './routes/auth/session.js';
import * as backup from './routes/backups/[id].js';
import * as backups from './routes/backups/index.js';
import * as category from './routes/categories/[id].js';
import * as categories from './routes/categories/index.js';
import * as categoriesReorder from './routes/categories/reorder.js';
import * as entry from './routes/entries/[id].js';
import * as entries from './routes/entries/index.js';
import * as entriesRecategorize from './routes/entries/recategorize.js';
import * as entriesRestore from './routes/entries/restore.js';
import * as googleCallback from './routes/google/callback.js';
import * as googleConnect from './routes/google/connect.js';
import * as googleDisconnect from './routes/google/disconnect.js';
import * as googleStatus from './routes/google/status.js';
import * as reports from './routes/reports/index.js';
import * as syncConflicts from './routes/sync/conflicts.js';
import * as sync from './routes/sync/index.js';
import * as syncPull from './routes/sync/pull.js';
import * as syncResolve from './routes/sync/resolve.js';
import * as timer from './routes/timer/index.js';
import * as timerStop from './routes/timer/stop.js';
import * as titles from './routes/titles.js';
import { json } from './http.js';

type Handler = (request: Request) => Response | Promise<Response>;
type RouteModule = object;

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Every API route, keyed by its path under /api/. `:id` matches one segment, and a fixed path wins over it.
 * The routes are served by a single Vercel function (api/index.ts) to stay under the Hobby plan's function limit.
 */
const routes: Record<string, RouteModule> = {
  'auth/login': login,
  'auth/logout': logout,
  'auth/session': session,
  backups,
  'backups/:id': backup,
  categories,
  'categories/reorder': categoriesReorder,
  'categories/:id': category,
  entries,
  'entries/recategorize': entriesRecategorize,
  'entries/restore': entriesRestore,
  'entries/:id': entry,
  'google/callback': googleCallback,
  'google/connect': googleConnect,
  'google/disconnect': googleDisconnect,
  'google/status': googleStatus,
  reports,
  sync,
  'sync/conflicts': syncConflicts,
  'sync/pull': syncPull,
  'sync/resolve': syncResolve,
  timer,
  'timer/stop': timerStop,
  titles,
};

/** Finds the route for a URL path such as `/api/entries/123`, or undefined when there is none. */
export function matchRoute(pathname: string): RouteModule | undefined {
  const match = /^\/api\/(.+?)\/*$/.exec(pathname);
  if (!match) return undefined;
  const path = match[1];
  if (Object.hasOwn(routes, path)) return routes[path];

  const slash = path.lastIndexOf('/');
  const dynamic = slash > 0 ? `${path.slice(0, slash)}/:id` : undefined;
  return dynamic && Object.hasOwn(routes, dynamic) ? routes[dynamic] : undefined;
}

/** Calls the handler for the request's path and method, or answers 404/405 as JSON. */
export async function dispatch(request: Request): Promise<Response> {
  const route = matchRoute(new URL(request.url).pathname);
  if (!route) return json({ error: 'Not found' }, { status: 404 });

  const handler = METHODS.has(request.method) ? (route as Record<string, unknown>)[request.method] : undefined;
  if (typeof handler !== 'function') return json({ error: 'Method not allowed' }, { status: 405 });
  return (handler as Handler)(request);
}
