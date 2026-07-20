import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { getPaymentProvider } from "@/lib/payments";
import { processProviderEvent } from "@/lib/services/checkout";
import { notifySettlement } from "@/lib/email/settlement";

/**
 * Paystack webhook (ARCHITECTURE.md §6). Verifies the HMAC signature over the
 * RAW body, persists the payload, and settles idempotently — duplicates and
 * out-of-order callbacks are provable no-ops. A verified-but-already-processed
 * or unmatched event returns 200 so the provider stops retrying; only a bad
 * signature returns 401.
 */
export async function POST(request: Request) {
  const provider = getPaymentProvider();
  if (!provider) {
    return NextResponse.json(
      { error: "Payments not configured" },
      { status: 503 },
    );
  }

  // the signature is computed over the exact bytes — never a re-serialized JSON
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");

  const result = await processProviderEvent(getDb(), provider, rawBody, signature, {
    ip: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 401 });
  }
  // best-effort confirmation email; never blocks the 200 the provider needs
  if (result.reference) {
    await notifySettlement(getDb(), result.reference, result.reason).catch(
      () => {},
    );
  }
  return NextResponse.json({ ok: true, reason: result.reason });
}
