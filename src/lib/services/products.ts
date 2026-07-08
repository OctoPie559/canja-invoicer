import { and, desc, eq, isNull } from "drizzle-orm";
import type { Database, Transaction } from "@/lib/db/client";
import { withOrgTransaction } from "@/lib/db/tx";
import {
  auditLog,
  invoiceLineItems,
  invoices,
  organizationSettings,
  products,
  productVersions,
  subscriptions,
} from "@/lib/db/schema";
import { newId } from "@/lib/domain/ids";
import { Money } from "@/lib/domain/money";
import {
  ConflictError,
  NotFoundError,
  PermissionError,
} from "@/lib/domain/errors";
import { writeAudit } from "@/lib/audit/write";
import { changedFields, jsonSafe } from "@/lib/audit/diff";
import type { ActorContext } from "@/lib/audit/context";
import { authorize } from "@/lib/authz/permissions";
import { requireEntitlement, type Plan } from "@/lib/authz/entitlements";
import { getMembership } from "./organizations";
import type { FileStorage } from "@/lib/storage/port";
import { getFileStorage } from "@/lib/storage/r2";
import { assertImageUpload, imageExtension } from "@/lib/storage/images";
import {
  createProductSchema,
  deleteProductSchema,
  updateProductSchema,
  type CreateProductInput,
  type DeleteProductInput,
  type UpdateProductInput,
} from "@/lib/validation/products";

/**
 * Product catalog (brief §4.1). Prices flow through Money (bigint minor
 * units); version history makes price changes fully reconstructable.
 * Pricing in a currency other than the org base currency is a Pro
 * capability (multiCurrency), checked server-side like every entitlement.
 */

const EDITABLE_FIELDS = [
  "name",
  "productType",
  "description",
  "unitLabel",
  "unitPriceMinor",
  "currency",
  "defaultTaxRateId",
] as const;

async function assertCurrencyAllowed(
  tx: Transaction,
  organizationId: string,
  currency: string,
): Promise<void> {
  const [settings] = await tx
    .select({ baseCurrency: organizationSettings.baseCurrency })
    .from(organizationSettings)
    .where(eq(organizationSettings.organizationId, organizationId))
    .limit(1);
  const base = settings?.baseCurrency ?? "KES";
  if (currency === base) return;
  const [sub] = await tx
    .select({ plan: subscriptions.plan })
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, organizationId))
    .limit(1);
  requireEntitlement((sub?.plan ?? "free") as Plan, "multiCurrency");
}

export async function createProduct(
  db: Database,
  ctx: ActorContext,
  input: CreateProductInput,
): Promise<{ productId: string }> {
  const data = createProductSchema.parse(input);
  if (!ctx.actorId) throw new PermissionError("product.create");
  const price = Money.parse(data.unitPrice, data.currency);
  const productId = newId();

  await withOrgTransaction(db, ctx.organizationId, async (tx) => {
    const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
    authorize(caller.role, "product.create");
    await assertCurrencyAllowed(tx, ctx.organizationId, data.currency);

    await tx.insert(products).values({
      id: productId,
      organizationId: ctx.organizationId,
      name: data.name,
      productType: data.productType,
      description: data.description,
      unitLabel: data.unitLabel,
      unitPriceMinor: price.amountMinor,
      currency: price.currency,
      defaultTaxRateId: data.defaultTaxRateId,
    });
    const [row] = await tx
      .select()
      .from(products)
      .where(eq(products.id, productId));
    await tx.insert(productVersions).values({
      id: newId(),
      organizationId: ctx.organizationId,
      productId,
      version: row.version,
      data: jsonSafe(row),
      changedBy: ctx.actorId,
    });
    await writeAudit(tx, ctx, {
      action: "product.created",
      entityType: "product",
      entityId: productId,
      changes: {
        after: jsonSafe({
          name: data.name,
          unitPriceMinor: price.amountMinor,
          currency: price.currency,
        }),
      },
    });
  });

  return { productId };
}

