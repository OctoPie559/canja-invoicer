import { and, asc, eq, isNull } from "drizzle-orm";
import type { Database, Transaction } from "@/lib/db/client";
import { withOrgTransaction } from "@/lib/db/tx";
import {
  organizationSettings,
  taxRates,
  taxRateVersions,
} from "@/lib/db/schema";
import { newId } from "@/lib/domain/ids";
import {
  ConflictError,
  NotFoundError,
  PermissionError,
  ValidationError,
} from "@/lib/domain/errors";
import { writeAudit } from "@/lib/audit/write";
import { changedFields, jsonSafe } from "@/lib/audit/diff";
import type { ActorContext } from "@/lib/audit/context";
import { authorize } from "@/lib/authz/permissions";
import { getMembership } from "./organizations";
import {
  createTaxRateSchema,
  deleteTaxRateSchema,
  updateTaxRateSchema,
  updateInvoiceDefaultsSchema,
  updateInvoiceNumberingSchema,
  updatePaymentTermsDefaultSchema,
  type CreateTaxRateInput,
  type DeleteTaxRateInput,
  type UpdateTaxRateInput,
  type UpdateInvoiceDefaultsInput,
  type UpdateInvoiceNumberingInput,
  type UpdatePaymentTermsDefaultInput,
} from "@/lib/validation/settings";

/**
 * Org-level invoicing settings: named tax rates (stored as basis points,
 * copied onto lines at edit time so later edits never rewrite history) and
 * display-number configuration. Same mutation pipeline as everything else.
 */

export interface InvoiceSettings {
  baseCurrency: string;
  invoicePrefix: string;
  invoiceNextNumber: number;
  defaultPaymentTermsDays: number;
  defaultTaxRateId: string | null;
  defaultInvoiceNotes: string | null;
  defaultInvoiceTerms: string | null;
  version: number;
}

export async function getInvoiceSettings(
  db: Database,
  organizationId: string,
): Promise<InvoiceSettings> {
  const [row] = await db
    .select({
      baseCurrency: organizationSettings.baseCurrency,
      invoicePrefix: organizationSettings.invoicePrefix,
      invoiceNextNumber: organizationSettings.invoiceNextNumber,
      defaultPaymentTermsDays: organizationSettings.defaultPaymentTermsDays,
      defaultTaxRateId: organizationSettings.defaultTaxRateId,
      defaultInvoiceNotes: organizationSettings.defaultInvoiceNotes,
      defaultInvoiceTerms: organizationSettings.defaultInvoiceTerms,
      version: organizationSettings.version,
    })
    .from(organizationSettings)
    .where(eq(organizationSettings.organizationId, organizationId))
    .limit(1);
  if (!row) throw new NotFoundError("Organization settings");
  return row;
}

export interface TaxRateRow {
  id: string;
  name: string;
  rateBps: number;
  version: number;
}

export async function listTaxRates(
  db: Database,
  organizationId: string,
): Promise<TaxRateRow[]> {
  return db
    .select({
      id: taxRates.id,
      name: taxRates.name,
      rateBps: taxRates.rateBps,
      version: taxRates.version,
    })
    .from(taxRates)
    .where(
      and(eq(taxRates.organizationId, organizationId), isNull(taxRates.deletedAt)),
    )
    .orderBy(asc(taxRates.rateBps), asc(taxRates.name));
}

export async function createTaxRate(
  db: Database,
  ctx: ActorContext,
  input: CreateTaxRateInput,
): Promise<{ taxRateId: string }> {
  const data = createTaxRateSchema.parse(input);
  if (!ctx.actorId) throw new PermissionError("tax_rate.manage");
  const taxRateId = newId();

  await withOrgTransaction(db, ctx.organizationId, async (tx) => {
    const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
    authorize(caller.role, "tax_rate.manage");

    await tx.insert(taxRates).values({
      id: taxRateId,
      organizationId: ctx.organizationId,
      name: data.name,
      rateBps: data.rateBps,
    });
    const [row] = await tx.select().from(taxRates).where(eq(taxRates.id, taxRateId));
    await tx.insert(taxRateVersions).values({
      id: newId(),
      organizationId: ctx.organizationId,
      taxRateId,
      version: row.version,
      data: jsonSafe(row),
      changedBy: ctx.actorId,
    });
    await writeAudit(tx, ctx, {
      action: "tax_rate.created",
      entityType: "tax_rate",
      entityId: taxRateId,
      changes: { after: { name: data.name, rateBps: data.rateBps } },
    });
  });
  return { taxRateId };
}

async function lockTaxRate(
  tx: Transaction,
  organizationId: string,
  id: string,
  version: number,
) {
  const [row] = await tx
    .select()
    .from(taxRates)
    .where(
      and(
        eq(taxRates.id, id),
        eq(taxRates.organizationId, organizationId),
        isNull(taxRates.deletedAt),
      ),
    )
    .for("update");
  if (!row) throw new NotFoundError("Tax rate");
  if (row.version !== version) throw new ConflictError("Tax rate");
  return row;
}

