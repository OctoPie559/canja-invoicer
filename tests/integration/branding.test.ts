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
  updatePdfTemplate,
  uploadBrandingLogo,
} from "@/lib/services/branding";
import { EntitlementError } from "@/lib/domain/errors";
import {
  createInvoiceDraft,
  getInvoice,
  getInvoicePdfData,
  issueInvoice,
} from "@/lib/services/invoices";
import { createCustomer } from "@/lib/services/customers";
import { createTestDb } from "../helpers/db";
import {
  createTwoOrgFixture,
  setPlan,
  upgradeToPro,
  type TwoOrgFixture,
} from "../helpers/fixtures";

function fakePng(size = 100): Uint8Array {
  const b = new Uint8Array(size);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return b;
}
function fakeJpeg(size = 100): Uint8Array {
  const b = new Uint8Array(size);
  b.set([0xff, 0xd8, 0xff, 0xe0]);
  return b;
}

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

  it("uploads a logo, keeps superseded objects, audits the change", async () => {
    const { objects, storage } = memoryStorage();
    const first = await uploadBrandingLogo(
      db,
      actorInA(),
      { bytes: fakePng(), contentType: "image/png" },
      { storage },
    );
    expect(first.logoKey).toMatch(/^orgs\/.+\/branding\/logo-.+\.png$/);
    expect((await getBranding(db, fx.orgA)).logoKey).toBe(first.logoKey);
    expect(objects.has(first.logoKey)).toBe(true);

    const second = await uploadBrandingLogo(
      db,
      actorInA(),
      { bytes: fakeJpeg(200), contentType: "image/jpeg" },
      { storage },
    );
    expect((await getBranding(db, fx.orgA)).logoKey).toBe(second.logoKey);
    // the replaced object is NEVER deleted: issued invoices snapshot the
    // key and must render it forever (verifier B2 regression)
    expect(objects.has(first.logoKey)).toBe(true);
    expect(objects.has(second.logoKey)).toBe(true);

    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "branding.logo_updated"));
    expect(audits.length).toBe(2);
  });

  it("PDF templates: pro-gated selection, frozen at issue, downgrade falls back", async () => {
    // free org: classic is fine, pro templates are gated
    let b = await getBranding(db, fx.orgA);
    await updatePdfTemplate(db, actorInA(), { template: "classic" });
    await expect(
      updatePdfTemplate(db, actorInA(), { template: "bold" }),
    ).rejects.toThrow(EntitlementError);
    await expect(
      updatePdfTemplate(db, actorInA(), { template: "fancy-nonsense" }),
    ).rejects.toThrow(/Unknown PDF template/);

    // pro org selects bold; issued documents freeze it
    await upgradeToPro(db, fx.orgA);
    await updatePdfTemplate(db, actorInA(), { template: "bold" });
    b = await getBranding(db, fx.orgA);
    expect(b.pdfTemplate).toBe("bold");

    const { customerId } = await createCustomer(db, actorInA(), {
      name: "Tmpl Customer",
    });
    const issueOne = async () => {
      const { invoiceId } = await createInvoiceDraft(db, actorInA(), {
        customerId,
        currency: "KES",
        lines: [
          { description: "W", quantity: "1", unitPrice: "100.00", discountBps: 0, taxRateBps: 0 },
        ],
      });
      const d = await getInvoice(db, fx.orgA, invoiceId);
      await issueInvoice(db, actorInA(), {
        id: invoiceId,
        version: d!.version,
        issueDate: "2026-07-07",
        dueDate: "2026-08-06",
      });
      return invoiceId;
    };

    const boldInvoice = await issueOne();
    expect((await getInvoicePdfData(db, fx.orgA, boldInvoice))!.template).toBe("bold");

    // downgrade: NEW documents fall back to classic; the issued one keeps bold
    await setPlan(db, fx.orgA, "free");
    const afterDowngrade = await issueOne();
    expect((await getInvoicePdfData(db, fx.orgA, afterDowngrade))!.template).toBe("classic");
    expect((await getInvoicePdfData(db, fx.orgA, boldInvoice))!.template).toBe("bold");
  });

  it("rejects oversized files, wrong types, and non-members", async () => {
    const { storage } = memoryStorage();
    await expect(
      uploadBrandingLogo(
        db,
        actorInA(),
        { bytes: fakePng(600 * 1024), contentType: "image/png" },
        { storage },
      ),
    ).rejects.toThrow(ValidationError);
    await expect(
      uploadBrandingLogo(
        db,
        actorInA(),
        { bytes: fakePng(10), contentType: "image/svg+xml" },
        { storage },
      ),
    ).rejects.toThrow(ValidationError);
    // declared PNG but the bytes are not a PNG
    await expect(
      uploadBrandingLogo(
        db,
        actorInA(),
        { bytes: new Uint8Array(64), contentType: "image/png" },
        { storage },
      ),
    ).rejects.toThrow(/does not match/);
    await expect(
      uploadBrandingLogo(
        db,
        bobInA(),
        { bytes: fakePng(10), contentType: "image/png" },
        { storage },
      ),
    ).rejects.toThrow(PermissionError);
  });
});
