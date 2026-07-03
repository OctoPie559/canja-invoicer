import { eq } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import { subscriptions, user } from "@/lib/db/schema";
import { newId } from "@/lib/domain/ids";
import { createOrganization } from "@/lib/services/organizations";

/**
 * Two-org fixture (ARCHITECTURE.md §9.2): most integration tests create two
 * organizations so isolation assertions are ambient. Organizations are built
 * THROUGH the service (exercising the mutation pipeline); users are seeded
 * directly because account creation belongs to Better Auth, not our domain.
 */
export interface TwoOrgFixture {
  alice: { id: string; email: string };
  bob: { id: string; email: string };
  orgA: string;
  orgB: string;
}

export async function seedUser(
  db: Database,
  name: string,
): Promise<{ id: string; email: string }> {
  const id = newId();
  const email = `${name}-${id.slice(-6)}@example.test`;
  await db.insert(user).values({ id, name, email, emailVerified: true });
  return { id, email };
}

export async function createTwoOrgFixture(
  db: Database,
): Promise<TwoOrgFixture> {
  const alice = await seedUser(db, "alice");
  const bob = await seedUser(db, "bob");
  const { organizationId: orgA } = await createOrganization(
    db,
    { name: "Org A", type: "business" },
    { userId: alice.id },
  );
  const { organizationId: orgB } = await createOrganization(
    db,
    { name: "Org B", type: "business" },
    { userId: bob.id },
  );
  return { alice, bob, orgA, orgB };
}

/** Admin fixture step: billing service arrives in slice 8. */
export async function upgradeToPro(
  db: Database,
  organizationId: string,
): Promise<void> {
  await db
    .update(subscriptions)
    .set({ plan: "pro" })
    .where(eq(subscriptions.organizationId, organizationId));
}
