"use server";

import { redirect } from "next/navigation";
import { runWithActor } from "@/lib/audit/context";
import { getDb } from "@/lib/db/client";
import { DomainError } from "@/lib/domain/errors";
import { ZodError } from "zod";
import {
  createInvoiceDraft,
  deleteInvoiceDraft,
  issueInvoice,
  updateInvoiceDraft,
  voidInvoice,
} from "@/lib/services/invoices";
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

/**
 * Line items travel as a JSON string field (the pattern the customer form
 * set for structured arrays); the service's Zod schema is the authority on
 * their shape — this only turns the string into a value.
 */
function draftFields(formData: FormData) {
  let lines: unknown = [];
  const raw = String(formData.get("lines") ?? "");
  if (raw) {
    try {
      lines = JSON.parse(raw);
    } catch {
      lines = [];
    }
  }
  return {
    customerId: String(formData.get("customerId") ?? ""),
    currency: String(formData.get("currency") ?? "KES") as never,
    issueDate: String(formData.get("issueDate") ?? ""),
    dueDate: String(formData.get("dueDate") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    terms: String(formData.get("terms") ?? ""),
    lines: lines as never,
  };
}

export async function createInvoiceDraftAction(
  organizationId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  let invoiceId: string;
  try {
    const result = await runWithActor(ctx, () =>
      createInvoiceDraft(getDb(), ctx, draftFields(formData)),
    );
    invoiceId = result.invoiceId;
  } catch (error) {
    return mapError(error);
  }
  redirect(`/orgs/${organizationId}/invoices/${invoiceId}`);
}

export async function updateInvoiceDraftAction(
  organizationId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  const id = String(formData.get("id") ?? "");
  try {
    await runWithActor(ctx, () =>
      updateInvoiceDraft(getDb(), ctx, {
        id,
        version: Number(formData.get("version") ?? 0),
        ...draftFields(formData),
      }),
    );
  } catch (error) {
    return mapError(error);
  }
  redirect(`/orgs/${organizationId}/invoices/${id}`);
}

export async function deleteInvoiceDraftAction(
  organizationId: string,
  invoiceId: string,
  version: number,
): Promise<ActionState> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  try {
    await runWithActor(ctx, () =>
      deleteInvoiceDraft(getDb(), ctx, { id: invoiceId, version }),
    );
  } catch (error) {
    return mapError(error);
  }
  redirect(`/orgs/${organizationId}/invoices`);
}

export async function issueInvoiceAction(
  organizationId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  const id = String(formData.get("id") ?? "");
  try {
    await runWithActor(ctx, () =>
      issueInvoice(getDb(), ctx, {
        id,
        version: Number(formData.get("version") ?? 0),
        issueDate: String(formData.get("issueDate") ?? ""),
        dueDate: String(formData.get("dueDate") ?? ""),
        fxRateToBase: String(formData.get("fxRateToBase") ?? ""),
      }),
    );
  } catch (error) {
    return mapError(error);
  }
  redirect(`/orgs/${organizationId}/invoices/${id}`);
}

export async function voidInvoiceAction(
  organizationId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  const id = String(formData.get("id") ?? "");
  try {
    await runWithActor(ctx, () =>
      voidInvoice(getDb(), ctx, {
        id,
        reason: String(formData.get("reason") ?? ""),
      }),
    );
  } catch (error) {
    return mapError(error);
  }
  redirect(`/orgs/${organizationId}/invoices/${id}`);
}
