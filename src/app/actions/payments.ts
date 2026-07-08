"use server";

import { redirect } from "next/navigation";
import { runWithActor } from "@/lib/audit/context";
import { getDb } from "@/lib/db/client";
import { DomainError } from "@/lib/domain/errors";
import { ZodError } from "zod";
import { recordPayment } from "@/lib/services/payments";
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

export async function recordPaymentAction(
  organizationId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  const invoiceId = String(formData.get("invoiceId") ?? "");
  try {
    await runWithActor(ctx, () =>
      recordPayment(getDb(), ctx, {
        invoiceId,
        amount: String(formData.get("amount") ?? ""),
        currency: String(formData.get("currency") ?? "KES") as never,
        fxRateUsed: String(formData.get("fxRateUsed") ?? ""),
        method: String(formData.get("method") ?? "mpesa") as never,
        paidAt: String(formData.get("paidAt") ?? ""),
        reference: String(formData.get("reference") ?? ""),
        notes: String(formData.get("notes") ?? ""),
      }),
    );
  } catch (error) {
    return mapError(error);
  }
  redirect(`/orgs/${organizationId}/invoices/${invoiceId}`);
}
