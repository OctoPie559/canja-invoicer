import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import {
  customerContacts,
  invoices,
  organization,
  paymentIntents,
  payments,
  user,
} from "@/lib/db/schema";
import { Money } from "@/lib/domain/money";
import {
  billingPeriodEnd,
  proPrice,
  type BillingInterval,
} from "@/lib/authz/plan-pricing";
import { getSubscription } from "@/lib/services/subscriptions";
import { appBaseUrl } from "@/lib/config";
import { getEmailSender, type EmailSender, type EmailMessage } from "./port";

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

type Rendered = Omit<EmailMessage, "to">;

export interface SettlementDeps {
  emailSender?: EmailSender;
  baseUrl?: string;
  /** Injected in tests so the JSX templates (untransformed by vitest) stay out
   *  of the module graph; production defaults dynamic-import the real ones. */
  renderUpgrade?: (p: {
    userName: string;
    planPrice: string;
    cycleLabel: string;
    nextBillingDate: string;
    total: string;
    url: string;
  }) => Promise<Rendered>;
  renderReceipt?: (p: {
    organizationName: string;
    displayNumber: string;
    amountPaid: string;
    balance: string;
    paidDate: string;
    url: string;
  }) => Promise<Rendered>;
}

/**
 * Post-commit settlement emails (issues 4 & 16). Fired from the checkout
 * transport (webhook + return routes) with the reason processEvent returned —
 * NOT from the service, which stays JSX-free like every other email path.
 *
 * Only the caller that actually settles the intent sees "invoice_paid" /
 * "subscription_activated" (dedup lives in processEvent), so this sends
 * exactly once. Everything here is best-effort: a failed read or send never
 * blocks the payer's redirect and never rolls back a recorded payment.
 */
export async function notifySettlement(
  db: Database,
  reference: string,
  reason: string,
  deps: SettlementDeps = {},
): Promise<void> {
  if (reason !== "invoice_paid" && reason !== "subscription_activated") return;

  const [intent] = await db
    .select()
    .from(paymentIntents)
    .where(
      and(
        eq(paymentIntents.reference, reference),
        isNull(paymentIntents.deletedAt),
      ),
    )
    .limit(1);
  if (!intent) return;

  const baseUrl = deps.baseUrl ?? appBaseUrl();
  const sender = deps.emailSender ?? getEmailSender();
  const renderUpgrade =
    deps.renderUpgrade ??
    (async (p) => (await import("./templates")).subscriptionUpgradedEmail(p));
  const renderReceipt =
    deps.renderReceipt ??
    (async (p) => (await import("./templates")).paymentReceiptEmail(p));

  if (reason === "subscription_activated") {
    if (!intent.initiatedBy) return;
    const [u] = await db
      .select({ email: user.email, name: user.name })
      .from(user)
      .where(eq(user.id, intent.initiatedBy))
      .limit(1);
    if (!u?.email) return;

    const interval = (intent.billingInterval as BillingInterval) ?? "monthly";
    const price = proPrice(interval).toString();
    const sub = await getSubscription(db, intent.organizationId);
    const nextBilling =
      sub.currentPeriodEnd ?? billingPeriodEnd(new Date(), interval);
    const message = await renderUpgrade({
      userName: u.name ?? "there",
      planPrice: price,
      cycleLabel: interval === "annual" ? "year" : "month",
      nextBillingDate: isoDate(nextBilling),
      total: price,
      url: `${baseUrl}/orgs/${intent.organizationId}/settings/billing`,
    });
    await sender.send({ to: u.email, ...message });
    return;
  }

  // invoice_paid
  if (!intent.invoiceId) return;
  const [inv] = await db
    .select({
      displayNumber: invoices.displayNumber,
      token: invoices.publicToken,
      currency: invoices.currency,
      totalMinor: invoices.totalMinor,
      amountPaidMinor: invoices.amountPaidMinor,
      customerId: invoices.customerId,
    })
    .from(invoices)
    .where(eq(invoices.id, intent.invoiceId))
    .limit(1);
  if (!inv?.displayNumber) return;

  const [contact] = await db
    .select({ email: customerContacts.email })
    .from(customerContacts)
    .where(
      and(
        eq(customerContacts.customerId, inv.customerId),
        eq(customerContacts.isPrimary, true),
        isNull(customerContacts.deletedAt),
      ),
    )
    .limit(1);
  if (!contact?.email) return;

  // exact amount received this charge (the payment this intent recorded),
  // falling back to the invoice's cumulative paid if the link is missing
  let receivedMinor = inv.amountPaidMinor;
  if (intent.paymentId) {
    const [pay] = await db
      .select({ amountMinor: payments.amountMinor })
      .from(payments)
      .where(eq(payments.id, intent.paymentId))
      .limit(1);
    if (pay) receivedMinor = pay.amountMinor;
  }

  const total = Money.fromMinor(inv.totalMinor, inv.currency);
  const paid = Money.fromMinor(inv.amountPaidMinor, inv.currency);
  const balance = total.subtract(paid);
  const received = Money.fromMinor(receivedMinor, inv.currency);

  const [org] = await db
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, intent.organizationId))
    .limit(1);

  const message = await renderReceipt({
    organizationName: org?.name ?? "Canja",
    displayNumber: inv.displayNumber,
    amountPaid: received.toString(),
    balance: balance.toString(),
    paidDate: isoDate(new Date()),
    url: inv.token ? `${baseUrl}/i/${inv.token}` : baseUrl,
  });
  await sender.send({ to: contact.email, ...message });
}
