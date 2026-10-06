import { json, requireSession } from '../../server/http.js';

export function GET(request: Request): Response {
  return requireSession(request) ?? json({ authenticated: true });
}
