import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import { auditLog, member } from "@/lib/db/schema";
import { newId } from "@/lib/domain/ids";
import { ValidationError, NotFoundError } from "@/lib/domain/errors";
import type { ActorContext } from "@/lib/audit/context";
import {
  leaveOrganization,
  removeMember,
} from "@/lib/services/organizations";
import { createTestDb } from "../helpers/db";
import {
  createTwoOrgFixture,
  seedUser,
  type TwoOrgFixture,
} from "../helpers/fixtures";

/** Membership removal / leaving (issue 7): last-owner guard, protections,
 *  tenant isolation, and audit. */
describe("member removal & leaving", () => {
  let db: Database;
  let fx: TwoOrgFixture;

  const owner = (): ActorContext => ({
    actorType: "user",
    actorId: fx.alice.id, // owner of org A
    organizationId: fx.orgA,
  });

  /** Seed a fresh member of org A and return their user id. */
  async function seedMember(role: "admin" | "member" | "viewer") {
    const u = await seedUser(db, `m-${role}`);
    await db.insert(member).values({
      id: newId(),
      organizationId: fx.orgA,
      userId: u.id,
      role,
    });
    return u.id;
  }

  const memberCount = () =>
    db
      .select({ id: member.id })
      .from(member)
      .where(eq(member.organizationId, fx.orgA))
      .then((r) => r.length);

  const auditCount = (action: string, entityId: string) =>
    db
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, fx.orgA),
          eq(auditLog.action, action),
          eq(auditLog.entityId, entityId),
        ),
      )
      .then((r) => r.length);

  beforeEach(async () => {
    ({ db } = await createTestDb());
    fx = await createTwoOrgFixture(db);
  });

  it("an admin removes a member; the row is gone and audited", async () => {
    const adminId = await seedMember("admin");
    const memberId = await seedMember("member");
    const admin = (): ActorContext => ({
      actorType: "user",
      actorId: adminId,
      organizationId: fx.orgA,
    });
    await removeMember(db, admin(), memberId);
    const [row] = await db
      .select({ id: member.id })
      .from(member)
      .where(
        and(
          eq(member.organizationId, fx.orgA),
          eq(member.userId, memberId),
        ),
      );
    expect(row).toBeUndefined();
    expect(await auditCount("member.removed", memberId)).toBe(1);
  });

  it("a member (no member.remove permission) cannot remove anyone", async () => {
    const memberId = await seedMember("member");
    const victimId = await seedMember("viewer");
    const plain = (): ActorContext => ({
      actorType: "user",
      actorId: memberId,
      organizationId: fx.orgA,
    });
    await expect(removeMember(db, plain(), victimId)).rejects.toThrow(
      /permitted/i,
    );
  });

  it("an owner is protected from removal", async () => {
    const adminId = await seedMember("admin");
    const admin = (): ActorContext => ({
      actorType: "user",
      actorId: adminId,
      organizationId: fx.orgA,
    });
    await expect(removeMember(db, admin(), fx.alice.id)).rejects.toThrow(
      /owner cannot be removed/i,
    );
  });

  it("you cannot remove yourself via removeMember", async () => {
    const adminId = await seedMember("admin");
    const admin = (): ActorContext => ({
      actorType: "user",
      actorId: adminId,
      organizationId: fx.orgA,
    });
    await expect(removeMember(db, admin(), adminId)).rejects.toThrow(
      /Leave organization/i,
    );
  });

  it("removing a member of another org is a NotFound (tenant isolation)", async () => {
    // bob owns org B; alice (owner of A) cannot reach him
    await expect(removeMember(db, owner(), fx.bob.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("a non-last member can leave; membership drops and is audited", async () => {
    const memberId = await seedMember("member");
    const before = await memberCount();
    await leaveOrganization(db, {
      actorType: "user",
      actorId: memberId,
      organizationId: fx.orgA,
    });
    expect(await memberCount()).toBe(before - 1);
    expect(await auditCount("member.left", memberId)).toBe(1);
  });

  it("the last owner cannot leave", async () => {
    await expect(leaveOrganization(db, owner())).rejects.toBeInstanceOf(
      ValidationError,
    );
    // still there
    const [row] = await db
      .select({ id: member.id })
      .from(member)
      .where(
        and(eq(member.organizationId, fx.orgA), eq(member.userId, fx.alice.id)),
      );
    expect(row).toBeDefined();
  });

  it("an owner may leave once another owner exists", async () => {
    // promote a second owner directly, then the original can go
    const secondOwner = await seedUser(db, "co-owner");
    await db.insert(member).values({
      id: newId(),
      organizationId: fx.orgA,
      userId: secondOwner.id,
      role: "owner",
    });
    await leaveOrganization(db, owner());
    const [row] = await db
      .select({ id: member.id })
      .from(member)
      .where(
        and(eq(member.organizationId, fx.orgA), eq(member.userId, fx.alice.id)),
      );
    expect(row).toBeUndefined();
  });
});
