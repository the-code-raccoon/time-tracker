import postgres from 'postgres';

/** Minimal query interface, so repositories run against Supabase (postgres.js) and PGlite in tests. */
export type Db = {
  query<T extends object = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  /** Runs one or more statements without parameters (migrations). */
  exec(text: string): Promise<void>;
};

/** Runs async tasks one at a time, in order. */
export function createSerialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const result = tail.then(task, task);
    tail = result.catch(() => undefined);
    return result;
  };
}

export function createPostgresDb(url: string): Db & { end(): Promise<void> } {
  // prepare: false is required by Supabase's transaction pooler (port 6543).
  const sql = postgres(url, { prepare: false, max: 1, idle_timeout: 20, connect_timeout: 10, onnotice: () => {} });
  // postgres.js pipelines concurrent queries on its connection, which Supabase's transaction pooler doesn't
  // handle reliably (wrong results, then a stuck connection). Send one query at a time instead.
  const serial = createSerialQueue();
  return {
    query<T extends object>(text: string, params: unknown[] = []) {
      return serial(async () => (await sql.unsafe(text, params as postgres.ParameterOrJSON<never>[])) as unknown as T[]);
    },
    exec(text) {
      return serial(async () => {
        await sql.unsafe(text).simple();
      });
    },
    end: () => sql.end(),
  };
}

let shared: Db | undefined;

/** Connection reused across invocations of a warm serverless instance. */
export function getDb(): Db {
  if (!shared) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    shared = createPostgresDb(url);
  }
  return shared;
}

/** Test hook: route getDb() to another database (e.g. PGlite). */
export function setDb(db: Db | undefined): void {
  shared = db;
}
