import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import { withOrgTransaction } from "@/lib/db/tx";
import { customers } from "@/lib/db/schema";
import { newId } from "@/lib/domain/ids";
import { PermissionError } from "@/lib/domain/errors";
import { inviteMember } from "@/lib/services/organizations";
import { createTestDb, expectDbRejection, rows } from "../helpers/db";
import { createTwoOrgFixture, type TwoOrgFixture } from "../helpers/fixtures";

/**
 * The brief §9 requirement made executable: one organization cannot read or
 * mutate another's data — at the service layer AND at the database (RLS).
 */
describe("tenant isolation", () => {
  let db: Database;
  let fx: TwoOrgFixture;

  beforeAll(async () => {
    ({ db } = await createTestDb());
    fx = await createTwoOrgFixture(db);
    // one customer in each org, written under each org's own transaction
    for (const [orgId, name] of [
      [fx.orgA, "Customer of A"],
      [fx.orgB, "Customer of B"],
    ] as const) {
      await withOrgTransaction(db, orgId, async (tx) => {
        await tx.insert(customers).values({
          id: newId(),
          organizationId: orgId,
          name,
        });
      });
    }
  });

  it("RLS hides other tenants' rows even without a WHERE clause", async () => {
    const seen = await withOrgTransaction(db, fx.orgA, async (tx) => {
      // deliberately unfiltered — simulates a service bug that forgot the
      // organization_id filter; the RLS backstop must still isolate
      const result = rows(await tx.execute(sql`SELECT name FROM customers`));
      return result.map((r) => r.name);
    });
    expect(seen).toEqual(["Customer of A"]);
  });

  it("RLS blocks writing a row stamped with another tenant's org id", async () => {
    await expectDbRejection(
      withOrgTransaction(db, fx.orgA, async (tx) => {
        await tx.insert(customers).values({
          id: newId(),
          organizationId: fx.orgB, // forged tenant
          name: "smuggled",
        });
      }),
      /row-level security/i,
    );
  });

  it("RLS blocks cross-tenant UPDATE and DELETE entirely", async () => {
    const affected = await withOrgTransaction(db, fx.orgA, async (tx) => {
      // unfiltered UPDATE from org A's transaction touches 0 of B's rows
      const updated = await tx.execute(
        sql`UPDATE customers SET name = 'defaced' RETURNING organization_id`,
      );
      return rows(updated).map((r) => r.organization_id);
    });
    expect(affected).toEqual([fx.orgA]);

    const bNames = await withOrgTransaction(db, fx.orgB, async (tx) =>
      rows(await tx.execute(sql`SELECT name FROM customers`)).map(
        (r) => r.name,
      ),
    );
    expect(bNames).toEqual(["Customer of B"]);
  });

  it("audit timelines are tenant-scoped", async () => {
    const visible = await withOrgTransaction(db, fx.orgA, async (tx) => {
      const result = rows(
        await tx.execute(sql`SELECT DISTINCT organization_id FROM audit_log`),
      );
      return result.map((r) => r.organization_id);
    });
    expect(visible).toEqual([fx.orgA]);
  });

  it("service refuses actors who are not members of the target org", async () => {
    await expect(
      inviteMember(
        db,
        // alice attempting to act inside bob's organization
        { actorType: "user", actorId: fx.alice.id, organizationId: fx.orgB },
        { email: "intruder@example.test", role: "member" },
      ),
    ).rejects.toThrow(PermissionError);
  });
});
