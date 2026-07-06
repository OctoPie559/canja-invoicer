import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { AlertTriangle, Banknote, FileText, Wallet } from "lucide-react";
import { getDb } from "@/lib/db/client";
import { auditLog, organization } from "@/lib/db/schema";
import { getFinancialOverview } from "@/lib/services/reporting";
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

  const [overview, timeline] = await Promise.all([
    getFinancialOverview(db, orgId),
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

      {overview.unconvertibleCount > 0 && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertDescription>
            {overview.unconvertibleCount} foreign-currency invoice(s) have no
            exchange-rate snapshot and are excluded from these totals.
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
          label="Collected"
          value={formatMoneyCompact(overview.collected)}
          context="all time"
          icon={Banknote}
        />
        <StatTile
          label="Drafts"
          value={String(overview.draftCount)}
          context={`${overview.customerCount} customer${overview.customerCount === 1 ? "" : "s"} · ${overview.productCount} product${overview.productCount === 1 ? "" : "s"}`}
          icon={FileText}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base">
            Recent activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ActivityTimeline entries={timeline} />
        </CardContent>
      </Card>
    </div>
  );
}
