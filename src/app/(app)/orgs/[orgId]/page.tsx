import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { AlertTriangle, Banknote, FileText, Wallet } from "lucide-react";
import { getDb } from "@/lib/db/client";
import { auditLog, organization } from "@/lib/db/schema";
import {
  getAgingBuckets,
  getCashFlow,
  getFinancialOverview,
  getStatusBreakdown,
  getTopCustomers,
} from "@/lib/services/reporting";
import type { Money } from "@/lib/domain/money";
import { CashFlowChart } from "@/components/charts/cash-flow-chart";
import { BreakdownBars } from "@/components/charts/breakdown-bars";
import { AGING_COLORS, STATUS_COLORS } from "@/components/charts/palette";
import { InvoiceStatusBadge } from "@/components/invoice-status-badge";
import type { InvoiceStatus } from "@/lib/domain/invoice-status";
import { requireMembership } from "@/lib/transport/org";
import { ActivityTimeline } from "@/components/activity-timeline";
import { formatMoneyCompact, StatTile } from "@/components/stat-tile";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** Org overview = the finances at a glance. Management lives in Settings. */
export default async function OrgOverviewPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const { role } = await requireMembership(orgId);
  const db = getDb();

  const [org] = await db
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, orgId))
    .limit(1);
  if (!org) notFound();

  const [overview, cashFlow, statusBreakdown, aging, topCustomers, timeline] =
    await Promise.all([
    getFinancialOverview(db, orgId),
    getCashFlow(db, orgId, 6),
    getStatusBreakdown(db, orgId),
    getAgingBuckets(db, orgId),
    getTopCustomers(db, orgId, 5),
    db
      .select({
        id: auditLog.id,
        action: auditLog.action,
        actorType: auditLog.actorType,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .where(eq(auditLog.organizationId, orgId))
      .orderBy(desc(auditLog.createdAt))
      .limit(10),
  ]);

  // display-only conversion: charts scale by relative magnitude; every
  // business sum above happened in Money (bigint) inside the services
  const chartValue = (m: Money) => Number(m.toDecimalString());
  const collectedThisMonth = cashFlow.months[cashFlow.months.length - 1].collected;
  const unconvertibleTotal =
    overview.unconvertibleCount +
    cashFlow.unconvertibleCount +
    statusBreakdown.unconvertibleCount +
    aging.unconvertibleCount +
    topCustomers.unconvertibleCount;

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="font-heading text-xl font-semibold text-foreground">
          {org.name}
        </h1>
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          your role <Badge variant="secondary">{role}</Badge>
        </span>
      </div>

      {unconvertibleTotal > 0 && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertDescription>
            Some foreign-currency records have no exchange-rate snapshot and
            are excluded from these totals ({unconvertibleTotal} across the
            reports below).
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Outstanding"
          value={formatMoneyCompact(overview.outstanding)}
          context={`${overview.openInvoiceCount} open invoice${overview.openInvoiceCount === 1 ? "" : "s"}`}
          icon={Wallet}
        />
        <StatTile
          label="Overdue"
          value={formatMoneyCompact(overview.overdue)}
          context={`${overview.overdueCount} invoice${overview.overdueCount === 1 ? "" : "s"} past due`}
          icon={AlertTriangle}
          emphasis={overview.overdueCount > 0 ? "serious" : "none"}
        />
        <StatTile
          label="Collected this month"
          value={formatMoneyCompact(collectedThisMonth)}
          context={`${formatMoneyCompact(overview.collected)} all time`}
          icon={Banknote}
        />
        <StatTile
          label="Drafts"
          value={String(overview.draftCount)}
          context={`${overview.customerCount} customer${overview.customerCount === 1 ? "" : "s"} · ${overview.productCount} product${overview.productCount === 1 ? "" : "s"}`}
          icon={FileText}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="font-heading text-base">Cash flow</CardTitle>
          </CardHeader>
          <CardContent>
            <CashFlowChart
              baseCurrency={overview.baseCurrency}
              points={cashFlow.months.map((m) => ({
                month: m.month,
                invoiced: {
                  value: chartValue(m.invoiced),
                  label: formatMoneyCompact(m.invoiced),
                },
                collected: {
                  value: chartValue(m.collected),
                  label: formatMoneyCompact(m.collected),
                },
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-base">
              Invoices by status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statusBreakdown.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No invoices yet.</p>
            ) : (
              <ul className="space-y-2.5">
                {statusBreakdown.rows.map((r) => (
                  <li
                    key={r.status}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <InvoiceStatusBadge status={r.status as InvoiceStatus} />
                      <span className="text-xs text-muted-foreground">
                        × {r.count}
                      </span>
                    </span>
                    <span className="font-mono text-xs">
                      {formatMoneyCompact(r.total)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="font-heading text-base">
              Receivables aging
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BreakdownBars
              rows={aging.buckets.map((b) => ({
                key: b.bucket,
                label:
                  b.bucket === "current"
                    ? "Not yet due"
                    : `${b.bucket} days overdue`,
                sublabel: `${b.count} invoice${b.count === 1 ? "" : "s"}`,
                value: chartValue(b.amount),
                display: formatMoneyCompact(b.amount),
                color: AGING_COLORS[b.bucket],
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-base">
              Top customers by balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topCustomers.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing outstanding — nice.
              </p>
            ) : (
              <BreakdownBars
                rows={topCustomers.rows.map((c) => ({
                  key: c.customerId,
                  label: c.name,
                  sublabel: `billed ${formatMoneyCompact(c.billed)}`,
                  value: chartValue(c.outstanding),
                  display: formatMoneyCompact(c.outstanding),
                  color: STATUS_COLORS.sent,
                  href: `/orgs/${orgId}/customers/${c.customerId}`,
                }))}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
