import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { requireEnv, env } from '../config/env.ts';
import * as schema from './schema.ts';

let postgresClient: postgres.Sql | undefined;
let drizzleDb: ReturnType<typeof drizzle> | undefined;

/**
 * Get or create the Drizzle database client.
 * Lazy-loads the postgres.js connection on first call so importing this module
 * is always safe (no connection until the client is actually used).
 */
function getDb() {
  if (!drizzleDb) {
    // Only create the client when needed.
    const databaseUrl = requireEnv('DATABASE_URL', env);
    postgresClient = postgres(databaseUrl);
    drizzleDb = drizzle(postgresClient, { schema });
  }
  return drizzleDb;
}

/**
 * Access the Drizzle ORM client.
 */
export function getClient() {
  return getDb();
}

/**
 * Lazy-loaded Drizzle client. Access via getClient() rather than direct export
 * to ensure lazy initialization.
 */
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get: (_, prop) => getDb()[prop as never],
});

/**
 * Export raw sql helper for direct SQL queries if needed.
 */
export { sql };

/**
 * Close the database connection pool.
 * Call this when shutting down or in cleanup (e.g., test teardown).
 */
export async function closeDb() {
  if (postgresClient) {
    await postgresClient.end();
    postgresClient = undefined;
    drizzleDb = undefined;
  }
}
