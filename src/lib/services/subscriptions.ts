import { and, eq, isNull, lt, sql } from "drizzle-orm";
import type { Database, Transaction } from "@/lib/db/client";
import { withOrgTransaction } from "@/lib/db/tx";
import { subscriptions } from "@/lib/db/schema";
import { NotFoundError, PermissionError, ValidationError } from "@/lib/domain/errors";
import { writeAudit } from "@/lib/audit/write";
import { systemActor, type ActorContext } from "@/lib/audit/context";
import { authorize } from "@/lib/authz/permissions";
import type { Plan } from "@/lib/authz/entitlements";
import { billingPeriodEnd, type BillingInterval } from "@/lib/authz/plan-pricing";
import { getMembership } from "./organizations";

/**
 * Subscription lifecycle for self-billing (PROJECT_BRIEF.md §3.8). Plan
 * ENTITLEMENTS live in code (lib/authz/entitlements.ts); this module owns the
 * plan STATE on the org — activated when a Pro charge settles, downgraded when
 * a period lapses without renewal. Every change is audited, exactly like a
 * document mutation.
 */

export interface SubscriptionView {
  plan: Plan;
  status: string;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  renewalMode: string;
  cancelAtPeriodEnd: boolean;
}

export async function getSubscription(
  db: Database,
  organizationId: string,
): Promise<SubscriptionView> {
  const [row] = await db
    .select({
      plan: subscriptions.plan,
      status: subscriptions.status,
      currentPeriodStart: subscriptions.currentPeriodStart,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      providerCustomerId: subscriptions.providerCustomerId,
      providerSubscriptionId: subscriptions.providerSubscriptionId,
      renewalMode: subscriptions.renewalMode,
      cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
    })
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, organizationId))
    .limit(1);
  if (!row) {
    // every org gets a subscription row at creation; absence is a data bug
    return {
      plan: "free",
      status: "active",
      currentPeriodStart: null,
      currentPeriodEnd: null,
      providerCustomerId: null,
      providerSubscriptionId: null,
      renewalMode: "manual",
      cancelAtPeriodEnd: false,
    };
  }
  return { ...row, plan: (row.plan as Plan) ?? "free" };
}

export interface ActivateProParams {
  interval: BillingInterval;
  startedAt: Date;
  providerCustomerId?: string | null;
  providerSubscriptionId?: string | null;
  /** Saved reusable card token (wave 6); null leaves the stored value. */
  authorizationCode?: string | null;
  /** "auto" when a reusable card was captured, else "manual" (M-Pesa). */
  renewalMode?: "auto" | "manual";
}

/**
 * Move the org onto Pro and (re)set its billing period. Runs in the caller's
 * transaction — the webhook activates the plan in the same commit that records
 * the charge event, so an org is never marked Pro without its paid event.
 * A renewal extends from the later of now and the current period end.
 */
export async function activateProSubscription(
  tx: Transaction,
  ctx: ActorContext,
  params: ActivateProParams,
): Promise<void> {
  const [current] = await tx
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, ctx.organizationId))
    .for("update");
  if (!current) throw new NotFoundError("Subscription");

  const base =
    current.currentPeriodEnd && current.currentPeriodEnd > params.startedAt
      ? current.currentPeriodEnd
      : params.startedAt;
  const periodEnd = billingPeriodEnd(base, params.interval);

  await tx
    .update(subscriptions)
    .set({
      plan: "pro",
      status: "active",
      currentPeriodStart: params.startedAt,
      currentPeriodEnd: periodEnd,
      providerCustomerId:
        params.providerCustomerId ?? current.providerCustomerId,
      providerSubscriptionId:
        params.providerSubscriptionId ?? current.providerSubscriptionId,
      authorizationCode:
        params.authorizationCode ?? current.authorizationCode,
      renewalMode: params.renewalMode ?? current.renewalMode,
      billingInterval: params.interval,
      // any successful paid charge clears an outstanding dunning window
      graceUntil: null,
      version: sql`${subscriptions.version} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.organizationId, ctx.organizationId));

  await writeAudit(tx, ctx, {
    action: "subscription.activated",
    entityType: "subscription",
    entityId: ctx.organizationId,
    changes: {
      before: { plan: current.plan, status: current.status },
      after: {
        plan: "pro",
        status: "active",
        interval: params.interval,
        currentPeriodEnd: periodEnd.toISOString(),
      },
    },
  });
}

/**
 * Downgrade Pro orgs whose paid period has lapsed without renewal (cron, actor
 * SYSTEM). Each org is handled in its own transaction under the RLS backstop so
 * one bad row cannot poison the batch, and re-checked under lock — a renewal
 * webhook that landed since the scan wins.
 */
export async function expireLapsedSubscriptions(
  db: Database,
  now: Date,
): Promise<{ downgraded: number; endedOrganizationIds: string[] }> {
  const candidates = await db
    .select({ organizationId: subscriptions.organizationId })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.plan, "pro"),
        lt(subscriptions.currentPeriodEnd, now),
        isNull(subscriptions.deletedAt),
      ),
    );

  let downgraded = 0;
  const endedOrganizationIds: string[] = [];
  for (const { organizationId } of candidates) {
    const ctx = systemActor(organizationId);
    let ended = false;
    await withOrgTransaction(db, organizationId, async (tx) => {
      const [sub] = await tx
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.organizationId, organizationId))
        .for("update");
      if (!sub || sub.plan !== "pro") return;
      if (!sub.currentPeriodEnd || sub.currentPeriodEnd >= now) return;
      // dunning (wave 6): a failed auto-renewal keeps the org on Pro until its
      // grace window ends, so the renewal cron can keep retrying the card
      if (sub.graceUntil && sub.graceUntil >= now) return;

      await tx
        .update(subscriptions)
        .set({
          plan: "free",
          status: "expired",
          version: sql`${subscriptions.version} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.organizationId, organizationId));
      await writeAudit(tx, ctx, {
        action: "subscription.expired",
        entityType: "subscription",
        entityId: organizationId,
        changes: {
          before: { plan: "pro", status: sub.status },
          after: { plan: "free", status: "expired" },
        },
      });
      downgraded++;
      ended = true;
    });
    if (ended) endedOrganizationIds.push(organizationId);
  }
  return { downgraded, endedOrganizationIds };
}

/**
 * Schedule a cancellation (wave 6): the org keeps Pro until the end of the
 * paid period, then lapses — the renewal cron skips `cancel_at_period_end`
 * subscriptions, and `expireLapsedSubscriptions` downgrades it at period end.
 * No proration, no immediate loss of access. Owner-only (billing.manage).
 */
export async function cancelSubscription(
  db: Database,
  ctx: ActorContext,
): Promise<void> {
  if (!ctx.actorId) throw new PermissionError("billing.manage");
  await withOrgTransaction(db, ctx.organizationId, async (tx) => {
    const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
    authorize(caller.role, "billing.manage");
    const [sub] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, ctx.organizationId))
      .for("update");
    if (!sub || sub.plan !== "pro") {
      throw new ValidationError("No active Pro subscription to cancel");
    }
    if (sub.cancelAtPeriodEnd) return; // idempotent

    await tx
      .update(subscriptions)
      .set({
        cancelAtPeriodEnd: true,
        version: sql`${subscriptions.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.organizationId, ctx.organizationId));
    await writeAudit(tx, ctx, {
      action: "subscription.cancel_scheduled",
      entityType: "subscription",
      entityId: ctx.organizationId,
      changes: {
        before: { cancelAtPeriodEnd: false },
        after: { cancelAtPeriodEnd: true },
      },
    });
  });
}
