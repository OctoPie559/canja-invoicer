import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { getPaymentProvider } from "@/lib/payments";
import {
  getReturnDestination,
  verifyAndProcessCharge,
} from "@/lib/services/checkout";
import { notifySettlement } from "@/lib/email/settlement";

/**
 * Checkout-return handler: where the provider redirects the payer's browser
 * after payment. It verifies the charge with the provider (idempotent with the
 * webhook — whichever settles first wins) and redirects to the right page with
 * state already updated, so the plan/invoice reflects the payment immediately
 * even if the webhook is delayed or, in local dev, cannot reach us.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const reference =
    url.searchParams.get("reference") ?? url.searchParams.get("trxref");
  if (!reference) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const provider = getPaymentProvider();
  if (provider) {
    // best-effort: if verification hiccups, the webhook remains the backstop —
    // we still send the payer to their page, which reads live state
    const result = await verifyAndProcessCharge(getDb(), provider, reference, {
      ip: request.headers.get("x-forwarded-for") ?? undefined,
      userAgent: request.headers.get("user-agent") ?? undefined,
    }).catch(() => null);
    if (result?.reference) {
      await notifySettlement(getDb(), result.reference, result.reason).catch(
        () => {},
      );
    }
  }

  const dest = await getReturnDestination(getDb(), reference);
  return NextResponse.redirect(new URL(dest, request.url));
}