export async function updateProduct(
  db: Database,
  ctx: ActorContext,
  input: UpdateProductInput,
): Promise<void> {
  const data = updateProductSchema.parse(input);
  if (!ctx.actorId) throw new PermissionError("product.update");
  const price = Money.parse(data.unitPrice, data.currency);

  await withOrgTransaction(db, ctx.organizationId, async (tx) => {
    const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
    authorize(caller.role, "product.update");

    const [current] = await tx
      .select()
      .from(products)
      .where(
        and(
          eq(products.id, data.id),
          eq(products.organizationId, ctx.organizationId),
          isNull(products.deletedAt),
        ),
      )
      .for("update");
    if (!current) throw new NotFoundError("product");
    if (current.version !== data.version) throw new ConflictError("product");

    const next = {
      name: data.name,
      productType: data.productType,
      description: data.description ?? null,
      unitLabel: data.unitLabel ?? null,
      unitPriceMinor: price.amountMinor,
      currency: price.currency,
      defaultTaxRateId: data.defaultTaxRateId ?? null,
    };
    const diff = changedFields(current, next, EDITABLE_FIELDS);
    if (diff.changed.length === 0) return;

    // any price movement on a non-base currency needs the entitlement —
    // otherwise a downgraded org could keep repricing foreign-currency
    // products forever (renames of existing products stay allowed)
    const priceTouched =
      diff.changed.includes("unitPriceMinor") ||
      diff.changed.includes("currency");
    if (priceTouched) {
      await assertCurrencyAllowed(tx, ctx.organizationId, next.currency);
    }

    const nextVersion = current.version + 1;
    await tx
      .update(products)
      .set({ ...next, version: nextVersion, updatedAt: new Date() })
      .where(eq(products.id, data.id));
    const [row] = await tx
      .select()
      .from(products)
      .where(eq(products.id, data.id));
    await tx.insert(productVersions).values({
      id: newId(),
      organizationId: ctx.organizationId,
      productId: data.id,
      version: nextVersion,
      data: jsonSafe(row),
      changedBy: ctx.actorId,
    });
    // price movements are the audit event that matters most on a catalog
    const priceChanged =
      diff.changed.includes("unitPriceMinor") ||
      diff.changed.includes("currency");
    await writeAudit(tx, ctx, {
      action: priceChanged ? "product.price_updated" : "product.updated",
      entityType: "product",
      entityId: data.id,
      changes: { before: diff.before, after: diff.after },
    });
  });
}

export async function deleteProduct(
  db: Database,
  ctx: ActorContext,
  input: DeleteProductInput,
): Promise<void> {
  const data = deleteProductSchema.parse(input);
  if (!ctx.actorId) throw new PermissionError("product.delete");

  await withOrgTransaction(db, ctx.organizationId, async (tx) => {
    const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
    authorize(caller.role, "product.delete");

    const [current] = await tx
      .select()
      .from(products)
      .where(
        and(
          eq(products.id, data.id),
          eq(products.organizationId, ctx.organizationId),
          isNull(products.deletedAt),
        ),
      )
      .for("update");
    if (!current) throw new NotFoundError("product");
    if (current.version !== data.version) throw new ConflictError("product");

    const nextVersion = current.version + 1;
    await tx
      .update(products)
      .set({ deletedAt: new Date(), version: nextVersion, updatedAt: new Date() })
      .where(eq(products.id, data.id));
    const [row] = await tx
      .select()
      .from(products)
      .where(eq(products.id, data.id));
    await tx.insert(productVersions).values({
      id: newId(),
      organizationId: ctx.organizationId,
      productId: data.id,
      version: nextVersion,
      data: jsonSafe(row),
      changedBy: ctx.actorId,
    });
    await writeAudit(tx, ctx, {
      action: "product.deleted",
      entityType: "product",
      entityId: data.id,
      changes: { before: { deletedAt: null }, after: { deletedAt: row.deletedAt } },
    });
  });
}

/**
 * Invoice lines that used this product (Transactions tab) — real query,
 * populated once slice 2 starts writing line items.
 */
export async function getProductTransactions(
  db: Database,
  organizationId: string,
  productId: string,
) {
  return db
    .select({
      id: invoiceLineItems.id,
      invoiceId: invoices.id,
      displayNumber: invoices.displayNumber,
      status: invoices.status,
      issueDate: invoices.issueDate,
      quantity: invoiceLineItems.quantity,
      unitPriceMinor: invoiceLineItems.unitPriceMinor,
      lineTotalMinor: invoiceLineItems.lineTotalMinor,
      currency: invoices.currency,
    })
    .from(invoiceLineItems)
    .innerJoin(invoices, eq(invoices.id, invoiceLineItems.invoiceId))
    .where(
      and(
        eq(invoiceLineItems.organizationId, organizationId),
        eq(invoiceLineItems.productId, productId),
        isNull(invoiceLineItems.deletedAt),
        isNull(invoices.deletedAt),
      ),
    )
    .orderBy(desc(invoices.createdAt));
}

/** Distinct unit labels already used by the org (unit combobox options). */
export async function listUnitLabels(
  db: Database,
  organizationId: string,
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ unitLabel: products.unitLabel })
    .from(products)
    .where(
      and(
        eq(products.organizationId, organizationId),
        isNull(products.deletedAt),
      ),
    );
  return rows
    .map((r) => r.unitLabel)
    .filter((u): u is string => Boolean(u))
    .sort();
}

/** Org-scoped reads. */

export async function listProducts(db: Database, organizationId: string) {
  return db
    .select()
    .from(products)
    .where(
      and(
        eq(products.organizationId, organizationId),
        isNull(products.deletedAt),
      ),
    )
    .orderBy(products.name);
}

export async function getProduct(
  db: Database,
  organizationId: string,
  productId: string,
) {
  const [row] = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.id, productId),
        eq(products.organizationId, organizationId),
        isNull(products.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getProductVersions(
  db: Database,
  organizationId: string,
  productId: string,
) {
  return db
    .select()
    .from(productVersions)
    .where(
      and(
        eq(productVersions.organizationId, organizationId),
        eq(productVersions.productId, productId),
      ),
    )
    .orderBy(desc(productVersions.version));
}

export async function getProductTimeline(
  db: Database,
  organizationId: string,
  productId: string,
  limit = 50,
) {
  return db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      actorType: auditLog.actorType,
      actorId: auditLog.actorId,
      changes: auditLog.changes,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.organizationId, organizationId),
        eq(auditLog.entityType, "product"),
        eq(auditLog.entityId, productId),
      ),
    )
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}

