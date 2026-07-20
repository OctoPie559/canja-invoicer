import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { getPaymentProvider } from "@/lib/payments";
import { proPrice } from "@/lib/authz/plan-pricing";
import {
  ownerEmail,
  reconcilePendingIntents,
  remindDueManualSubscriptions,
  renewDueSubscriptions,
} from "@/lib/services/checkout";
import { expireLapsedSubscriptions } from "@/lib/services/subscriptions";
import {
  sendDunningNotice,
  sendRenewalReceipt,
  sendRenewalReminder,
  sendSubscriptionEnded,
} from "@/lib/email/subscription-notify";

/**
 * Daily billing cron (Vercel Cron, authenticated by CRON_SECRET). Order matters:
 * renew due card subscriptions and send M-Pesa reminders BEFORE sweeping intents
 * and downgrading lapsed plans, so a fresh renewal extends the period before the
 * expiry check sees it. Subscription emails are best-effort and never block.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  const authorized =
    Boolean(secret) &&
    header.byteLength === expected.byteLength &&
    timingSafeEqual(header, expected);
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const now = new Date();

  // 1. card auto-renewals (self-managed) + dunning notices
  let renewed = 0;
  const provider = getPaymentProvider();
  if (provider) {
    const res = await renewDueSubscriptions(db, provider, now);
    renewed = res.renewed;
    for (const r of res.results) {
      if (r.outcome === "dunning") {
        await sendDunningNotice(r.email, {
          organizationId: r.organizationId,
          retryUntil: (r.retryUntil ?? now).toISOString().slice(0, 10),
        });
      } else {
        await sendRenewalReceipt(r.email, {
          organizationId: r.organizationId,
          amountLabel: r.amountLabel ?? "",
          nextRenewalOn: r.nextRenewalOn,
        });
      }
    }
  }

  // 2. M-Pesa (manual) renewal reminders — once per period
  const reminders = await remindDueManualSubscriptions(db, now);
  for (const r of reminders) {
    await sendRenewalReminder(r.email, {
      organizationId: r.organizationId,
      expiresOn: r.expiresOn,
      priceLabel: proPrice(r.interval).toString(),
    });
  }

  // 3. sweep abandoned intents, then downgrade lapsed plans (grace-aware)
  const { swept } = await reconcilePendingIntents(db, now);
  const { downgraded, endedOrganizationIds } = await expireLapsedSubscriptions(
    db,
    now,
  );
  for (const organizationId of endedOrganizationIds) {
    const email = await ownerEmail(db, organizationId);
    if (email) await sendSubscriptionEnded(email, { organizationId });
  }

  return NextResponse.json({
    ok: true,
    renewed,
    reminded: reminders.length,
    swept,
    downgraded,
  });
}
