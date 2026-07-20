import Link from "next/link";
import { Sparkles } from "lucide-react";
import { getDb } from "@/lib/db/client";
import { can } from "@/lib/authz/permissions";
import { PLAN_ENTITLEMENTS } from "@/lib/authz/entitlements";
import { describeFrequency } from "@/lib/domain/recurring-schedule";
import { listRecurring } from "@/lib/services/recurring";
import { getSubscription } from "@/lib/services/subscriptions";
import { requireMembership } from "@/lib/transport/org";
import { DocumentStatusBadge } from "@/components/document-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function runDate(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "—";
}

export default async function RecurringPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const { role } = await requireMembership(orgId);
  const db = getDb();
  const [schedules, subscription] = await Promise.all([
    listRecurring(db, orgId),
    getSubscription(db, orgId),
  ]);
  // issue 3: recurring is Pro — show the offering up front, not after a
  // rejected save
  const recurringEntitled = PLAN_ENTITLEMENTS[subscription.plan].recurringInvoices;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-xl font-semibold text-foreground">
            Recurring invoices
          </h1>
          <p className="text-sm text-muted-foreground">
            Bill retainers and subscriptions on autopilot.
          </p>
        </div>
        {can(role, "recurring.manage") &&
          (recurringEntitled ? (
            <Button asChild>
              <Link href={`/orgs/${orgId}/recurring/new`}>New schedule</Link>
            </Button>
          ) : (
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/settings/billing`}>
                <Sparkles className="text-amber-500" />
                Upgrade to Pro
              </Link>
            </Button>
          ))}
      </div>

      <Card className="py-0">
        <CardContent className="px-0">
          {schedules.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">
              No recurring schedules yet — set one up to bill a customer
              automatically.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Next invoice</TableHead>
                  <TableHead>Ends</TableHead>
                  <TableHead>On run</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedules.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/orgs/${orgId}/recurring/${s.id}`}
                        className="hover:underline"
                      >
                        {s.customerName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {describeFrequency(s.frequency, s.intervalCount)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.status === "active" ? runDate(s.nextRunAt) : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.endDate ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.autoIssue === "issue" ? "Auto-issue" : "Draft"}
                    </TableCell>
                    <TableCell>
                      <DocumentStatusBadge status={s.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
