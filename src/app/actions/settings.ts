"use server";

import { redirect } from "next/navigation";
import { runWithActor } from "@/lib/audit/context";
import { getDb } from "@/lib/db/client";
import { DomainError } from "@/lib/domain/errors";
import { ZodError } from "zod";
import {
  updateDocNumbering,
  createTaxRate,
  deleteTaxRate,
  updateInvoiceDefaults,
  updateInvoiceNumbering,
  updatePaymentTermsDefault,
  updateTaxRate,
} from "@/lib/services/settings";
import { updateOrganizationName } from "@/lib/services/organizations";
import { requireSession, userActor } from "@/lib/transport/session";
import type { ActionState } from "./organizations";

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

export async function createTaxRateAction(
  organizationId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  try {
    await runWithActor(ctx, () =>
      createTaxRate(getDb(), ctx, {
        name: String(formData.get("name") ?? ""),
        rateBps: Number(formData.get("rateBps") ?? 0),
      }),
    );
  } catch (error) {
    return mapError(error);
  }
  redirect(`/orgs/${organizationId}/settings/tax-rates`);
}

export async function updateTaxRateAction(
  organizationId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  try {
    await runWithActor(ctx, () =>
      updateTaxRate(getDb(), ctx, {
        id: String(formData.get("id") ?? ""),
        version: Number(formData.get("version") ?? 0),
        name: String(formData.get("name") ?? ""),
        rateBps: Number(formData.get("rateBps") ?? 0),
      }),
    );
  } catch (error) {
    return mapError(error);
  }
  redirect(`/orgs/${organizationId}/settings/tax-rates`);
}

export async function deleteTaxRateAction(
  organizationId: string,
  taxRateId: string,
  version: number,
): Promise<ActionState> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  try {
    await runWithActor(ctx, () =>
      deleteTaxRate(getDb(), ctx, { id: taxRateId, version }),
    );
  } catch (error) {
    return mapError(error);
  }
  redirect(`/orgs/${organizationId}/settings/tax-rates`);
}

export async function updateInvoiceNumberingAction(
  organizationId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  try {
    await runWithActor(ctx, () =>
      updateInvoiceNumbering(getDb(), ctx, {
        version: Number(formData.get("version") ?? 0),
        invoicePrefix: String(formData.get("invoicePrefix") ?? ""),
        invoiceNextNumber: Number(formData.get("invoiceNextNumber") ?? 1),
      }),
    );
  } catch (error) {
    return mapError(error);
  }
  redirect(`/orgs/${organizationId}/settings/invoices`);
}

export async function updatePaymentTermsDefaultAction(
  organizationId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  try {
    await runWithActor(ctx, () =>
      updatePaymentTermsDefault(getDb(), ctx, {
        version: Number(formData.get("version") ?? 0),
        defaultPaymentTermsDays: Number(
          formData.get("defaultPaymentTermsDays") ?? 30,
        ),
      }),
    );
  } catch (error) {
    return mapError(error);
  }
  redirect(`/orgs/${organizationId}/settings/payment-terms`);
}

export async function updateInvoiceDefaultsAction(
  organizationId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  try {
    await runWithActor(ctx, () =>
      updateInvoiceDefaults(getDb(), ctx, {
        version: Number(formData.get("version") ?? 0),
        defaultTaxRateId: String(formData.get("defaultTaxRateId") ?? ""),
        defaultInvoiceNotes: String(formData.get("defaultInvoiceNotes") ?? ""),
        defaultInvoiceTerms: String(formData.get("defaultInvoiceTerms") ?? ""),
      }),
    );
  } catch (error) {
    return mapError(error);
  }
  redirect(`/orgs/${organizationId}/settings/invoices`);
}

export async function updateOrganizationNameAction(
  organizationId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  try {
    await runWithActor(ctx, () =>
      updateOrganizationName(getDb(), ctx, {
        name: String(formData.get("name") ?? ""),
      }),
    );
  } catch (error) {
    return mapError(error);
  }
  redirect(`/orgs/${organizationId}/settings/profile`);
}

export async function updateDocNumberingAction(
  organizationId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  try {
    await runWithActor(ctx, () =>
      updateDocNumbering(getDb(), ctx, {
        version: Number(formData.get("version") ?? 0),
        doc: String(formData.get("doc") ?? "estimate") as never,
        prefix: String(formData.get("prefix") ?? ""),
        nextNumber: Number(formData.get("nextNumber") ?? 1),
      }),
    );
  } catch (error) {
    return mapError(error);
  }
  redirect(`/orgs/${organizationId}/settings/invoices`);
}
