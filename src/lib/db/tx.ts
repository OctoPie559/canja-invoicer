import { sql } from "drizzle-orm";
import type { Database, Transaction } from "./client";

/** Non-superuser role subject to RLS; created in the RLS migration. */
export const APP_ROLE = "invoicer_app";

/**
 * Run `fn` in a transaction scoped to one organization, with the RLS
 * backstop armed: the transaction switches to the non-superuser app role and
 * sets `app.current_org_id`, so even a service-layer bug that forgets a
 * WHERE organization_id = ... cannot cross tenants (PROJECT_BRIEF.md §5.2).
 *
 * Every org-scoped mutation goes through this helper. SET LOCAL scopes both
 * settings to the transaction; they reset on commit/rollback.
 */
export async function withOrgTransaction<T>(
  db: Database,
  organizationId: string,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    // Role name is a compile-time constant; org id is bound as a parameter.
    await tx.execute(sql.raw(`SET LOCAL ROLE ${APP_ROLE}`));
    await tx.execute(
      sql`SELECT set_config('app.current_org_id', ${organizationId}, true)`,
    );
    return fn(tx);
  });
}
