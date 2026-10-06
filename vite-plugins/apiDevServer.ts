import { existsSync, readdirSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';

type Handler = (request: Request) => Response | Promise<Response>;

async function toWebRequest(req: IncomingMessage): Promise<Request> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
  }
  if (!headers.has('x-forwarded-for') && req.socket.remoteAddress) {
    headers.set('x-forwarded-for', req.socket.remoteAddress);
  }

  const method = req.method ?? 'GET';
  let body: Buffer | undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    body = Buffer.concat(chunks);
  }
  return new Request(url, { method, headers, body });
}

async function sendWebResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    if (key !== 'set-cookie') res.setHeader(key, value);
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) res.setHeader('set-cookie', cookies);
  res.end(Buffer.from(await response.arrayBuffer()));
}

/** Resolves a URL path to a function file the way Vercel does: `x.ts`, `x/index.ts`, then a `[param].ts` sibling. */
export function resolveRoute(root: string, pathname: string): string | undefined {
  const apiRoot = path.join(root, 'api');
  const base = path.join(root, pathname);
  if (base !== apiRoot && !base.startsWith(apiRoot + path.sep)) return undefined;

  for (const candidate of [`${base}.ts`, path.join(base, 'index.ts')]) {
    if (existsSync(candidate)) return candidate;
  }
  const parent = path.dirname(base);
  if (!existsSync(parent) || !parent.startsWith(apiRoot)) return undefined;
  const dynamic = readdirSync(parent).find((file) => /^\[[^\]]+\]\.ts$/.test(file));
  return dynamic ? path.join(parent, dynamic) : undefined;
}

async function handle(server: ViteDevServer, req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');
  if (!pathname.startsWith('/api/')) return false;

  const file = resolveRoute(server.config.root, pathname.replace(/\/+$/, ''));
  if (!file) {
    await sendWebResponse(res, Response.json({ error: 'Not found' }, { status: 404 }));
    return true;
  }

  const module = (await server.ssrLoadModule(file)) as Record<string, unknown>;
  const handler = module[req.method ?? 'GET'];
  if (typeof handler !== 'function') {
    await sendWebResponse(res, Response.json({ error: 'Method not allowed' }, { status: 405 }));
    return true;
  }

  await sendWebResponse(res, await (handler as Handler)(await toWebRequest(req)));
  return true;
}

/**
 * Serves `api/**\/*.ts` (Vercel functions with the Web `Request`/`Response` signature)
 * from the Vite dev server, so `yarn dev` works without the Vercel CLI.
 */
export function apiDevServer(): Plugin {
  return {
    name: 'api-dev-server',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        handle(server, req, res)
          .then((handled) => {
            if (!handled) next();
          })
          .catch((error: unknown) => {
            if (error instanceof Error) server.ssrFixStacktrace(error);
            next(error);
          });
      });
    },
  };
}
