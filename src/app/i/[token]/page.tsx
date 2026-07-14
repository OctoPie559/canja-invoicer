import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { getDb } from "@/lib/db/client";
import { Money } from "@/lib/domain/money";
import { paymentTermsLabel } from "@/lib/domain/payment-terms";
import { getInvoiceByPublicToken } from "@/lib/services/invoices";
import { isOutstanding, type InvoiceStatus } from "@/lib/domain/invoice-status";
import { isPaymentsConfigured } from "@/lib/payments";
import { InvoiceStatusBadge } from "@/components/invoice-status-badge";
import { PayInvoice } from "@/components/pay-invoice";
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

/**
 * Hosted public invoice view (brief §104): unauthenticated, reached only
 * via the unguessable token, rendered ONLY from the issue snapshot. No org
 * navigation, no links into the app — this page is for the customer.
 */
export default async function PublicInvoicePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await getInvoiceByPublicToken(getDb(), token);
  if (!data) notFound();
  const { snapshot, status, amountPaidMinor, watermark, logoUrl } = data;

  const currency = snapshot.currency;
  const fmt = (minor: string) =>
    Money.fromMinor(BigInt(minor), currency).toString();
  const total = Money.fromMinor(BigInt(snapshot.totals.totalMinor), currency);
  const balance = total.subtract(Money.fromMinor(amountPaidMinor, currency));
  const pct = (bps: number) =>
    bps > 0 ? `${(bps / 100).toFixed(2).replace(/\.?0+$/, "")}%` : "—";

  return (
    <main className="min-h-screen bg-muted/40 px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <h1 className="font-heading text-xl font-semibold">
              Invoice {snapshot.displayNumber}
            </h1>
            <InvoiceStatusBadge status={status} />
          </div>
          <Button asChild variant="outline" size="sm">
            <a href={`/i/${token}/pdf`}>
              <Download />
              Download PDF
            </a>
          </Button>
        </div>

        {status === "void" && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm">
            This invoice has been voided by the issuer and is no longer
            payable.
          </p>
        )}

        {isPaymentsConfigured() &&
          isOutstanding(status as InvoiceStatus) &&
          !balance.isNegative() &&
          !balance.isZero() && (
            <PayInvoice
              token={token}
              balanceLabel={balance.toString()}
              prefillEmail={snapshot.customer.primaryContact?.email}
            />
          )}

        <Card>
          <CardContent className="space-y-8 pt-6">
            <div className="grid gap-6 sm:grid-cols-3">
              <div className="space-y-1 text-sm">
                <h3 className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
                  From
                </h3>
                {logoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- R2-hosted
                  <img
                    src={logoUrl}
                    alt=""
                    className="mb-1 h-10 w-auto"
                  />
                )}
                <p className="font-medium">
                  {snapshot.branding?.legalName ?? "Your vendor"}
                </p>
                {snapshot.branding?.addressLine1 && (
                  <p className="text-muted-foreground">
                    {snapshot.branding.addressLine1}
                  </p>
                )}
                {(snapshot.branding?.city || snapshot.branding?.country) && (
                  <p className="text-muted-foreground">
                    {[snapshot.branding?.city, snapshot.branding?.country]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                )}
                {snapshot.branding?.contactEmail && (
                  <p className="text-muted-foreground">
                    {snapshot.branding.contactEmail}
                  </p>
                )}
              </div>
              <div className="space-y-1 text-sm">
                <h3 className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
                  Bill to
                </h3>
                <p className="font-medium">{snapshot.customer.name}</p>
                {snapshot.customer.addressLine1 && (
                  <p className="text-muted-foreground">
                    {snapshot.customer.addressLine1}
                  </p>
                )}
                {(snapshot.customer.city || snapshot.customer.country) && (
                  <p className="text-muted-foreground">
                    {[snapshot.customer.city, snapshot.customer.country]
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
                    <dd>{snapshot.issueDate}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Due date</dt>
                    <dd>{snapshot.dueDate}</dd>
                  </div>
                  {snapshot.paymentTermsDays != null && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Terms</dt>
                      <dd>{paymentTermsLabel(snapshot.paymentTermsDays)}</dd>
                    </div>
                  )}
                  {status !== "void" && (
                    <div className="flex justify-between border-t pt-1 font-medium">
                      <dt>Balance due</dt>
                      <dd className="font-mono">{balance.toString()}</dd>
                    </div>
                  )}
                </dl>
              </div>
            </div>

            <div>
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
                  {snapshot.lines.map((l) => (
                    <TableRow key={l.position}>
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
                        {pct(l.discountBps ?? 0)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {pct(l.taxRateBps)}
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
                  <span className="font-mono">
                    {fmt(snapshot.totals.subtotalMinor)}
                  </span>
                </div>
                {BigInt(snapshot.totals.discountTotalMinor ?? "0") > 0n && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Discount</span>
                    <span className="font-mono">
                      −{fmt(snapshot.totals.discountTotalMinor ?? "0")}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax</span>
                  <span className="font-mono">
                    {fmt(snapshot.totals.taxTotalMinor)}
                  </span>
                </div>
                <div className="flex justify-between border-t pt-1.5 text-base font-semibold">
                  <span>Total</span>
                  <span className="font-mono">
                    {fmt(snapshot.totals.totalMinor)}
                  </span>
                </div>
              </div>
            </div>

            {(snapshot.notes || snapshot.terms) && (
              <div className="grid gap-6 border-t pt-6 sm:grid-cols-2">
                {snapshot.notes && (
                  <div>
                    <h3 className="mb-2 text-xs font-medium tracking-widest text-muted-foreground uppercase">
                      Notes
                    </h3>
                    <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                      {snapshot.notes}
                    </p>
                  </div>
                )}
                {snapshot.terms && (
                  <div>
                    <h3 className="mb-2 text-xs font-medium tracking-widest text-muted-foreground uppercase">
                      Terms
                    </h3>
                    <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                      {snapshot.terms}
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {watermark && (
          <p className="text-center text-xs text-muted-foreground">
            Created with invoicer — professional invoicing for Kenyan
            freelancers and teams
          </p>
        )}
      </div>
    </main>
  );
}
