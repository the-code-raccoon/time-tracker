import type { IncomingMessage, ServerResponse } from 'node:http';
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

async function handle(server: ViteDevServer, req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  if (!req.url?.startsWith('/api/')) return false;

  // The same router as the deployed function (api/index.ts), loaded through Vite so edits apply without a restart.
  const { dispatch } = (await server.ssrLoadModule('/server/router.ts')) as { dispatch: Handler };
  await sendWebResponse(res, await dispatch(await toWebRequest(req)));
  return true;
}

/**
 * Serves the API routes (server/routes, Web `Request`/`Response` handlers)
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