export async function updateTaxRate(
  db: Database,
  ctx: ActorContext,
  input: UpdateTaxRateInput,
): Promise<void> {
  const data = updateTaxRateSchema.parse(input);
  if (!ctx.actorId) throw new PermissionError("tax_rate.manage");

  await withOrgTransaction(db, ctx.organizationId, async (tx) => {
    const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
    authorize(caller.role, "tax_rate.manage");
    const before = await lockTaxRate(tx, ctx.organizationId, data.id, data.version);

    await tx
      .update(taxRates)
      .set({
        name: data.name,
        rateBps: data.rateBps,
        version: before.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(taxRates.id, data.id));
    const [after] = await tx.select().from(taxRates).where(eq(taxRates.id, data.id));
    await tx.insert(taxRateVersions).values({
      id: newId(),
      organizationId: ctx.organizationId,
      taxRateId: data.id,
      version: after.version,
      data: jsonSafe(after),
      changedBy: ctx.actorId,
    });
    await writeAudit(tx, ctx, {
      action: "tax_rate.updated",
      entityType: "tax_rate",
      entityId: data.id,
      changes: changedFields(before, after, ["name", "rateBps"]),
    });
  });
}

export async function deleteTaxRate(
  db: Database,
  ctx: ActorContext,
  input: DeleteTaxRateInput,
): Promise<void> {
  const data = deleteTaxRateSchema.parse(input);
  if (!ctx.actorId) throw new PermissionError("tax_rate.manage");

  await withOrgTransaction(db, ctx.organizationId, async (tx) => {
    const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
    authorize(caller.role, "tax_rate.manage");
    const before = await lockTaxRate(tx, ctx.organizationId, data.id, data.version);

    // clear the org default if it pointed here; lines already carry copied
    // bps values, so history is untouched by design
    await tx
      .update(organizationSettings)
      .set({ defaultTaxRateId: null, updatedAt: new Date() })
      .where(
        and(
          eq(organizationSettings.organizationId, ctx.organizationId),
          eq(organizationSettings.defaultTaxRateId, data.id),
        ),
      );
    await tx
      .update(taxRates)
      .set({ deletedAt: new Date(), version: before.version + 1 })
      .where(eq(taxRates.id, data.id));
    await writeAudit(tx, ctx, {
      action: "tax_rate.deleted",
      entityType: "tax_rate",
      entityId: data.id,
      changes: { before: { name: before.name, rateBps: before.rateBps } },
    });
  });
}

/**
 * Shared pipeline for the org-settings mutations: lock the row, optimistic
 * version check, run the caller's guard, apply the patch, audit only the
 * fields that changed.
 */
async function updateSettingsRow(
  db: Database,
  ctx: ActorContext,
  version: number,
  patch: Partial<typeof organizationSettings.$inferInsert>,
  auditedFields: readonly string[],
  guard?: (before: typeof organizationSettings.$inferSelect) => void,
): Promise<void> {
  if (!ctx.actorId) throw new PermissionError("settings.update");

  await withOrgTransaction(db, ctx.organizationId, async (tx) => {
    const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
    authorize(caller.role, "settings.update");

    const [before] = await tx
      .select()
      .from(organizationSettings)
      .where(eq(organizationSettings.organizationId, ctx.organizationId))
      .for("update");
    if (!before) throw new NotFoundError("Organization settings");
    if (before.version !== version) {
      throw new ConflictError("Organization settings");
    }
    guard?.(before);

    await tx
      .update(organizationSettings)
      .set({ ...patch, version: before.version + 1, updatedAt: new Date() })
      .where(eq(organizationSettings.organizationId, ctx.organizationId));
    const [after] = await tx
      .select()
      .from(organizationSettings)
      .where(eq(organizationSettings.organizationId, ctx.organizationId));
    await writeAudit(tx, ctx, {
      action: "settings.updated",
      entityType: "organization_settings",
      entityId: before.id,
      changes: changedFields(before, after, auditedFields),
    });
  });
}

export async function updateInvoiceNumbering(
  db: Database,
  ctx: ActorContext,
  input: UpdateInvoiceNumberingInput,
): Promise<void> {
  const data = updateInvoiceNumberingSchema.parse(input);
  await updateSettingsRow(
    db,
    ctx,
    data.version,
    {
      invoicePrefix: data.invoicePrefix,
      invoiceNextNumber: data.invoiceNextNumber,
    },
    ["invoicePrefix", "invoiceNextNumber"],
    (before) => {
      // moving the counter backwards would hand out numbers that can collide
      // with already-issued invoices (unique index would then fail an issue)
      if (data.invoiceNextNumber < before.invoiceNextNumber) {
        throw new ValidationError(
          `Next invoice number cannot go below ${before.invoiceNextNumber}`,
        );
      }
    },
  );
}

export async function updatePaymentTermsDefault(
  db: Database,
  ctx: ActorContext,
  input: UpdatePaymentTermsDefaultInput,
): Promise<void> {
  const data = updatePaymentTermsDefaultSchema.parse(input);
  await updateSettingsRow(
    db,
    ctx,
    data.version,
    { defaultPaymentTermsDays: data.defaultPaymentTermsDays },
    ["defaultPaymentTermsDays"],
  );
}

export async function updateInvoiceDefaults(
  db: Database,
  ctx: ActorContext,
  input: UpdateInvoiceDefaultsInput,
): Promise<void> {
  const data = updateInvoiceDefaultsSchema.parse(input);
  await updateSettingsRow(
    db,
    ctx,
    data.version,
    {
      defaultTaxRateId: data.defaultTaxRateId ?? null,
      defaultInvoiceNotes: data.defaultInvoiceNotes ?? null,
      defaultInvoiceTerms: data.defaultInvoiceTerms ?? null,
    },
    ["defaultTaxRateId", "defaultInvoiceNotes", "defaultInvoiceTerms"],
  );
}
