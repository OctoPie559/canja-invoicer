import { and, eq, gt, gte, isNotNull, isNull, lt, sql } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import { withOrgTransaction } from "@/lib/db/tx";
import {
  auditLog,
  invoices,
  member,
  paymentEvents,
  paymentIntents,
  payments,
  subscriptions,
  user,
} from "@/lib/db/schema";
import { newId } from "@/lib/domain/ids";
import { parseInvoiceSnapshot } from "@/lib/domain/invoice-snapshot";
import { isOutstanding, type InvoiceStatus } from "@/lib/domain/invoice-status";
import {
  NotFoundError,
  PermissionError,
  ValidationError,
} from "@/lib/domain/errors";
import { writeAudit } from "@/lib/audit/write";
import {
  customerActor,
  systemActor,
  type ActorContext,
} from "@/lib/audit/context";
import { authorize } from "@/lib/authz/permissions";
import {
  BILLING_CURRENCY,
  proPrice,
  type BillingInterval,
} from "@/lib/authz/plan-pricing";
import {
  newChargeReference,
  type PaymentProvider,
  type ProviderEvent,
} from "@/lib/payments";
import {
  startInvoiceCheckoutSchema,
  startSubscriptionCheckoutSchema,
} from "@/lib/validation/checkout";
import { getMembership } from "./organizations";
import { applyInvoicePayment } from "./payments";
import { activateProSubscription } from "./subscriptions";

/**
 * Live-payment orchestration (ARCHITECTURE.md §6). Initiates charges through
 * the PaymentProvider port, then processes the provider's callback idempotently
 * on the same settlement path as manual payments. A `payment_intent` holds the
 * correlation between our reference and what is being paid, so a late,
 * duplicated, or out-of-order webhook always resolves to a single effect.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INTENT_TTL_MS = 30 * 60 * 1000;

export interface InitiateResult {
  authorizationUrl: string;
  reference: string;
}

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

/**
 * Start a charge for a public invoice (payer acts through the unguessable
 * link, recorded as a CUSTOMER actor). Charges the outstanding balance in the
 * invoice's own currency — no cross-currency conversion on collection.
 */
export async function initiateInvoiceCharge(
  db: Database,
  provider: PaymentProvider,
  args: { token: string; email?: string | null; baseUrl: string; meta?: RequestMeta },
): Promise<InitiateResult> {
  const input = startInvoiceCheckoutSchema.parse({
    token: args.token,
    email: args.email ?? undefined,
  });
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.publicToken, input.token), isNull(invoices.deletedAt)))
    .limit(1);
  if (!invoice || invoice.status === "draft" || !invoice.snapshot) {
    throw new NotFoundError("Invoice");
  }
  const status = invoice.status as InvoiceStatus;
  if (status === "void") {
    throw new ValidationError("This invoice has been voided and cannot be paid");
  }
  if (!isOutstanding(status)) {
    throw new ValidationError("This invoice is already settled");
  }
  const total = invoice.totalMinor ?? 0n;
  const balanceMinor = total - (invoice.amountPaidMinor ?? 0n);
  if (balanceMinor <= 0n) {
    throw new ValidationError("This invoice has no outstanding balance");
  }

  const snapshot = parseInvoiceSnapshot(invoice.snapshot);
  const email = (input.email ?? snapshot.customer.primaryContact?.email ?? "")
    .trim()
    .toLowerCase();
  if (!EMAIL_RE.test(email)) {
    throw new ValidationError(
      "An email address is required to pay this invoice online",
    );
  }

  const reference = newChargeReference();
  const ctx = customerActor(invoice.organizationId, args.meta);

  // Persist the correlation row BEFORE the provider is charged: if the process
  // dies mid-initiation, we hold a pending intent the reconcile cron sweeps —
  // never a Paystack charge with no local record.
  await withOrgTransaction(db, invoice.organizationId, async (tx) => {
    await tx.insert(paymentIntents).values({
      id: newId(),
      organizationId: invoice.organizationId,
      purpose: "invoice",
      invoiceId: invoice.id,
      reference,
      provider: provider.name,
      amountMinor: balanceMinor,
      currency: invoice.currency,
      status: "pending",
      expiresAt: new Date(Date.now() + INTENT_TTL_MS),
    });
    await writeAudit(tx, ctx, {
      action: "payment.charge_initiated",
      entityType: "invoice",
      entityId: invoice.id,
      changes: {
        after: {
          reference,
          provider: provider.name,
          amountMinor: String(balanceMinor),
          currency: invoice.currency,
        },
      },
    });
  });

  const session = await provider.initiateCharge({
    reference,
    amountMinor: balanceMinor,
    currency: invoice.currency,
    email,
    callbackUrl: `${args.baseUrl}/api/payments/return`,
    metadata: {
      purpose: "invoice",
      organizationId: invoice.organizationId,
      invoiceId: invoice.id,
    },
  });
  await recordProviderReference(db, invoice.organizationId, reference, session.providerReference);

  return { authorizationUrl: session.authorizationUrl, reference };
}

