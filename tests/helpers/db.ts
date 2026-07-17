import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/lib/db/schema";
import type { Database } from "@/lib/db/client";

/**
 * In-process real Postgres (PGlite) with the full migration set applied —
 * including the RLS policies and audit_log REVOKEs, so integration tests
 * exercise the same database-level guards production runs with.
 */
export async function createTestDb(): Promise<{
  db: Database;
  client: PGlite;
}> {
  // pgvector loaded so migration 0019's CREATE EXTENSION + vector column work
  const client = new PGlite({ extensions: { vector } });
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./src/lib/db/migrations" });
  return { db: db as unknown as Database, client };
}

/** The driver-agnostic Database type erases execute()'s result shape. */
export function rows(result: unknown): Record<string, unknown>[] {
  return (result as { rows: Record<string, unknown>[] }).rows;
}

/**
 * Assert a DB operation is rejected for the expected Postgres reason.
 * Drizzle wraps driver errors ("Failed query: ..."), burying the actual
 * cause (e.g. "violates row-level security policy") in the .cause chain.
 */
export async function expectDbRejection(
  operation: Promise<unknown>,
  pattern: RegExp,
): Promise<void> {
  let thrown: unknown = null;
  try {
    await operation;
  } catch (error) {
    thrown = error;
  }
  if (thrown === null) {
    throw new Error(
      `Expected rejection matching ${pattern}, but the operation succeeded`,
    );
  }
  const messages: string[] = [];
  for (let e = thrown; e instanceof Error; e = e.cause as Error) {
    messages.push(e.message);
  }
  if (!messages.some((m) => pattern.test(m))) {
    throw new Error(
      `Expected an error matching ${pattern}; got: ${messages.join(" | ")}`,
    );
  }
}
