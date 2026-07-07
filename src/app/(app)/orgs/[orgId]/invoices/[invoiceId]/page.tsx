import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Download, Pencil } from "lucide-react";
import { getDb } from "@/lib/db/client";
import { can } from "@/lib/authz/permissions";
import { Money } from "@/lib/domain/money";
import {
  isEditable,
  isVoidable,
  type InvoiceStatus,
} from "@/lib/domain/invoice-status";
import { paymentTermsLabel } from "@/lib/domain/payment-terms";
import {
  getInvoice,
  getInvoiceTimeline,
  listInvoiceEmails,
} from "@/lib/services/invoices";
import { listInvoicePayments } from "@/lib/services/payments";
import { isOutstanding } from "@/lib/domain/invoice-status";
import { RecordPaymentDialog } from "@/components/payment-actions";
import { listContacts } from "@/lib/services/contacts";
import { contactDisplayName } from "@/lib/format/contact";
import { getInvoiceSettings } from "@/lib/services/settings";
import { requireMembership } from "@/lib/transport/org";
import { deleteInvoiceDraftAction } from "@/app/actions/invoices";
import { ActivityRoadmap } from "@/components/activity-roadmap";
import { DeleteButton } from "@/components/delete-button";
import {
  IssueInvoiceDialog,
  SendInvoiceDialog,
  VoidInvoiceDialog,
} from "@/components/invoice-actions";
import { InvoiceStatusBadge } from "@/components/invoice-status-badge";
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

/**
 * Invoice workspace. Drafts render from live rows; issued documents render
 * from the frozen snapshot (§5.3) — what you see is what was issued, no
 * matter what changed since.
 */

interface SnapshotLine {
  description: string;
  quantity: string;
  unitPriceMinor: string;
  discountBps: number;
  taxRateBps: number;
  lineTotalMinor: string;
  position: number;
}