/** Patch the provider's handle onto an intent after a successful initiate. */
async function recordProviderReference(
  db: Database,
  organizationId: string,
  reference: string,
  providerReference: string,
): Promise<void> {
  await withOrgTransaction(db, organizationId, async (tx) => {
    await tx
      .update(paymentIntents)
      .set({ providerReference, updatedAt: new Date() })
      .where(eq(paymentIntents.reference, reference));
  });
}

/**
 * Start a Pro-subscription self-billing charge (owner only). Priced in the
 * platform's billing currency, independent of the org's base currency.
 */
export async function initiateSubscriptionCharge(
  db: Database,
  provider: PaymentProvider,
  ctx: ActorContext,
  input: { interval: BillingInterval },
  args: { baseUrl: string },
): Promise<InitiateResult> {
  if (!ctx.actorId) throw new PermissionError("billing.manage");
  const data = startSubscriptionCheckoutSchema.parse(input);

  const email = await withOrgTransaction(db, ctx.organizationId, async (tx) => {
    const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
    authorize(caller.role, "billing.manage");
    const [u] = await tx
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, ctx.actorId!))
      .limit(1);
    return u?.email ?? null;
  });
  if (!email) {
    throw new ValidationError("A billing email is required to upgrade");
  }

  const price = proPrice(data.interval);
  const reference = newChargeReference();

  // correlation row first — see initiateInvoiceCharge for the rationale
  await withOrgTransaction(db, ctx.organizationId, async (tx) => {
    await tx.insert(paymentIntents).values({
      id: newId(),
      organizationId: ctx.organizationId,
      purpose: "subscription",
      billingInterval: data.interval,
      reference,
      provider: provider.name,
      amountMinor: price.amountMinor,
      currency: BILLING_CURRENCY,
      status: "pending",
      initiatedBy: ctx.actorId,
      expiresAt: new Date(Date.now() + INTENT_TTL_MS),
    });
    await writeAudit(tx, ctx, {
      action: "subscription.checkout_initiated",
      entityType: "subscription",
      entityId: ctx.organizationId,
      changes: {
        after: {
          reference,
          interval: data.interval,
          amountMinor: String(price.amountMinor),
          currency: BILLING_CURRENCY,
        },
      },
    });
  });

  const session = await provider.initiateCharge({
    reference,
    amountMinor: price.amountMinor,
    currency: BILLING_CURRENCY,
    email,
    callbackUrl: `${args.baseUrl}/api/payments/return`,
    metadata: {
      purpose: "subscription",
      organizationId: ctx.organizationId,
      interval: data.interval,
    },
  });
  await recordProviderReference(db, ctx.organizationId, reference, session.providerReference);

  return { authorizationUrl: session.authorizationUrl, reference };
}

export interface ProcessResult {
  ok: boolean;
  reason: string;
  /** provider reference, so the transport can fire settlement emails */
  reference?: string;
}

/**
 * Process a provider webhook idempotently (ARCHITECTURE.md §6):
 *   verify signature → persist raw payload → NO-OP if already processed →
 *   match to the intent → settle on the shared payment path → audit.
 * Two guards make replays and out-of-order callbacks provably safe: the
 * (provider, event id) unique index on payment_events, and — for the rare case
 * of two distinct events carrying one transaction — the unique
 * provider_transaction_id on payments.
 */
