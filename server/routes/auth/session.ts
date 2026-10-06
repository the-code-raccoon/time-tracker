import { getDb } from '../../db.js';
import { json, requireSession } from '../../http.js';
import { ensureDailyBackup } from '../../repositories/backups.js';

/** GET /api/auth/session — also takes the day's backup the first time the app is opened that day (BAK-2). */
export async function GET(request: Request): Promise<Response> {
  const unauthorized = requireSession(request);
  if (unauthorized) return unauthorized;
  if (process.env.DATABASE_URL) await ensureDailyBackup(getDb()).catch((error) => console.error('Daily backup failed', error));
  return json({ authenticated: true });
}