interface InvoiceSnapshot {
  customer: {
    name: string;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    country: string | null;
    primaryContact: { firstName: string; lastName: string | null; email: string | null } | null;
  };
  branding: {
    legalName: string | null;
    addressLine1: string | null;
    city: string | null;
    country: string | null;
    contactEmail: string | null;
  } | null;
  lines: SnapshotLine[];
  totals: {
    subtotalMinor: string;
    discountTotalMinor: string;
    taxTotalMinor: string;
    totalMinor: string;
  };
  baseCurrency: string;
  fxRateToBase: string | null;
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function InvoiceWorkspacePage({
  params,
}: {
  params: Promise<{ orgId: string; invoiceId: string }>;
}) {
  const { orgId, invoiceId } = await params;
  const { role } = await requireMembership(orgId);
  const db = getDb();

  const invoice = await getInvoice(db, orgId, invoiceId);
  if (!invoice) notFound();
  const [timeline, settings, emails, contacts, invoicePayments] =
    await Promise.all([
      getInvoiceTimeline(db, orgId, invoiceId),
      getInvoiceSettings(db, orgId),
      listInvoiceEmails(db, orgId, invoiceId),
      listContacts(db, orgId, invoice.customerId),
      listInvoicePayments(db, orgId, invoiceId),
    ]);

  const status = invoice.status as InvoiceStatus;
  const draft = isEditable(status);
  const snapshot = (invoice.snapshot ?? null) as InvoiceSnapshot | null;
  const currency = invoice.currency;

  // issued documents display their frozen snapshot; drafts the live rows
  const displayLines: SnapshotLine[] = snapshot
    ? snapshot.lines
    : invoice.lines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unitPriceMinor: (l.unitPriceMinor ?? 0n).toString(),
        discountBps: l.discountBps,
        taxRateBps: l.taxRateBps,
        lineTotalMinor: (l.lineTotalMinor ?? 0n).toString(),
        position: l.position,
      }));
  const totals = snapshot
    ? snapshot.totals
    : {
        subtotalMinor: (invoice.subtotalMinor ?? 0n).toString(),
        discountTotalMinor: (invoice.discountTotalMinor ?? 0n).toString(),
        taxTotalMinor: (invoice.taxTotalMinor ?? 0n).toString(),
        totalMinor: (invoice.totalMinor ?? 0n).toString(),
      };
  const fmt = (minor: string) =>
    Money.fromMinor(BigInt(minor), currency).toString();

  const total = Money.fromMinor(BigInt(totals.totalMinor), currency);
  const balance = total.subtract(
    Money.fromMinor(invoice.amountPaidMinor ?? 0n, currency),
  );

  const nextDisplayNumber = `${settings.invoicePrefix}-${String(
    settings.invoiceNextNumber,
  ).padStart(6, "0")}`;

  return (
    <div className="space-y-4">
      <Link
        href={`/orgs/${orgId}/invoices`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        All invoices
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h1 className="font-heading text-xl font-semibold text-foreground">
            {invoice.displayNumber ?? "Draft invoice"}
          </h1>
          <InvoiceStatusBadge status={status} />
        </div>
        <div className="flex items-center gap-2">
          {draft && can(role, "invoice.update") && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/orgs/${orgId}/invoices/${invoiceId}/edit`}>
                <Pencil />
                Edit
              </Link>
            </Button>
          )}
          {draft && can(role, "invoice.issue") && (
            <IssueInvoiceDialog
              organizationId={orgId}
              invoiceId={invoiceId}
              version={invoice.version}
              currency={currency}
              baseCurrency={settings.baseCurrency}
              nextDisplayNumber={nextDisplayNumber}
              defaultIssueDate={invoice.issueDate ?? isoToday()}
              defaultDueDate={invoice.dueDate ?? isoToday()}
            />
          )}
          {draft && can(role, "invoice.update") && (
            <DeleteButton
              action={deleteInvoiceDraftAction.bind(
                null,
                orgId,
                invoiceId,
                invoice.version,
              )}
            />
          )}
          {isOutstanding(status) && can(role, "payment.record") && (
            <RecordPaymentDialog
              organizationId={orgId}
              invoiceId={invoiceId}
              displayNumber={invoice.displayNumber ?? "this invoice"}
              invoiceCurrency={currency}
              balanceDue={balance.toString()}
            />
          )}
          {!draft && can(role, "invoice.send") && status !== "void" && (
            <SendInvoiceDialog
              organizationId={orgId}
              invoiceId={invoiceId}
              displayNumber={invoice.displayNumber ?? "this invoice"}
              contacts={contacts.map((c) => ({
                id: c.id,
                name: contactDisplayName(c),
                email: c.email,
              }))}
            />
          )}
          {!draft && (
            <Button asChild variant="outline" size="sm">
              <a href={`/orgs/${orgId}/invoices/${invoiceId}/pdf`}>
                <Download />
                PDF
              </a>
            </Button>
          )}
          {isVoidable(status) && can(role, "invoice.void") && (
            <VoidInvoiceDialog
              organizationId={orgId}
              invoiceId={invoiceId}
              displayNumber={invoice.displayNumber ?? "this invoice"}
            />
          )}
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="emails">Emails</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardContent className="space-y-8 pt-6">
              {/* section 1: parties & meta */}
              <div className="grid gap-6 sm:grid-cols-3">
                <div className="space-y-1 text-sm">
                  <h3 className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
                    From
                  </h3>
                  <p className="font-medium">
                    {snapshot?.branding?.legalName ?? "Your organization"}
                  </p>
                  {snapshot?.branding?.addressLine1 && (
                    <p className="text-muted-foreground">
                      {snapshot.branding.addressLine1}
                    </p>
                  )}
                  {(snapshot?.branding?.city || snapshot?.branding?.country) && (
                    <p className="text-muted-foreground">
                      {[snapshot?.branding?.city, snapshot?.branding?.country]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  )}
                </div>
                <div className="space-y-1 text-sm">
                  <h3 className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
                    Bill to
                  </h3>
                  <p className="font-medium">
                    {snapshot?.customer.name ?? (
                      <Link
                        href={`/orgs/${orgId}/customers/${invoice.customerId}`}
                        className="hover:underline"
                      >
                        {invoice.customer?.name ?? "Customer"}
                      </Link>
                    )}
                  </p>
                  {snapshot?.customer.addressLine1 && (
                    <p className="text-muted-foreground">
                      {snapshot.customer.addressLine1}
                    </p>
                  )}
                  {(snapshot?.customer.city || snapshot?.customer.country) && (
                    <p className="text-muted-foreground">
                      {[snapshot?.customer.city, snapshot?.customer.country]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  )}
                </div>
                <div className="space-y-2 text-sm">
                  <h3 className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
                    Details
                  </h3>
                  <dl className="space-y-1">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Issue date</dt>
                      <dd>{invoice.issueDate ?? "—"}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Due date</dt>
                      <dd>{invoice.dueDate ?? "—"}</dd>
                    </div>
                    {invoice.paymentTermsDays !== null && (
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Terms</dt>
                        <dd>{paymentTermsLabel(invoice.paymentTermsDays)}</dd>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Currency</dt>
                      <dd>{currency}</dd>
                    </div>
                    {invoice.fxRateToBase && snapshot && (
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">
                          Rate to {snapshot.baseCurrency}
                        </dt>
                        {/* a rate is a ratio, not money — but still never
                            through Number(): render the stored string */}
                        <dd className="font-mono">
                          {invoice.fxRateToBase.replace(/\.?0+$/, "")}
                        </dd>
                      </div>
                    )}
                    {!draft && status !== "void" && (
                      <div className="flex justify-between border-t pt-1 font-medium">
                        <dt>Balance due</dt>
                        <dd className="font-mono">{balance.toString()}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              </div>

              {/* section 2: line items */}
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
                      <TableHead className="text-right">Disc</TableHead>
                      <TableHead className="text-right">Tax</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayLines.map((l, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">
                          {l.description}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {l.quantity}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {fmt(l.unitPriceMinor)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {l.discountBps > 0
                            ? `${(l.discountBps / 100).toFixed(2).replace(/\.?0+$/, "")}%`
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {l.taxRateBps > 0
                            ? `${(l.taxRateBps / 100).toFixed(2).replace(/\.?0+$/, "")}%`
                            : "—"}
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
                    <span className="font-mono">{fmt(totals.subtotalMinor)}</span>
                  </div>
                  {BigInt(totals.discountTotalMinor) > 0n && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Discount</span>
                      <span className="font-mono">
                        −{fmt(totals.discountTotalMinor)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tax</span>
                    <span className="font-mono">{fmt(totals.taxTotalMinor)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-1.5 text-base font-semibold">
                    <span>Total</span>
                    <span className="font-mono">{fmt(totals.totalMinor)}</span>
                  </div>
                </div>
              </div>

              {/* section 3: notes & terms */}
              {(invoice.notes || invoice.terms) && (
                <div className="grid gap-6 border-t pt-6 sm:grid-cols-2">
                  {invoice.notes && (
                    <div>
                      <h3 className="mb-2 text-xs font-medium tracking-widest text-muted-foreground uppercase">
                        Notes
                      </h3>
                      <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                        {invoice.notes}
                      </p>
                    </div>
                  )}
                  {invoice.terms && (
                    <div>
                      <h3 className="mb-2 text-xs font-medium tracking-widest text-muted-foreground uppercase">
                        Terms
                      </h3>
                      <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                        {invoice.terms}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments">
          <Card>
            <CardContent className="pt-6">
              <h3 className="mb-4 text-xs font-medium tracking-widest text-muted-foreground uppercase">
                Payments
              </h3>
              {invoicePayments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No payments recorded on this invoice yet.
                </p>
              ) : (
                <ul className="divide-y text-sm">
                  {invoicePayments.map((p) => (
                    <li
                      key={p.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-2"
                    >
                      <span>
                        <span className="font-mono font-medium">
                          {Money.fromMinor(p.amountMinor ?? 0n, p.currency).toString()}
                        </span>{" "}
                        <span className="text-muted-foreground">
                          via {p.method}
                          {p.currency !== currency &&
                            p.amountInInvoiceCurrencyMinor !== null &&
                            ` — ${Money.fromMinor(p.amountInInvoiceCurrencyMinor, currency).toString()} at ${p.fxRateUsed}`}
                          {p.settlementDeltaMinor !== null &&
                            p.settlementDeltaMinor > 0n &&
                            ` (over-payment ${Money.fromMinor(p.settlementDeltaMinor, currency).toString()})`}
                        </span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {p.paidAt.toISOString().slice(0, 10)}
                        {p.recordedByName ? ` · ${p.recordedByName}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
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
                  This invoice has not been emailed yet.
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
                        <span className="text-muted-foreground">
                          — {e.subject}
                        </span>
                      </span>
                      <span className="flex items-center gap-3">
                        <Badge
                          variant={
                            e.status === "send_failed"
                              ? "destructive"
                              : "secondary"
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

        <TabsContent value="activity">
          <Card>
            <CardContent className="pt-6">
              <h3 className="mb-4 text-xs font-medium tracking-widest text-muted-foreground uppercase">
                Activity
              </h3>
              <ActivityRoadmap entries={timeline} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
