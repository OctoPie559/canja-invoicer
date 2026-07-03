import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

/**
 * Driver-agnostic database types. Production uses Neon's serverless driver;
 * integration tests use PGlite (real Postgres, in-process). Services depend
 * only on these types, never on a concrete driver — that keeps the service
 * layer pure and the future offline port cheap (ARCHITECTURE.md §1.1).
 */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Transaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

let prodDb: Database | null = null;

/**
 * Lazily construct the production (Neon) database. Import this only from
 * transport-layer code and adapters — services receive a Database/Transaction
 * as an argument instead.
 */
export async function getDb(): Promise<Database> {
  if (prodDb) return prodDb;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  const { drizzle } = await import("drizzle-orm/neon-serverless");
  // neon-serverless (WebSocket) rather than neon-http: interactive
  // transactions are required for the audit-in-same-transaction invariant.
  prodDb = drizzle(url, { schema }) as unknown as Database;
  return prodDb;
}
