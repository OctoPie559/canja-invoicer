import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import { auditLog, member, organizationSettings } from "@/lib/db/schema";
import { newId } from "@/lib/domain/ids";
import { PermissionError } from "@/lib/domain/errors";
import type { ActorContext } from "@/lib/audit/context";
import { recordReferralSource } from "@/lib/services/organizations";
import { createTestDb } from "../helpers/db";
import {
  createTwoOrgFixture,
  seedUser,
  type TwoOrgFixture,
} from "../helpers/fixtures";
import { ZodError } from "zod";

/** Onboarding survey (issue 1): referral capture is audited, org-scoped,
 *  permission-gated, and validated. */
describe("onboarding referral capture", () => {
  let db: Database;
  let fx: TwoOrgFixture;

  const owner = (): ActorContext => ({
    actorType: "user",
    actorId: fx.alice.id, // owner of org A
    organizationId: fx.orgA,
  });

  beforeEach(async () => {
    ({ db } = await createTestDb());
    fx = await createTwoOrgFixture(db);
  });

  it("records the source on the org's settings, audited", async () => {
    await recordReferralSource(db, owner(), "whatsapp");

    const [settings] = await db
      .select()
      .from(organizationSettings)
      .where(eq(organizationSettings.organizationId, fx.orgA));
    expect(settings.referralSource).toBe("whatsapp");

    const [audit] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "organization.referral_recorded"));
    expect(audit).toBeDefined();
    expect(audit.organizationId).toBe(fx.orgA);
  });

  it("rejects an unknown source (server-side validation)", async () => {
    await expect(recordReferralSource(db, owner(), "carrier_pigeon")).rejects.toBeInstanceOf(
      ZodError,
    );
    // nothing written
    const [settings] = await db
      .select()
      .from(organizationSettings)
      .where(eq(organizationSettings.organizationId, fx.orgA));
    expect(settings.referralSource).toBeNull();
  });

  it("a viewer cannot record it (settings.update required)", async () => {
    const viewer = await seedUser(db, "viewer");
    await db.insert(member).values({
      id: newId(),
      organizationId: fx.orgA,
      userId: viewer.id,
      role: "viewer",
    });
    await expect(
      recordReferralSource(
        db,
        { actorType: "user", actorId: viewer.id, organizationId: fx.orgA },
        "search",
      ),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("only touches the caller's org", async () => {
    await recordReferralSource(db, owner(), "search");
    const [orgB] = await db
      .select()
      .from(organizationSettings)
      .where(eq(organizationSettings.organizationId, fx.orgB));
    expect(orgB.referralSource).toBeNull();
  });
});
