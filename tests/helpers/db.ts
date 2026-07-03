import { PGlite } from "@electric-sql/pglite";
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
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./src/lib/db/migrations" });
  return { db: db as unknown as Database, client };
}

/** The driver-agnostic Database type erases execute()'s result shape. */
export function rows(result: unknown): Record<string, unknown>[] {
  return (result as { rows: Record<string, unknown>[] }).rows;
}
