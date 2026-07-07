import { eq } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import { withOrgTransaction } from "@/lib/db/tx";
import { organizationBranding } from "@/lib/db/schema";
import { newId } from "@/lib/domain/ids";
import {
  ConflictError,
  NotFoundError,
  PermissionError,
  ValidationError,
} from "@/lib/domain/errors";
import { writeAudit } from "@/lib/audit/write";
import { changedFields } from "@/lib/audit/diff";
import type { ActorContext } from "@/lib/audit/context";
import { authorize } from "@/lib/authz/permissions";
import type { FileStorage } from "@/lib/storage/port";
import { getFileStorage } from "@/lib/storage/r2";
import {
  LOGO_CONTENT_TYPES,
  LOGO_MAX_BYTES,
  updateBrandingSchema,
  type UpdateBrandingInput,
} from "@/lib/validation/branding";
import { getMembership } from "./organizations";

/**
 * Branding management (brief §109): business details, accent color, and
 * the logo applied to invoices, emails, and the hosted view. Issued
 * documents snapshot branding at issue — edits here only affect future
 * documents (§5.3).
 */

const BRANDED_FIELDS = [
  "legalName",
  "addressLine1",
  "addressLine2",
  "city",
  "country",
  "kraPin",
  "contactEmail",
  "contactPhone",
  "accentColor",
] as const;

export async function getBranding(db: Database, organizationId: string) {
  const [row] = await db
    .select()
    .from(organizationBranding)
    .where(eq(organizationBranding.organizationId, organizationId))
    .limit(1);
  if (!row) throw new NotFoundError("Organization branding");
  return row;
}

export async function updateBranding(
  db: Database,
  ctx: ActorContext,
  input: UpdateBrandingInput,
): Promise<void> {
  const data = updateBrandingSchema.parse(input);
  if (!ctx.actorId) throw new PermissionError("branding.update");

  await withOrgTransaction(db, ctx.organizationId, async (tx) => {
    const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
    authorize(caller.role, "branding.update");

    const [before] = await tx
      .select()
      .from(organizationBranding)
      .where(eq(organizationBranding.organizationId, ctx.organizationId))
      .for("update");
    if (!before) throw new NotFoundError("Organization branding");
    if (before.version !== data.version) {
      throw new ConflictError("Organization branding");
    }

    const fields = {
      legalName: data.legalName ?? null,
      addressLine1: data.addressLine1 ?? null,
      addressLine2: data.addressLine2 ?? null,
      city: data.city ?? null,
      country: data.country ?? null,
      kraPin: data.kraPin ?? null,
      contactEmail: data.contactEmail ?? null,
      contactPhone: data.contactPhone ?? null,
      accentColor: data.accentColor ?? null,
    };
    await tx
      .update(organizationBranding)
      .set({ ...fields, version: before.version + 1, updatedAt: new Date() })
      .where(eq(organizationBranding.organizationId, ctx.organizationId));
    const [after] = await tx
      .select()
      .from(organizationBranding)
      .where(eq(organizationBranding.organizationId, ctx.organizationId));
    // NOTE: changedFields carries the phone VALUE into the audit trail by
    // design (trails are for dispute resolution, §7); masking applies to
    // logs and error reports, which never see this object.
    await writeAudit(tx, ctx, {
      action: "branding.updated",
      entityType: "organization_branding",
      entityId: before.id,
      changes: changedFields(before, after, BRANDED_FIELDS),
    });
  });
}

export interface UploadLogoDeps {
  storage?: FileStorage;
}

/**
 * Stores the logo in R2 under a content-unique key and records it on the
 * branding row in the same transaction that audits the change. Superseded
 * objects are never deleted: issued invoices snapshot logoKey and must
 * render it forever (§5.3).
 */
export async function uploadBrandingLogo(
  db: Database,
  ctx: ActorContext,
  input: { bytes: Uint8Array; contentType: string },
  deps: UploadLogoDeps = {},
): Promise<{ logoKey: string }> {
  if (!ctx.actorId) throw new PermissionError("branding.update");
  if (!(LOGO_CONTENT_TYPES as readonly string[]).includes(input.contentType)) {
    throw new ValidationError("Logo must be a PNG or JPEG image");
  }
  if (input.bytes.byteLength === 0 || input.bytes.byteLength > LOGO_MAX_BYTES) {
    throw new ValidationError("Logo must be between 1 byte and 512 KB");
  }
  // the object lands on a PUBLIC bucket — verify the bytes match the
  // declared type instead of trusting the client's content type
  const b = input.bytes;
  const isPng =
    b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  const isJpeg = b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (
    (input.contentType === "image/png" && !isPng) ||
    (input.contentType === "image/jpeg" && !isJpeg)
  ) {
    throw new ValidationError("File content does not match the image type");
  }
  const storage = deps.storage ?? getFileStorage();
  const ext = input.contentType === "image/png" ? "png" : "jpg";
  const logoKey = `orgs/${ctx.organizationId}/branding/logo-${newId()}.${ext}`;

  // authorization comes BEFORE any side effect: an unauthorized caller
  // must never place bytes in the org's public prefix
  await withOrgTransaction(db, ctx.organizationId, async (tx) => {
    const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
    authorize(caller.role, "branding.update");
  });

  await storage.put({
    key: logoKey,
    body: input.bytes,
    contentType: input.contentType,
  });

  try {
    await withOrgTransaction(db, ctx.organizationId, async (tx) => {
      // re-checked inside the recording transaction (role could have
      // changed between the pre-check and now)
      const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
      authorize(caller.role, "branding.update");
      const [before] = await tx
        .select()
        .from(organizationBranding)
        .where(eq(organizationBranding.organizationId, ctx.organizationId))
        .for("update");
      if (!before) throw new NotFoundError("Organization branding");
      await tx
        .update(organizationBranding)
        .set({ logoKey, version: before.version + 1, updatedAt: new Date() })
        .where(eq(organizationBranding.organizationId, ctx.organizationId));
      await writeAudit(tx, ctx, {
        action: "branding.logo_updated",
        entityType: "organization_branding",
        entityId: before.id,
        changes: { before: { logoKey: before.logoKey }, after: { logoKey } },
      });
    });
  } catch (error) {
    // the record never landed — remove the just-uploaded object
    await storage.delete(logoKey).catch(() => {});
    throw error;
  }

  // the PREVIOUS object is deliberately never deleted: issued invoices
  // snapshot logoKey and render it forever (§5.3) — destroying the object
  // would break every historical document. Keys are content-unique, so
  // superseded logos are just cold storage.
  return { logoKey };
}
