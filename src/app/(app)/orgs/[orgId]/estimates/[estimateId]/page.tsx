import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Download, Pencil } from "lucide-react";
import { getDb } from "@/lib/db/client";
import { can } from "@/lib/authz/permissions";
import { Money } from "@/lib/domain/money";
import {
  isEstimateEditable,
  type EstimateStatus,
} from "@/lib/domain/estimate-status";
import {
  getEstimate,
  getEstimateTimeline,
  listEstimateEmails,
} from "@/lib/services/estimates";
import { listContacts } from "@/lib/services/contacts";
import { contactDisplayName } from "@/lib/format/contact";
import { getInvoiceSettings } from "@/lib/services/settings";
import { requireMembership } from "@/lib/transport/org";
import { deleteEstimateDraftAction } from "@/app/actions/estimates";
import { ActivityRoadmap } from "@/components/activity-roadmap";
import { DeleteButton } from "@/components/delete-button";
import { DocumentStatusBadge } from "@/components/document-status-badge";
import {
  EstimateDecisionButtons,
  IssueEstimateDialog,
  SendEstimateDialog,
} from "@/components/estimate-actions";
import { Badge } from "@/components/ui/badge";
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

export default async function EstimateWorkspacePage({
  params,
}: {
  params: Promise<{ orgId: string; estimateId: string }>;
}) {
  const { orgId, estimateId } = await params;
  const { role } = await requireMembership(orgId);
  const db = getDb();
  const estimate = await getEstimate(db, orgId, estimateId);
  if (!estimate) notFound();
  const [timeline, settings, emails, contacts] = await Promise.all([
    getEstimateTimeline(db, orgId, estimateId),
    getInvoiceSettings(db, orgId),
    listEstimateEmails(db, orgId, estimateId),
    listContacts(db, orgId, estimate.customerId),
  ]);

  const status = estimate.status as EstimateStatus;
  const draft = isEstimateEditable(status);
  const currency = estimate.currency;
  const fmt = (minor: bigint | null) =>
    Money.fromMinor(minor ?? 0n, currency).toString();
  const isoToday = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <Link
        href={`/orgs/${orgId}/estimates`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        All estimates
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h1 className="font-heading text-xl font-semibold text-foreground">
            {estimate.displayNumber ?? "Draft estimate"}
          </h1>
          <DocumentStatusBadge status={status} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {draft && can(role, "estimate.update") && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/orgs/${orgId}/estimates/${estimateId}/edit`}>
                <Pencil />
                Edit
              </Link>
            </Button>
          )}
          {draft && can(role, "estimate.send") && (
            <IssueEstimateDialog
              organizationId={orgId}
              estimateId={estimateId}
              version={estimate.version}
              nextDisplayNumber={`${settings.estimatePrefix}-${String(settings.estimateNextNumber).padStart(6, "0")}`}
              defaultIssueDate={estimate.issueDate ?? isoToday}
              defaultExpiryDate={estimate.expiryDate ?? isoToday}
            />
          )}
          {draft && can(role, "estimate.update") && (
            <DeleteButton
              action={deleteEstimateDraftAction.bind(
                null,
                orgId,
                estimateId,
                estimate.version,
              )}
            />
          )}
          {!draft && status !== "converted" && can(role, "estimate.convert") && (
            <EstimateDecisionButtons
              organizationId={orgId}
              estimateId={estimateId}
              version={estimate.version}
              status={status}
            />
          )}
          {!draft && can(role, "estimate.send") && (
            <SendEstimateDialog
              organizationId={orgId}
              estimateId={estimateId}
              displayNumber={estimate.displayNumber ?? "this estimate"}
              contacts={contacts.map((c) => ({
                id: c.id,
                name: contactDisplayName(c),
                email: c.email,
              }))}
            />
          )}
          {!draft && (
            <Button asChild variant="outline" size="sm">
              <a href={`/orgs/${orgId}/estimates/${estimateId}/pdf`}>
                <Download />
                PDF
              </a>
            </Button>
          )}
          {status === "converted" && estimate.convertedInvoiceId && (
            <Button asChild variant="secondary" size="sm">
              <Link href={`/orgs/${orgId}/invoices/${estimate.convertedInvoiceId}`}>
                View invoice
              </Link>
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="emails">Emails</TabsTrigger>
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
                      href={`/orgs/${orgId}/customers/${estimate.customerId}`}
                      className="hover:underline"
                    >
                      {estimate.customer?.name ?? "Customer"}
                    </Link>
                  </p>
                </div>
                <div className="space-y-2 text-sm sm:col-span-2">
                  <h3 className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
                    Details
                  </h3>
                  <dl className="grid gap-1 sm:grid-cols-2">
                    <div className="flex justify-between sm:pr-6">
                      <dt className="text-muted-foreground">Issue date</dt>
                      <dd>{estimate.issueDate ?? "—"}</dd>
                    </div>
                    <div className="flex justify-between sm:pr-6">
                      <dt className="text-muted-foreground">Valid until</dt>
                      <dd>{estimate.expiryDate ?? "—"}</dd>
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
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {estimate.lines.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="font-medium">{l.description}</TableCell>
                        <TableCell className="text-right font-mono">
                          {l.quantity}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {fmt(l.unitPriceMinor)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {fmt(l.lineTotalMinor)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="mt-4 ml-auto max-w-xs space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-mono">{fmt(estimate.subtotalMinor)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tax</span>
                    <span className="font-mono">{fmt(estimate.taxTotalMinor)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-1.5 text-base font-semibold">
                    <span>Total</span>
                    <span className="font-mono">{fmt(estimate.totalMinor)}</span>
                  </div>
                </div>
              </div>

              {(estimate.notes || estimate.terms) && (
                <div className="grid gap-6 border-t pt-6 sm:grid-cols-2">
                  {estimate.notes && (
                    <div>
                      <h3 className="mb-2 text-xs font-medium tracking-widest text-muted-foreground uppercase">
                        Notes
                      </h3>
                      <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                        {estimate.notes}
                      </p>
                    </div>
                  )}
                  {estimate.terms && (
                    <div>
                      <h3 className="mb-2 text-xs font-medium tracking-widest text-muted-foreground uppercase">
                        Terms
                      </h3>
                      <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                        {estimate.terms}
                      </p>
                    </div>
                  )}
                </div>
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

        <TabsContent value="emails">
          <Card>
            <CardContent className="pt-6">
              <h3 className="mb-4 text-xs font-medium tracking-widest text-muted-foreground uppercase">
                Send history
              </h3>
              {emails.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  This quote has not been emailed yet.
                </p>
              ) : (
                <ul className="divide-y text-sm">
                  {emails.map((e) => (
                    <li
                      key={e.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-2"
                    >
                      <span>
                        <span className="font-medium">{e.recipient}</span>{" "}
                        <span className="text-muted-foreground">— {e.subject}</span>
                      </span>
                      <span className="flex items-center gap-3">
                        <Badge
                          variant={
                            e.status === "send_failed" ? "destructive" : "secondary"
                          }
                        >
                          {e.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {e.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