export interface ProductImageDeps {
  storage?: FileStorage;
}

/**
 * Catalog image. Referenced only by the live row (invoice snapshots carry
 * line descriptions, never product images), so the superseded object is
 * deleted after commit — same semantics as contact photos, the opposite of
 * snapshot-referenced branding logos.
 */
export async function uploadProductImage(
  db: Database,
  ctx: ActorContext,
  input: { productId: string; bytes: Uint8Array; contentType: string },
  deps: ProductImageDeps = {},
): Promise<{ imageKey: string }> {
  if (!ctx.actorId) throw new PermissionError("product.update");
  assertImageUpload(input.bytes, input.contentType);
  const storage = deps.storage ?? getFileStorage();
  const imageKey = `orgs/${ctx.organizationId}/products/${input.productId}/image-${newId()}.${imageExtension(input.contentType as never)}`;

  // authorization and existence BEFORE the storage side effect
  await withOrgTransaction(db, ctx.organizationId, async (tx) => {
    const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
    authorize(caller.role, "product.update");
    const [row] = await tx
      .select({ id: products.id })
      .from(products)
      .where(
        and(
          eq(products.id, input.productId),
          eq(products.organizationId, ctx.organizationId),
          isNull(products.deletedAt),
        ),
      )
      .limit(1);
    if (!row) throw new NotFoundError("Product");
  });

  await storage.put({
    key: imageKey,
    body: input.bytes,
    contentType: input.contentType,
  });

  let previousKey: string | null = null;
  try {
    await withOrgTransaction(db, ctx.organizationId, async (tx) => {
      const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
      authorize(caller.role, "product.update");
      const [before] = await tx
        .select()
        .from(products)
        .where(
          and(
            eq(products.id, input.productId),
            eq(products.organizationId, ctx.organizationId),
            isNull(products.deletedAt),
          ),
        )
        .for("update");
      if (!before) throw new NotFoundError("Product");
      previousKey = before.imageKey;

      await tx
        .update(products)
        .set({ imageKey, version: before.version + 1, updatedAt: new Date() })
        .where(eq(products.id, input.productId));
      const [after] = await tx
        .select()
        .from(products)
        .where(eq(products.id, input.productId));
      await tx.insert(productVersions).values({
        id: newId(),
        organizationId: ctx.organizationId,
        productId: input.productId,
        version: after.version,
        data: jsonSafe(after),
        changedBy: ctx.actorId,
      });
      await writeAudit(tx, ctx, {
        action: "product.image_updated",
        entityType: "product",
        entityId: input.productId,
        changes: { before: { imageKey: before.imageKey }, after: { imageKey } },
      });
    });
  } catch (error) {
    await storage.delete(imageKey).catch(() => {});
    throw error;
  }

  if (previousKey) {
    await storage.delete(previousKey).catch(() => {});
  }
  return { imageKey };
}

export async function removeProductImage(
  db: Database,
  ctx: ActorContext,
  input: { productId: string },
  deps: ProductImageDeps = {},
): Promise<void> {
  if (!ctx.actorId) throw new PermissionError("product.update");
  const storage = deps.storage ?? getFileStorage();

  let key: string | null = null;
  await withOrgTransaction(db, ctx.organizationId, async (tx) => {
    const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
    authorize(caller.role, "product.update");
    const [before] = await tx
      .select()
      .from(products)
      .where(
        and(
          eq(products.id, input.productId),
          eq(products.organizationId, ctx.organizationId),
          isNull(products.deletedAt),
        ),
      )
      .for("update");
    if (!before) throw new NotFoundError("Product");
    if (!before.imageKey) return;
    key = before.imageKey;

    await tx
      .update(products)
      .set({ imageKey: null, version: before.version + 1, updatedAt: new Date() })
      .where(eq(products.id, input.productId));
    const [after] = await tx
      .select()
      .from(products)
      .where(eq(products.id, input.productId));
    await tx.insert(productVersions).values({
      id: newId(),
      organizationId: ctx.organizationId,
      productId: input.productId,
      version: after.version,
      data: jsonSafe(after),
      changedBy: ctx.actorId,
    });
    await writeAudit(tx, ctx, {
      action: "product.image_removed",
      entityType: "product",
      entityId: input.productId,
      changes: { before: { imageKey: key }, after: { imageKey: null } },
    });
  });

  if (key) {
    await storage.delete(key).catch(() => {});
  }
}

/** imageKey → public URL; null when storage is not configured. */
export function productImageUrl(
  imageKey: string | null | undefined,
): string | null {
  if (!imageKey) return null;
  try {
    return getFileStorage().publicUrl(imageKey);
  } catch {
    return null;
  }
}
