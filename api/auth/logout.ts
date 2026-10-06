import { json } from '../../server/http.js';
import { clearedSessionCookie } from '../../server/session.js';

export function POST(request: Request): Response {
  return json({ authenticated: false }, { headers: { 'set-cookie': clearedSessionCookie(request) } });
}
