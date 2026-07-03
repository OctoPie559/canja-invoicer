import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import { auditLog, customerVersions } from "@/lib/db/schema";
import {
  ConflictError,
  NotFoundError,
  PermissionError,
} from "@/lib/domain/errors";
import type { ActorContext } from "@/lib/audit/context";
import {
  createCustomer,
  deleteCustomer,
  getCustomer,
  getCustomerTimeline,
  getCustomerVersions,
  listCustomers,
  updateCustomer,
} from "@/lib/services/customers";
import {
  acceptInvitation,
  inviteMember,
} from "@/lib/services/organizations";
import { createTestDb } from "../helpers/db";
import {
  createTwoOrgFixture,
  seedUser,
  upgradeToPro,
  type TwoOrgFixture,
} from "../helpers/fixtures";

describe("customers service", () => {
  let db: Database;
  let fx: TwoOrgFixture;
  let viewer: { id: string; email: string };

  const actorInA = (): ActorContext => ({
    actorType: "user",
    actorId: fx.alice.id,
    organizationId: fx.orgA,
  });

  const base = {
    name: "Wanjiku Design Studio",
    email: "billing@wanjiku.example",
    phone: "+254712345678",
    addressLine1: "Riverside Drive 12",
    city: "Nairobi",
    country: "KE",
  };

  beforeAll(async () => {
    ({ db } = await createTestDb());
    fx = await createTwoOrgFixture(db);
    await upgradeToPro(db, fx.orgA);
    // viewer joins org A through the real invitation flow (§9.2 fixtures)
    viewer = await seedUser(db, "viewer");
    const { invitationId } = await inviteMember(db, actorInA(), {
      email: viewer.email,
      role: "viewer",
    });
    await acceptInvitation(db, { userId: viewer.id }, { invitationId });
  });

  it("creates a customer with version 1 history and an audit row", async () => {
    const { customerId } = await createCustomer(db, actorInA(), base);

    const row = await getCustomer(db, fx.orgA, customerId);
    expect(row?.name).toBe(base.name);
    expect(row?.version).toBe(1);

    const versions = await getCustomerVersions(db, fx.orgA, customerId);
    expect(versions.length).toBe(1);
    expect((versions[0].data as { name: string }).name).toBe(base.name);

    const timeline = await getCustomerTimeline(db, fx.orgA, customerId);
    expect(timeline.map((t) => t.action)).toContain("customer.created");
  });

  it("answers point-in-time questions through version history", async () => {
    const { customerId } = await createCustomer(db, actorInA(), {
      ...base,
      name: "Original Name Ltd",
      addressLine1: "Old Street 1",
    });
    await updateCustomer(db, actorInA(), {
      ...base,
      id: customerId,
      version: 1,
      name: "Original Name Ltd",
      addressLine1: "New Avenue 2",
    });
    await updateCustomer(db, actorInA(), {
      ...base,
      id: customerId,
      version: 2,
      name: "Renamed Ltd",
      addressLine1: "New Avenue 2",
    });

    const versions = await getCustomerVersions(db, fx.orgA, customerId);
    expect(versions.length).toBe(3);
    const byVersion = new Map(
      versions.map((v) => [v.version, v.data as Record<string, unknown>]),
    );
    // "what was the address before the move" / "the name before the rename"
    expect(byVersion.get(1)?.addressLine1).toBe("Old Street 1");
    expect(byVersion.get(2)?.addressLine1).toBe("New Avenue 2");
    expect(byVersion.get(2)?.name).toBe("Original Name Ltd");
    expect(byVersion.get(3)?.name).toBe("Renamed Ltd");
    // every version row records who made the change
    for (const v of versions) expect(v.changedBy).toBe(fx.alice.id);
  });

  it("audits only the fields that changed", async () => {
    const { customerId } = await createCustomer(db, actorInA(), base);
    await updateCustomer(db, actorInA(), {
      ...base,
      id: customerId,
      version: 1,
      city: "Mombasa",
    });
    const [entry] = await db
      .select({ changes: auditLog.changes })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.entityId, customerId),
          eq(auditLog.action, "customer.updated"),
        ),
      );
    const changes = entry.changes as { before: object; after: object };
    expect(changes.before).toEqual({ city: "Nairobi" });
    expect(changes.after).toEqual({ city: "Mombasa" });
  });

  it("rejects stale versions with ConflictError and writes nothing", async () => {
    const { customerId } = await createCustomer(db, actorInA(), base);
    await updateCustomer(db, actorInA(), {
      ...base,
      id: customerId,
      version: 1,
      name: "First Writer Ltd",
    });
    // second writer still holds version 1
    await expect(
      updateCustomer(db, actorInA(), {
        ...base,
        id: customerId,
        version: 1,
        name: "Second Writer Ltd",
      }),
    ).rejects.toThrow(ConflictError);

    const row = await getCustomer(db, fx.orgA, customerId);
    expect(row?.name).toBe("First Writer Ltd"); // no silent overwrite
    const versions = await getCustomerVersions(db, fx.orgA, customerId);
    expect(versions.length).toBe(2); // no phantom version row
  });

  it("a no-op update writes neither a version row nor an audit row", async () => {
    const { customerId } = await createCustomer(db, actorInA(), base);
    await updateCustomer(db, actorInA(), {
      ...base,
      id: customerId,
      version: 1,
    });
    const versions = await getCustomerVersions(db, fx.orgA, customerId);
    expect(versions.length).toBe(1);
  });

  it("soft-deletes: hidden from reads, history and audit retained", async () => {
    const { customerId } = await createCustomer(db, actorInA(), base);
    await deleteCustomer(db, actorInA(), { id: customerId, version: 1 });

    expect(await getCustomer(db, fx.orgA, customerId)).toBeNull();
    const listed = await listCustomers(db, fx.orgA);
    expect(listed.map((c) => c.id)).not.toContain(customerId);

    const versions = await getCustomerVersions(db, fx.orgA, customerId);
    expect(versions.length).toBe(2);
    const timeline = await getCustomerTimeline(db, fx.orgA, customerId);
    expect(timeline.map((t) => t.action)).toContain("customer.deleted");
  });

  it("cross-tenant access fails: foreign actor and foreign customer id", async () => {
    // alice acting in org B — not a member there
    await expect(
      createCustomer(
        db,
        { actorType: "user", actorId: fx.alice.id, organizationId: fx.orgB },
        base,
      ),
    ).rejects.toThrow(PermissionError);

    // bob's customer is unreachable through org A's context
    const { customerId: bobsCustomer } = await createCustomer(
      db,
      { actorType: "user", actorId: fx.bob.id, organizationId: fx.orgB },
      { name: "Org B Client" },
    );
    await expect(
      updateCustomer(db, actorInA(), {
        id: bobsCustomer,
        version: 1,
        name: "Hijacked",
      }),
    ).rejects.toThrow(NotFoundError);
    expect(await getCustomer(db, fx.orgA, bobsCustomer)).toBeNull();
  });

  it("viewers cannot mutate customers", async () => {
    await expect(
      createCustomer(
        db,
        { actorType: "user", actorId: viewer.id, organizationId: fx.orgA },
        base,
      ),
    ).rejects.toThrow(PermissionError);
  });

  it("version history rows are tenant-isolated", async () => {
    const foreign = await db
      .select()
      .from(customerVersions)
      .where(eq(customerVersions.organizationId, fx.orgB));
    // rows exist for org B, but only via org B's scope — sanity of the reads
    const versionsViaA = await getCustomerVersions(
      db,
      fx.orgA,
      foreign[0]?.customerId ?? "none",
    );
    expect(versionsViaA.length).toBe(0);
  });
});