export async function processProviderEvent(
  db: Database,
  provider: PaymentProvider,
  rawBody: string,
  signature: string | null,
  meta?: RequestMeta,
): Promise<ProcessResult> {
  const event = provider.verifyWebhook(rawBody, signature);
  if (!event) return { ok: false, reason: "invalid_signature" };
  return processEvent(db, provider, event, meta);
}

/**
 * Verify a charge directly with the provider by reference and settle it — the
 * fallback for when the browser returns from checkout but the webhook is
 * delayed or (in local dev) cannot reach us. Shares the SAME idempotent
 * settlement as the webhook, so whichever arrives first wins and the other
 * no-ops (both key on the intent, locked FOR UPDATE). Authenticity comes from
 * asking the provider — with our secret — whether the reference is paid, so an
 * attacker cannot forge a success by guessing a reference.
 */
export async function verifyAndProcessCharge(
  db: Database,
  provider: PaymentProvider,
  reference: string,
  meta?: RequestMeta,
): Promise<ProcessResult> {
  const event = await provider.fetchTransaction(reference);
  if (!event) return { ok: true, reason: "unverified" };
  return processEvent(db, provider, event, meta);
}

/** Shared core: match a provider event to its intent and settle idempotently. */
async function processEvent(
  db: Database,
  provider: PaymentProvider,
  event: ProviderEvent,
  meta?: RequestMeta,
): Promise<ProcessResult> {
  // Resolve the org from the reference first (a plain read, outside RLS): the
  // callback carries no session, so the intent we created IS the org context.
  const [intentRef] = await db
    .select()
    .from(paymentIntents)
    .where(
      and(
        eq(paymentIntents.reference, event.reference),
        isNull(paymentIntents.deletedAt),
      ),
    )
    .limit(1);
  if (!intentRef) return { ok: true, reason: "unmatched" };

  const organizationId = intentRef.organizationId;
  const ctx: ActorContext = { ...systemActor(organizationId), ...meta };

  const reason = await withOrgTransaction(db, organizationId, async (tx) => {
    // idempotent raw-payload persistence: a replay of the same event id is a
    // conflict, inserts nothing, and short-circuits every downstream effect
    const inserted = await tx
      .insert(paymentEvents)
      .values({
        id: newId(),
        organizationId,
        provider: provider.name,
        eventType: event.eventType,
        providerEventId: event.providerEventId,
        payload: event.raw as object,
        processingStatus: "received",
      })
      .onConflictDoNothing({
        target: [paymentEvents.provider, paymentEvents.providerEventId],
      })
      .returning({ id: paymentEvents.id });
    if (inserted.length === 0) return "duplicate_event";
    const eventRowId = inserted[0].id;

    const markEvent = (processingStatus: string, paymentId?: string) =>
      tx
        .update(paymentEvents)
        .set({ processingStatus, paymentId, updatedAt: new Date() })
        .where(eq(paymentEvents.id, eventRowId));

    const [intent] = await tx
      .select()
      .from(paymentIntents)
      .where(eq(paymentIntents.id, intentRef.id))
      .for("update");
    if (!intent) return "unmatched";
    // an already-settled intent means this callback is a duplicate/replay
    if (intent.status !== "pending") {
      await markEvent("duplicate");
      return "intent_settled";
    }

    if (event.status === "success") {
      if (intent.purpose === "invoice") {
        if (!intent.invoiceId) {
          await markEvent("error");
          return "missing_invoice";
        }
        // second idempotency net: the same transaction reaching us under a
        // different event id must not double-record the money
        const [existing] = await tx
          .select({ id: payments.id })
          .from(payments)
          .where(
            and(
              eq(payments.organizationId, organizationId),
              eq(payments.providerTransactionId, event.providerTransactionId),
            ),
          )
          .limit(1);
        if (existing) {
          await markEvent("duplicate");
          return "duplicate_transaction";
        }

        const { paymentId } = await applyInvoicePayment(tx, ctx, {
          invoiceId: intent.invoiceId,
          amountMinor: event.amountMinor,
          currency: event.currency,
          method: event.method,
          source: "gateway",
          provider: provider.name,
          providerTransactionId: event.providerTransactionId,
          paidAt: new Date(),
          reference: event.reference,
        });
        await tx
          .update(paymentIntents)
          .set({ status: "succeeded", paymentId, updatedAt: new Date() })
          .where(eq(paymentIntents.id, intent.id));
        await markEvent("processed", paymentId);
        return "invoice_paid";
      }

      // subscription — capture a reusable card token for auto-renewal; a
      // one-time (M-Pesa) authorization leaves the org in manual-renew mode
      const reusableCard = Boolean(event.authorization?.reusable);
      await activateProSubscription(tx, ctx, {
        interval: (intent.billingInterval as BillingInterval) ?? "monthly",
        startedAt: new Date(),
        authorizationCode: reusableCard
          ? event.authorization!.authorizationCode
          : null,
        renewalMode: reusableCard ? "auto" : "manual",
        providerCustomerId: event.customerCode ?? null,
      });
      await tx
        .update(paymentIntents)
        .set({ status: "succeeded", updatedAt: new Date() })
        .where(eq(paymentIntents.id, intent.id));
      await markEvent("processed");
      return "subscription_activated";
    }

    if (event.status === "failed") {
      await tx
        .update(paymentIntents)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(paymentIntents.id, intent.id));
      await writeAudit(tx, ctx, {
        action: "payment.charge_failed",
        entityType: "payment_intent",
        entityId: intent.id,
        changes: {
          before: { status: "pending" },
          after: { status: "failed" },
        },
      });
      await markEvent("processed");
      return "charge_failed";
    }

    // pending / other: leave the intent open for a later terminal event
    await markEvent("ignored");
    return "ignored";
  });

  return { ok: true, reason, reference: event.reference };
}

