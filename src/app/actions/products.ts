"use server";

import { redirect } from "next/navigation";
import { runWithActor } from "@/lib/audit/context";
import { getDb } from "@/lib/db/client";
import { DomainError } from "@/lib/domain/errors";
import { ZodError } from "zod";
import {
  createProduct,
  deleteProduct,
  removeProductImage,
  updateProduct,
  uploadProductImage,
} from "@/lib/services/products";
import { StorageNotConfiguredError } from "@/lib/storage/port";
import { revalidatePath } from "next/cache";
import { requireSession, userActor } from "@/lib/transport/session";
import type { ActorContext } from "@/lib/audit/context";
import type { ActionState } from "./organizations";

/** Best-effort image attach (issue 11): a storage hiccup never fails the save;
 *  the product is created/updated regardless and the image is retryable. */
async function attachImage(
  ctx: ActorContext,
  productId: string,
  formData: FormData,
): Promise<void> {
  const image = formData.get("image");
  if (!(image instanceof File) || image.size === 0) return;
  try {
    const bytes = new Uint8Array(await image.arrayBuffer());
    await runWithActor(ctx, () =>
      uploadProductImage(getDb(), ctx, {
        productId,
        bytes,
        contentType: image.type,
      }),
    );
  } catch (err) {
    console.warn("product image upload failed", err);
  }
}

/** Thin wrappers (ARCHITECTURE.md §1.2): auth → ctx → one service → map. */

function mapError(error: unknown): ActionState {
  if (error instanceof ZodError) {
    return { error: error.issues[0]?.message ?? "Invalid input" };
  }
  if (error instanceof DomainError) {
    return { error: error.message };
  }
  throw error;
}

function productFields(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    productType: (formData.get("productType") === "goods"
      ? "goods"
      : "service") as "goods" | "service",
    description: String(formData.get("description") ?? ""),
    unitLabel: String(formData.get("unitLabel") ?? ""),
    unitPrice: String(formData.get("unitPrice") ?? ""),
    currency: String(formData.get("currency") ?? "KES") as never,
    defaultTaxRateId: null,
  };
}

export async function createProductAction(
  organizationId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  let productId: string;
  try {
    const result = await runWithActor(ctx, () =>
      createProduct(getDb(), ctx, productFields(formData)),
    );
    productId = result.productId;
  } catch (error) {
    return mapError(error);
  }
  await attachImage(ctx, productId, formData);
  redirect(`/orgs/${organizationId}/products/${productId}`);
}

/**
 * Inline creation from inside another form (e.g. the invoice builder):
 * same service — same validation, permission check, and audit row — but
 * returns the created product for the caller to drop into a line item
 * instead of redirecting away from the half-built document.
 */
export async function createProductInlineAction(
  organizationId: string,
  formData: FormData,
): Promise<
  | { error: string }
  | {
      product: {
        id: string;
        name: string;
        unitPrice: string;
        currency: string;
        defaultTaxRateBps: number | null;
      };
    }
> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  try {
    const fields = productFields(formData);
    const { productId } = await runWithActor(ctx, () =>
      createProduct(getDb(), ctx, fields),
    );
    await attachImage(ctx, productId, formData);
    return {
      product: {
        id: productId,
        name: fields.name.trim(),
        unitPrice: fields.unitPrice,
        currency: fields.currency,
        // the quick form doesn't pick a tax rate; lines keep the org default
        defaultTaxRateBps: null,
      },
    };
  } catch (error) {
    return { error: mapError(error).error ?? "Something went wrong" };
  }
}

export async function updateProductAction(
  organizationId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  const id = String(formData.get("id") ?? "");
  try {
    await runWithActor(ctx, () =>
      updateProduct(getDb(), ctx, {
        id,
        version: Number(formData.get("version") ?? 0),
        ...productFields(formData),
      }),
    );
  } catch (error) {
    return mapError(error);
  }
  await attachImage(ctx, id, formData);
  redirect(`/orgs/${organizationId}/products/${id}`);
}

export async function deleteProductAction(
  organizationId: string,
  productId: string,
  version: number,
): Promise<ActionState> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  try {
    await runWithActor(ctx, () =>
      deleteProduct(getDb(), ctx, { id: productId, version }),
    );
  } catch (error) {
    return mapError(error);
  }
  redirect(`/orgs/${organizationId}/products`);
}

export async function uploadProductImageAction(
  organizationId: string,
  productId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an image file" };
  }
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    await runWithActor(ctx, () =>
      uploadProductImage(getDb(), ctx, {
        productId,
        bytes,
        contentType: file.type,
      }),
    );
  } catch (error) {
    if (error instanceof StorageNotConfiguredError) {
      return { error: "File storage is not configured in this environment" };
    }
    return mapError(error);
  }
  revalidatePath(`/orgs/${organizationId}/products/${productId}`);
  return { error: null };
}

export async function removeProductImageAction(
  organizationId: string,
  productId: string,
): Promise<ActionState> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  try {
    await runWithActor(ctx, () =>
      removeProductImage(getDb(), ctx, { productId }),
    );
  } catch (error) {
    if (error instanceof StorageNotConfiguredError) {
      return { error: "File storage is not configured in this environment" };
    }
    return mapError(error);
  }
  revalidatePath(`/orgs/${organizationId}/products/${productId}`);
  return { error: null };
}
