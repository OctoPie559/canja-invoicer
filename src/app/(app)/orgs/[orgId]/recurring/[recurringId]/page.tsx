import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Pencil } from "lucide-react";
import { getDb } from "@/lib/db/client";
import { can } from "@/lib/authz/permissions";
import { Money } from "@/lib/domain/money";
import { describeFrequency } from "@/lib/domain/recurring-schedule";
import {
  getRecurring,
  getRecurringTimeline,
  listGeneratedInvoices,
} from "@/lib/services/recurring";
import { requireMembership } from "@/lib/transport/org";
import { deleteRecurringAction } from "@/app/actions/recurring";
import { ActivityRoadmap } from "@/components/activity-roadmap";
import { DeleteButton } from "@/components/delete-button";
import { DocumentStatusBadge } from "@/components/document-status-badge";
import { InvoiceStatusBadge } from "@/components/invoice-status-badge";
import { RecurringStatusActions } from "@/components/recurring-actions";
import type { InvoiceStatus } from "@/lib/domain/invoice-status";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

export default async function RecurringWorkspacePage({
  params,
}: {
  params: Promise<{ orgId: string; recurringId: string }>;
}) {
  const { orgId, recurringId } = await params;
  const { role } = await requireMembership(orgId);
  const db = getDb();
  const schedule = await getRecurring(db, orgId, recurringId);
  if (!schedule) notFound();
  const [timeline, generated] = await Promise.all([
    getRecurringTimeline(db, orgId, recurringId),
    listGeneratedInvoices(db, orgId, recurringId),
  ]);

  const currency = schedule.currency;
  const fmt = (minor: bigint | null) =>
    Money.fromMinor(minor ?? 0n, currency).toString();
  const runDate = schedule.nextRunAt
    ? schedule.nextRunAt.toISOString().slice(0, 10)
    : "—";
  const manage = can(role, "recurring.manage");

  return (
    <div className="space-y-4">
      <Link
        href={`/orgs/${orgId}/recurring`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        All schedules
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h1 className="font-heading text-xl font-semibold text-foreground">
            {schedule.customer?.name ?? "Recurring schedule"}
          </h1>
          <DocumentStatusBadge status={schedule.status} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {manage && schedule.status !== "ended" && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/orgs/${orgId}/recurring/${recurringId}/edit`}>
                <Pencil />
                Edit
              </Link>
            </Button>
          )}
          {manage && (
            <RecurringStatusActions
              organizationId={orgId}
              recurringId={recurringId}
              status={schedule.status}
            />
          )}
          {manage && (
            <DeleteButton
              action={deleteRecurringAction.bind(
                null,
                orgId,
                recurringId,
                schedule.version,
              )}
            />
          )}
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="invoices">
            Generated ({generated.length})
          </TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardContent className="space-y-8 pt-6">
              <div className="grid gap-6 sm:grid-cols-3">
                <div className="space-y-1 text-sm">
                  <h3 className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
                    Customer
                  </h3>
                  <p className="font-medium">
                    <Link
                      href={`/orgs/${orgId}/customers/${schedule.customerId}`}
                      className="hover:underline"
                    >
                      {schedule.customer?.name ?? "Customer"}
                    </Link>
                  </p>
                </div>
                <div className="space-y-2 text-sm sm:col-span-2">
                  <h3 className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
                    Schedule
                  </h3>
                  <dl className="grid gap-1 sm:grid-cols-2">
                    <div className="flex justify-between sm:pr-6">
                      <dt className="text-muted-foreground">Frequency</dt>
                      <dd>
                        {describeFrequency(
                          schedule.frequency,
                          schedule.intervalCount,
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between sm:pr-6">
                      <dt className="text-muted-foreground">Next invoice</dt>
                      <dd>{schedule.status === "active" ? runDate : "—"}</dd>
                    </div>
                    <div className="flex justify-between sm:pr-6">
                      <dt className="text-muted-foreground">Ends</dt>
                      <dd>{schedule.endDate ?? "No end date"}</dd>
                    </div>
                    <div className="flex justify-between sm:pr-6">
                      <dt className="text-muted-foreground">On each run</dt>
                      <dd>
                        {schedule.autoIssue === "issue"
                          ? "Issue automatically"
                          : "Create a draft"}
                      </dd>
                    </div>
                    <div className="flex justify-between sm:pr-6">
                      <dt className="text-muted-foreground">Currency</dt>
                      <dd>{currency}</dd>
                    </div>
                  </dl>
                </div>
              </div>

              <div>
                <h3 className="mb-3 text-xs font-medium tracking-widest text-muted-foreground uppercase">
                  Line items
                </h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit price</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {schedule.items.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="font-medium">
                          {l.description}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {l.quantity}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {fmt(l.unitPriceMinor)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {(schedule.notes || schedule.terms) && (
                <div className="grid gap-6 border-t pt-6 sm:grid-cols-2">
                  {schedule.notes && (
                    <div>
                      <h3 className="mb-2 text-xs font-medium tracking-widest text-muted-foreground uppercase">
                        Notes
                      </h3>
                      <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                        {schedule.notes}
                      </p>
                    </div>
                  )}
                  {schedule.terms && (
                    <div>
                      <h3 className="mb-2 text-xs font-medium tracking-widest text-muted-foreground uppercase">
                        Terms
                      </h3>
                      <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                        {schedule.terms}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invoices">
          <Card className="py-0">
            <CardContent className="px-0">
              {generated.length === 0 ? (
                <p className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No invoices generated yet — the first one lands on{" "}
                  {schedule.status === "active" ? runDate : "the next run"}.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Number</TableHead>
                      <TableHead>Issued</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {generated.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">
                          <Link
                            href={`/orgs/${orgId}/invoices/${inv.id}`}
                            className="hover:underline"
                          >
                            {inv.displayNumber ?? "Draft"}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {inv.issueDate}
                        </TableCell>
                        <TableCell>
                          <InvoiceStatusBadge
                            status={inv.status as InvoiceStatus}
                          />
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {Money.fromMinor(
                            inv.totalMinor ?? 0n,
                            inv.currency,
                          ).toString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardContent className="pt-6">
              <ActivityRoadmap entries={timeline} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
