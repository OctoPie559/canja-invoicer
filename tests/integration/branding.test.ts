import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";
import {
  ConflictError,
  PermissionError,
  ValidationError,
} from "@/lib/domain/errors";
import type { ActorContext } from "@/lib/audit/context";
import type { FileStorage, StoredFile } from "@/lib/storage/port";
import {
  getBranding,
  updateBranding,
  uploadBrandingLogo,
} from "@/lib/services/branding";
import { createTestDb } from "../helpers/db";
import { createTwoOrgFixture, type TwoOrgFixture } from "../helpers/fixtures";

/** In-memory storage fake implementing the port. */
function memoryStorage() {
  const objects = new Map<string, { contentType: string; size: number }>();
  const storage: FileStorage = {
    async put(params): Promise<StoredFile> {
      objects.set(params.key, {
        contentType: params.contentType,
        size: params.body.byteLength,
      });
      return { key: params.key, publicUrl: `https://assets.test/${params.key}` };
    },
    async delete(key) {
      objects.delete(key);
    },
    publicUrl: (key) => `https://assets.test/${key}`,
  };
  return { objects, storage };
}

describe("branding service (slice 4)", () => {
  let db: Database;
  let fx: TwoOrgFixture;

  const actorInA = (): ActorContext => ({
    actorType: "user",
    actorId: fx.alice.id,
    organizationId: fx.orgA,
  });
  const bobInA = (): ActorContext => ({
    actorType: "user",
    actorId: fx.bob.id,
    organizationId: fx.orgA,
  });

  beforeAll(async () => {
    ({ db } = await createTestDb());
    fx = await createTwoOrgFixture(db);
  });

  it("updates branding details with optimistic lock + audit", async () => {
    const before = await getBranding(db, fx.orgA);
    await updateBranding(db, actorInA(), {
      version: before.version,
      legalName: "Njogu-ini Studios Ltd",
      city: "Nyeri",
      country: "Kenya",
      kraPin: "A012345678Z",
      contactEmail: "billing@studio.test",
      accentColor: "#103B05",
    });
    const after = await getBranding(db, fx.orgA);
    expect(after.legalName).toBe("Njogu-ini Studios Ltd");
    expect(after.accentColor).toBe("#103B05");
    expect(after.version).toBe(before.version + 1);

    await expect(
      updateBranding(db, actorInA(), {
        version: before.version, // stale
        legalName: "Stale Write Ltd",
      }),
    ).rejects.toThrow(ConflictError);

    const [audit] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "branding.updated"));
    expect(audit).toBeDefined();
    expect(audit.organizationId).toBe(fx.orgA);
  });

  it("rejects bad accent colors and non-members", async () => {
    const b = await getBranding(db, fx.orgA);
    await expect(
      updateBranding(db, actorInA(), { version: b.version, accentColor: "green" }),
    ).rejects.toThrow(/hex color/i);
    await expect(
      updateBranding(db, bobInA(), { version: b.version, legalName: "Hostile" }),
    ).rejects.toThrow(PermissionError);
  });

  it("uploads a logo, replaces the old object, audits the change", async () => {
    const { objects, storage } = memoryStorage();
    const first = await uploadBrandingLogo(
      db,
      actorInA(),
      { bytes: new Uint8Array(100), contentType: "image/png" },
      { storage },
    );
    expect(first.logoKey).toMatch(/^orgs\/.+\/branding\/logo-.+\.png$/);
    expect((await getBranding(db, fx.orgA)).logoKey).toBe(first.logoKey);
    expect(objects.has(first.logoKey)).toBe(true);

    const second = await uploadBrandingLogo(
      db,
      actorInA(),
      { bytes: new Uint8Array(200), contentType: "image/jpeg" },
      { storage },
    );
    expect((await getBranding(db, fx.orgA)).logoKey).toBe(second.logoKey);
    // the replaced object is cleaned up after commit
    expect(objects.has(first.logoKey)).toBe(false);
    expect(objects.has(second.logoKey)).toBe(true);

    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "branding.logo_updated"));
    expect(audits.length).toBe(2);
  });

  it("rejects oversized files, wrong types, and non-members", async () => {
    const { storage } = memoryStorage();
    await expect(
      uploadBrandingLogo(
        db,
        actorInA(),
        { bytes: new Uint8Array(600 * 1024), contentType: "image/png" },
        { storage },
      ),
    ).rejects.toThrow(ValidationError);
    await expect(
      uploadBrandingLogo(
        db,
        actorInA(),
        { bytes: new Uint8Array(10), contentType: "image/svg+xml" },
        { storage },
      ),
    ).rejects.toThrow(ValidationError);
    await expect(
      uploadBrandingLogo(
        db,
        bobInA(),
        { bytes: new Uint8Array(10), contentType: "image/png" },
        { storage },
      ),
    ).rejects.toThrow(PermissionError);
  });
});
