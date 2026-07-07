"use server";

import { redirect } from "next/navigation";
import { runWithActor } from "@/lib/audit/context";
import { getDb } from "@/lib/db/client";
import { DomainError } from "@/lib/domain/errors";
import { StorageNotConfiguredError } from "@/lib/storage/port";
import { ZodError } from "zod";
import { updateBranding, uploadBrandingLogo } from "@/lib/services/branding";
import { requireSession, userActor } from "@/lib/transport/session";
import type { ActionState } from "./organizations";

/** Thin wrappers (ARCHITECTURE.md §1.2): auth → ctx → one service → map. */

function mapError(error: unknown): ActionState {
  if (error instanceof ZodError) {
    return { error: error.issues[0]?.message ?? "Invalid input" };
  }
  if (error instanceof StorageNotConfiguredError) {
    return {
      error:
        "File storage is not configured yet — set the R2 environment variables first",
    };
  }
  if (error instanceof DomainError) {
    return { error: error.message };
  }
  throw error;
}

export async function updateBrandingAction(
  organizationId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  try {
    await runWithActor(ctx, () =>
      updateBranding(getDb(), ctx, {
        version: Number(formData.get("version") ?? 0),
        legalName: String(formData.get("legalName") ?? ""),
        addressLine1: String(formData.get("addressLine1") ?? ""),
        addressLine2: String(formData.get("addressLine2") ?? ""),
        city: String(formData.get("city") ?? ""),
        country: String(formData.get("country") ?? ""),
        kraPin: String(formData.get("kraPin") ?? ""),
        contactEmail: String(formData.get("contactEmail") ?? ""),
        contactPhone: String(formData.get("contactPhone") ?? ""),
        accentColor: String(formData.get("accentColor") ?? ""),
      }),
    );
  } catch (error) {
    return mapError(error);
  }
  redirect(`/orgs/${organizationId}/settings/branding`);
}

export async function uploadLogoAction(
  organizationId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an image file" };
  }
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    await runWithActor(ctx, () =>
      uploadBrandingLogo(getDb(), ctx, {
        bytes,
        contentType: file.type,
      }),
    );
  } catch (error) {
    return mapError(error);
  }
  redirect(`/orgs/${organizationId}/settings/branding`);
}
