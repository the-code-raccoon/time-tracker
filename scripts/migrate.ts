// Applies pending SQL migrations to DATABASE_URL.
import { createPostgresDb } from '../server/db.ts';
import { migrate } from '../server/migrate.ts';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set (yarn db:migrate reads .env.local)');
  process.exit(1);
}

const db = createPostgresDb(url);
try {
  const applied = await migrate(db);
  console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date.');
} finally {
  await db.end();
}