// --- Recurring renewals (wave 6, self-managed) -----------------------------

/** Attempt a card renewal up to this long before the period ends. */
const RENEW_LEAD_MS = 24 * 60 * 60 * 1000;
/** Keep a failed auto-renewal on Pro this long while we retry (dunning). */
const DUNNING_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

/** An owner's email for the org — the payer of record for a renewal charge. */
async function ownerEmail(
  db: Database,
  organizationId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ email: user.email })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(
      and(eq(member.organizationId, organizationId), eq(member.role, "owner")),
    )
    .limit(1);
  return row?.email ?? null;
}

/** Open (or keep) the dunning grace window after a failed renewal. */
async function enterDunningGrace(
  db: Database,
  ctx: ActorContext,
  organizationId: string,
  now: Date,
): Promise<Date | undefined> {
  return withOrgTransaction(db, organizationId, async (tx) => {
    const [sub] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, organizationId))
      .for("update");
    if (!sub || sub.plan !== "pro") return undefined;
    if (sub.graceUntil) return sub.graceUntil; // grace already running
    const base =
      sub.currentPeriodEnd && sub.currentPeriodEnd > now
        ? sub.currentPeriodEnd
        : now;
    const graceUntil = new Date(base.getTime() + DUNNING_GRACE_MS);
    await tx
      .update(subscriptions)
      .set({
        status: "past_due",
        graceUntil,
        version: sql`${subscriptions.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.organizationId, organizationId));
    await writeAudit(tx, ctx, {
      action: "subscription.renewal_failed",
      entityType: "subscription",
      entityId: organizationId,
      changes: { after: { graceUntil: graceUntil.toISOString() } },
    });
    return graceUntil;
  });
}

/**
 * Renew due card subscriptions (cron, actor SYSTEM). For each auto-renew org
 * approaching expiry we re-charge the saved authorization through the SAME
 * idempotent settlement path as any charge (our reference → `processEvent` →
 * `activateProSubscription` extends the period). A decline (or API error) opens
 * a dunning grace window and the org keeps Pro; the daily run retries until it
 * succeeds or `expireLapsedSubscriptions` downgrades it once grace ends.
 * M-Pesa (renewal_mode = manual) is not charged here — it can't be — and is
 * handled by the reminder path.
 */
export interface RenewalResult {
  organizationId: string;
  email: string;
  outcome: "renewed" | "dunning";
  /** when set on a dunning outcome, the grace window end (for the notice) */
  retryUntil?: Date;
}

export async function renewDueSubscriptions(
  db: Database,
  provider: PaymentProvider,
  now: Date,
  meta?: RequestMeta,
): Promise<{
  attempted: number;
  renewed: number;
  failed: number;
  results: RenewalResult[];
}> {
  const dueBefore = new Date(now.getTime() + RENEW_LEAD_MS);
  const due = await db
    .select({
      organizationId: subscriptions.organizationId,
      authorizationCode: subscriptions.authorizationCode,
      billingInterval: subscriptions.billingInterval,
    })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.plan, "pro"),
        eq(subscriptions.renewalMode, "auto"),
        eq(subscriptions.cancelAtPeriodEnd, false),
        isNull(subscriptions.deletedAt),
        isNotNull(subscriptions.authorizationCode),
        lt(subscriptions.currentPeriodEnd, dueBefore),
      ),
    );

  let attempted = 0;
  let renewed = 0;
  let failed = 0;
  const results: RenewalResult[] = [];
  for (const row of due) {
    if (!row.authorizationCode) continue;
    const organizationId = row.organizationId;
    const ctx: ActorContext = { ...systemActor(organizationId), ...meta };
    const interval = (row.billingInterval as BillingInterval) ?? "monthly";
    const price = proPrice(interval);

    const email = await ownerEmail(db, organizationId);
    if (!email) continue; // no payer email — leave for a later run

    const reference = newChargeReference();
    await withOrgTransaction(db, organizationId, async (tx) => {
      await tx.insert(paymentIntents).values({
        id: newId(),
        organizationId,
        purpose: "subscription",
        billingInterval: interval,
        reference,
        provider: provider.name,
        amountMinor: price.amountMinor,
        currency: BILLING_CURRENCY,
        status: "pending",
        initiatedBy: null, // system-initiated renewal
        expiresAt: new Date(now.getTime() + INTENT_TTL_MS),
      });
    });

    attempted++;
    const event = await provider.chargeAuthorization({
      reference,
      authorizationCode: row.authorizationCode,
      email,
      amountMinor: price.amountMinor,
      currency: BILLING_CURRENCY,
      metadata: { purpose: "subscription", organizationId, interval, renewal: true },
    });

    if (!event) {
      // API/transport error (not a decline) — dunning, retry next run
      const retryUntil = await enterDunningGrace(db, ctx, organizationId, now);
      failed++;
      results.push({ organizationId, email, outcome: "dunning", retryUntil });
      continue;
    }

    const result = await processEvent(db, provider, event, meta);
    if (result.reason === "subscription_activated") {
      renewed++;
      results.push({ organizationId, email, outcome: "renewed" });
    } else {
      const retryUntil = await enterDunningGrace(db, ctx, organizationId, now);
      failed++;
      results.push({ organizationId, email, outcome: "dunning", retryUntil });
    }
  }
  return { attempted, renewed, failed, results };
}

/** Send a manual (M-Pesa) renewal reminder at most this long before expiry. */
const REMINDER_LEAD_MS = 3 * 24 * 60 * 60 * 1000;

export interface ReminderDue {
  organizationId: string;
  email: string;
  expiresOn: string;
  interval: BillingInterval;
}

/**
 * Find manual (M-Pesa) subscriptions approaching expiry that still need a
 * renewal reminder this period, and MARK them reminded (cron, actor SYSTEM).
 * The `subscription.renewal_reminder` audit row is the once-per-period dedup —
 * no extra column. The cron route sends the emails from the returned list.
 */
export async function remindDueManualSubscriptions(
  db: Database,
  now: Date,
): Promise<ReminderDue[]> {
  const soon = new Date(now.getTime() + REMINDER_LEAD_MS);
  const due = await db
    .select({
      organizationId: subscriptions.organizationId,
      currentPeriodStart: subscriptions.currentPeriodStart,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      billingInterval: subscriptions.billingInterval,
    })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.plan, "pro"),
        eq(subscriptions.renewalMode, "manual"),
        eq(subscriptions.cancelAtPeriodEnd, false),
        isNull(subscriptions.deletedAt),
        isNotNull(subscriptions.currentPeriodEnd),
        gt(subscriptions.currentPeriodEnd, now), // not yet expired
        lt(subscriptions.currentPeriodEnd, soon), // within the reminder lead
      ),
    );

  const out: ReminderDue[] = [];
  for (const row of due) {
    if (!row.currentPeriodEnd) continue;
    // once per period: skip if a reminder was already logged since the period
    // started
    const [already] = await db
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, row.organizationId),
          eq(auditLog.action, "subscription.renewal_reminder"),
          row.currentPeriodStart
            ? gte(auditLog.createdAt, row.currentPeriodStart)
            : undefined,
        ),
      )
      .limit(1);
    if (already) continue;

    const email = await ownerEmail(db, row.organizationId);
    if (!email) continue;

    const ctx = systemActor(row.organizationId);
    await withOrgTransaction(db, row.organizationId, async (tx) => {
      await writeAudit(tx, ctx, {
        action: "subscription.renewal_reminder",
        entityType: "subscription",
        entityId: row.organizationId,
        changes: { after: { currentPeriodEnd: row.currentPeriodEnd!.toISOString() } },
      });
    });
    out.push({
      organizationId: row.organizationId,
      email,
      expiresOn: row.currentPeriodEnd.toISOString().slice(0, 10),
      interval: (row.billingInterval as BillingInterval) ?? "monthly",
    });
  }
  return out;
}

/**
 * Reconcile abandoned charges (cron, actor SYSTEM): pending intents past their
 * TTL are swept to `abandoned` so they stop showing as in-flight. A terminal
 * webhook that lands later still wins — it settles a pending intent, and this
 * only ever touches ones still pending under lock.
 */
export async function reconcilePendingIntents(
  db: Database,
  now: Date,
): Promise<{ swept: number }> {
  const stale = await db
    .select({
      id: paymentIntents.id,
      organizationId: paymentIntents.organizationId,
    })
    .from(paymentIntents)
    .where(
      and(
        eq(paymentIntents.status, "pending"),
        lt(paymentIntents.expiresAt, now),
        isNull(paymentIntents.deletedAt),
      ),
    );

  let swept = 0;
  for (const row of stale) {
    const ctx = systemActor(row.organizationId);
    await withOrgTransaction(db, row.organizationId, async (tx) => {
      const [intent] = await tx
        .select()
        .from(paymentIntents)
        .where(eq(paymentIntents.id, row.id))
        .for("update");
      if (!intent || intent.status !== "pending" || intent.expiresAt >= now) {
        return;
      }
      await tx
        .update(paymentIntents)
        .set({ status: "abandoned", updatedAt: new Date() })
        .where(eq(paymentIntents.id, intent.id));
      await writeAudit(tx, ctx, {
        action: "payment.charge_abandoned",
        entityType: "payment_intent",
        entityId: intent.id,
        changes: {
          before: { status: "pending" },
          after: { status: "abandoned" },
        },
      });
      swept++;
    });
  }
  return { swept };
}

/**
 * Where to send the payer after the checkout-return handler settles: back to
 * the billing page for a subscription, or the hosted invoice for an invoice
 * charge. A plain read by reference (the return route carries no session).
 */
export async function getReturnDestination(
  db: Database,
  reference: string,
): Promise<string> {
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
  if (!intent) return "/";
  if (intent.purpose === "subscription") {
    return `/orgs/${intent.organizationId}/settings/billing?upgraded=1`;
  }
  if (intent.invoiceId) {
    const [inv] = await db
      .select({ token: invoices.publicToken })
      .from(invoices)
      .where(eq(invoices.id, intent.invoiceId))
      .limit(1);
    // issue 16: land the payer on a clear "payment received" confirmation
    if (inv?.token) return `/i/${inv.token}?paid=1`;
  }
  return "/";
}
