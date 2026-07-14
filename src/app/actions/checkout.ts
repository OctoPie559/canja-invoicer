"use server";

import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { runWithActor } from "@/lib/audit/context";
import { getDb } from "@/lib/db/client";
import { appBaseUrl } from "@/lib/config";
import { DomainError } from "@/lib/domain/errors";
import { getPaymentProvider } from "@/lib/payments";
import type { BillingInterval } from "@/lib/authz/plan-pricing";
import {
  initiateInvoiceCharge,
  initiateSubscriptionCharge,
} from "@/lib/services/checkout";
import { requestMeta, requireSession, userActor } from "@/lib/transport/session";
import type { ActionState } from "./organizations";

/** Thin wrappers (ARCHITECTURE.md §1.2): auth → ctx → one service → redirect. */

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
 * Public: start a charge for an invoice via its hosted link (no session — the
 * token is the capability). Redirects the payer to the provider checkout.
 */
export async function startInvoiceCheckoutAction(
  token: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const provider = getPaymentProvider();
  if (!provider) {
    return { error: "Online payment is not available right now" };
  }
  let url: string;
  try {
    const result = await initiateInvoiceCharge(getDb(), provider, {
      token,
      email: String(formData.get("email") ?? "") || null,
      baseUrl: appBaseUrl(),
      meta: await requestMeta(),
    });
    url = result.authorizationUrl;
  } catch (error) {
    return mapError(error);
  }
  redirect(url);
}

/** Owner: start a Pro self-billing charge. Redirects to provider checkout. */
export async function startSubscriptionCheckoutAction(
  organizationId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const provider = getPaymentProvider();
  if (!provider) {
    return { error: "Online payment is not available right now" };
  }
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  let url: string;
  try {
    const result = await runWithActor(ctx, () =>
      initiateSubscriptionCharge(
        getDb(),
        provider,
        ctx,
        {
          interval: (String(formData.get("interval") ?? "monthly") ||
            "monthly") as BillingInterval,
        },
        { baseUrl: appBaseUrl() },
      ),
    );
    url = result.authorizationUrl;
  } catch (error) {
    return mapError(error);
  }
  redirect(url);
}
