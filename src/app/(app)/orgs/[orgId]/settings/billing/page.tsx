import { Check } from "lucide-react";
import { getDb } from "@/lib/db/client";
import { can } from "@/lib/authz/permissions";
import { proPrice } from "@/lib/authz/plan-pricing";
import { getSubscription } from "@/lib/services/subscriptions";
import { isPaymentsConfigured } from "@/lib/payments";
import { requireMembership } from "@/lib/transport/org";
import { UpgradePlan } from "@/components/upgrade-plan";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Billing & plan (slice 8). Owners can upgrade to Pro through self-billing;
 * everyone can see the current plan and what Pro unlocks. Plan STATE is read
 * from the subscription; entitlement definitions live in code.
 */

const PRO_FEATURES = [
  "Unlimited invoices each month",
  "Up to 10 team members",
  "Recurring invoices",
  "Multi-currency invoicing",
  "Custom PDF templates",
  "Advanced reports",
  "No invoicer footer on documents",
];

const dateFmt = new Intl.DateTimeFormat("en-KE", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export default async function BillingSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ upgraded?: string }>;
}) {
  const { orgId } = await params;
  const { upgraded } = await searchParams;
  const { role } = await requireMembership(orgId);
  const subscription = await getSubscription(getDb(), orgId);

  const isPro = subscription.plan === "pro";
  const canManage = can(role, "billing.manage");
  const paymentsReady = isPaymentsConfigured();

  return (
    <div className="space-y-4">
      {upgraded === "1" && isPro && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          <Check className="size-4 text-primary" />
          Payment confirmed — you&apos;re on Pro now.
        </div>
      )}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="font-heading text-base">
              Current plan
            </CardTitle>
            <Badge
              variant={isPro ? "default" : "secondary"}
              className="uppercase"
            >
              {subscription.plan}
            </Badge>
          </div>
          <CardDescription>
            {isPro
              ? "You're on Pro — every feature is unlocked."
              : "You're on the Free plan. Upgrade to unlock everything below."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isPro && subscription.currentPeriodEnd && (
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Status</dt>
                <dd className="font-medium capitalize">
                  {subscription.status}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Renews / expires</dt>
                <dd className="font-medium">
                  {dateFmt.format(subscription.currentPeriodEnd)}
                </dd>
              </div>
            </dl>
          )}

          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            {PRO_FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-2">
                <Check className="size-4 text-primary" />
                {f}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {!isPro && (
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-base">
              Upgrade to Pro
            </CardTitle>
            <CardDescription>
              Billed in KES through M-Pesa or card, the same rail your customers
              pay you on.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!canManage ? (
              <p className="text-sm text-muted-foreground">
                Only an owner can change the plan. Ask an owner to upgrade.
              </p>
            ) : !paymentsReady ? (
              <p className="text-sm text-muted-foreground">
                Online upgrades aren&apos;t available right now. Please try
                again later.
              </p>
            ) : (
              <UpgradePlan
                organizationId={orgId}
                monthlyLabel={proPrice("monthly").toString()}
                annualLabel={proPrice("annual").toString()}
              />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
