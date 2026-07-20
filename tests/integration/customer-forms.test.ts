import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import { auditLog, customers, member } from "@/lib/db/schema";
import { newId } from "@/lib/domain/ids";
import { NotFoundError, PermissionError } from "@/lib/domain/errors";
import type { ActorContext } from "@/lib/audit/context";
import type { FileStorage, StoredFile } from "@/lib/storage/port";
import {
  createCustomer,
  uploadCustomerLogo,
} from "@/lib/services/customers";
import { listContacts } from "@/lib/services/contacts";
import { createTestDb } from "../helpers/db";
import {
  createTwoOrgFixture,
  seedUser,
  type TwoOrgFixture,
} from "../helpers/fixtures";

function fakeStorage() {
  const objects = new Map<string, number>();
  const storage: FileStorage = {
    async put(p): Promise<StoredFile> {
      objects.set(p.key, p.body.byteLength);
      return { key: p.key, publicUrl: `https://assets.test/${p.key}` };
    },
    async delete(key) {
      objects.delete(key);
    },
    publicUrl: (key) => `https://assets.test/${key}`,
  };
  return { storage, objects };
}

const png = () => {
  const b = new Uint8Array(64);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return b;
};

describe("customer forms (wave 5: multi-contact create + logo)", () => {
  let db: Database;
  let fx: TwoOrgFixture;

  const owner = (): ActorContext => ({
    actorType: "user",
    actorId: fx.alice.id,
    organizationId: fx.orgA,
  });

  beforeEach(async () => {
    ({ db } = await createTestDb());
    fx = await createTwoOrgFixture(db);
  });

  it("creates multiple contacts in one save, with a single primary (issue 12)", async () => {
    const { customerId } = await createCustomer(db, owner(), { name: "Acme Ltd" }, [
      { firstName: "Grace", lastName: "Wanjiku", email: "grace@acme.test", isPrimary: true },
      { firstName: "Otieno", mobile: "+254711000000" },
    ]);

    const contacts = await listContacts(db, fx.orgA, customerId);
    expect(contacts).toHaveLength(2);
    expect(contacts.filter((c) => c.isPrimary)).toHaveLength(1);
    expect(contacts.find((c) => c.isPrimary)?.firstName).toBe("Grace");
  });

  it("uploads a logo: sets logoKey, audited, replace deletes the old object", async () => {
    const { customerId } = await createCustomer(db, owner(), { name: "Acme Ltd" });
    const { storage, objects } = fakeStorage();

    const { logoKey } = await uploadCustomerLogo(
      db,
      owner(),
      { customerId, bytes: png(), contentType: "image/png" },
      { storage },
    );
    expect(objects.has(logoKey)).toBe(true);

    const [row] = await db
      .select({ logoKey: customers.logoKey })
      .from(customers)
      .where(eq(customers.id, customerId));
    expect(row.logoKey).toBe(logoKey);

    const [audit] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "customer.logo_updated"));
    expect(audit).toBeDefined();
    expect(audit.organizationId).toBe(fx.orgA);

    // replacing drops the superseded object
    const { logoKey: second } = await uploadCustomerLogo(
      db,
      owner(),
      { customerId, bytes: png(), contentType: "image/png" },
      { storage },
    );
    expect(second).not.toBe(logoKey);
    expect(objects.has(logoKey)).toBe(false);
    expect(objects.has(second)).toBe(true);
  });

  it("rejects a logo upload for another org's customer", async () => {
    const { customerId } = await createCustomer(db, owner(), { name: "Acme Ltd" });
    const bobCtx: ActorContext = {
      actorType: "user",
      actorId: fx.bob.id,
      organizationId: fx.orgB,
    };
    const { storage } = fakeStorage();
    await expect(
      uploadCustomerLogo(
        db,
        bobCtx,
        { customerId, bytes: png(), contentType: "image/png" },
        { storage },
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("a viewer cannot upload a logo (customer.update required)", async () => {
    const { customerId } = await createCustomer(db, owner(), { name: "Acme Ltd" });
    const viewer = await seedUser(db, "viewer");
    await db.insert(member).values({
      id: newId(),
      organizationId: fx.orgA,
      userId: viewer.id,
      role: "viewer",
    });
    const { storage } = fakeStorage();
    await expect(
      uploadCustomerLogo(
        db,
        { actorType: "user", actorId: viewer.id, organizationId: fx.orgA },
        { customerId, bytes: png(), contentType: "image/png" },
        { storage },
      ),
    ).rejects.toBeInstanceOf(PermissionError);
  });
});
