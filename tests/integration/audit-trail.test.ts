import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import { withOrgTransaction } from "@/lib/db/tx";
import { auditLog, customers, invitation, member } from "@/lib/db/schema";
import { newId } from "@/lib/domain/ids";
import { EntitlementError } from "@/lib/domain/errors";
import { writeAudit } from "@/lib/audit/write";
import type { ActorContext } from "@/lib/audit/context";
import {
  acceptInvitation,
  inviteMember,
  revokeInvitation,
} from "@/lib/services/organizations";
import { createTestDb, expectDbRejection } from "../helpers/db";
import {
  createTwoOrgFixture,
  seedUser,
  upgradeToPro,
  type TwoOrgFixture,
} from "../helpers/fixtures";

describe("audit trail", () => {
  let db: Database;
  let fx: TwoOrgFixture;

  const actorInA = (): ActorContext => ({
    actorType: "user",
    actorId: fx.alice.id,
    organizationId: fx.orgA,
    requestId: "test-request",
  });

  beforeAll(async () => {
    ({ db } = await createTestDb());
    fx = await createTwoOrgFixture(db);
    await upgradeToPro(db, fx.orgA); // free seatCap=1 would block invites
  });

  it("org creation audited org + owner membership in the same transaction", async () => {
    const entries = await db
      .select({ action: auditLog.action, actorId: auditLog.actorId })
      .from(auditLog)
      .where(eq(auditLog.organizationId, fx.orgA));
    const actions = entries.map((e) => e.action);
    expect(actions).toContain("organization.created");
    expect(actions).toContain("member.added");
    for (const e of entries) expect(e.actorId).toBe(fx.alice.id);
  });

  it("a rolled-back mutation leaves neither the change nor the audit row", async () => {
    const marker = `rollback-probe-${newId()}`;
    await expect(
      withOrgTransaction(db, fx.orgA, async (tx) => {
        await tx.insert(customers).values({
          id: newId(),
          organizationId: fx.orgA,
          name: marker,
        });
        await writeAudit(tx, actorInA(), {
          action: "customer.created",
          entityType: "customer",
          reason: marker,
        });
        throw new Error("boom — roll it all back");
      }),
    ).rejects.toThrow("boom");

    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.name, marker));
    expect(customer).toBeUndefined();
    const [entry] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.reason, marker));
    expect(entry).toBeUndefined();
  });

  it("the app role cannot UPDATE or DELETE audit rows — append-only at the DB", async () => {
    await expectDbRejection(
      withOrgTransaction(db, fx.orgA, async (tx) => {
        await tx.execute(sql`UPDATE audit_log SET action = 'history.rewritten'`);
      }),
      /permission denied/i,
    );
    await expectDbRejection(
      withOrgTransaction(db, fx.orgA, async (tx) => {
        await tx.execute(sql`DELETE FROM audit_log`);
      }),
      /permission denied/i,
    );
  });

  it("invitation lifecycle: invite → audit; revoke → audit", async () => {
    const { invitationId } = await inviteMember(db, actorInA(), {
      email: "carol@example.test",
      role: "member",
    });
    await revokeInvitation(db, actorInA(), invitationId);

    const entries = await db
      .select({ action: auditLog.action, entityId: auditLog.entityId })
      .from(auditLog)
      .where(eq(auditLog.entityId, invitationId));
    expect(entries.map((e) => e.action)).toEqual([
      "member.invited",
      "invitation.revoked",
    ]);

    const [inv] = await db
      .select({ status: invitation.status })
      .from(invitation)
      .where(eq(invitation.id, invitationId));
    expect(inv.status).toBe("revoked");
  });

  it("accepting an invitation adds the member and audits member.joined", async () => {
    const dave = await seedUser(db, "dave");
    const { invitationId } = await inviteMember(db, actorInA(), {
      email: dave.email,
      role: "viewer",
    });
    const { organizationId } = await acceptInvitation(
      db,
      { userId: dave.id },
      { invitationId },
    );
    expect(organizationId).toBe(fx.orgA);

    const [m] = await db
      .select({ role: member.role })
      .from(member)
      .where(eq(member.userId, dave.id));
    expect(m.role).toBe("viewer");

    const joined = await db
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(eq(auditLog.entityId, dave.id));
    expect(joined.map((e) => e.action)).toContain("member.joined");
  });

  it("free plan seat cap blocks invites server-side (never just hidden UI)", async () => {
    await expect(
      inviteMember(
        db,
        { actorType: "user", actorId: fx.bob.id, organizationId: fx.orgB },
        { email: "extra-seat@example.test", role: "member" },
      ),
    ).rejects.toThrow(EntitlementError);
  });
});
