import { json } from '../../http.js';
import { clearedSessionCookie } from '../../session.js';

export function POST(request: Request): Response {
  return json({ authenticated: false }, { headers: { 'set-cookie': clearedSessionCookie(request) } });
}
