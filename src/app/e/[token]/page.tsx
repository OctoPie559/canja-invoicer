import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { getDb } from "@/lib/db/client";
import { Money } from "@/lib/domain/money";
import { isAwaitingDecision, type EstimateStatus } from "@/lib/domain/estimate-status";
import { getEstimateByPublicToken } from "@/lib/services/estimates";
import { DocumentStatusBadge } from "@/components/document-status-badge";
import { PublicEstimateResponse } from "@/components/public-estimate-response";
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

interface EstimateSnap {
  displayNumber: string;
  currency: string;
  issueDate: string;
  expiryDate: string | null;
  customer: { name: string; addressLine1: string | null; city: string | null; country: string | null };
  branding: {
    legalName: string | null;
    addressLine1: string | null;
    city: string | null;
    country: string | null;
    contactEmail: string | null;
  } | null;
  lines: Array<{
    description: string;
    quantity: string;
    unitPriceMinor: string;
    taxRateBps: number;
    lineTotalMinor: string;
    position: number;
  }>;
  totals: { subtotalMinor: string; taxTotalMinor: string; totalMinor: string };
  notes: string | null;
  terms: string | null;
}

/**
 * Hosted public quote (brief §105): unauthenticated, reached only via the
 * unguessable token, rendered from the issue snapshot. The customer can view,
 * accept, or decline right here.
 */
export default async function PublicEstimatePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await getEstimateByPublicToken(getDb(), token);
  if (!data) notFound();
  const status = data.status as EstimateStatus;
  const snapshot = data.snapshot as unknown as EstimateSnap;
  const currency = snapshot.currency;
  const fmt = (minor: string) =>
    Money.fromMinor(BigInt(minor), currency).toString();
  const pct = (bps: number) =>
    bps > 0 ? `${(bps / 100).toFixed(2).replace(/\.?0+$/, "")}%` : "—";
  const today = new Date().toISOString().slice(0, 10);
  const expired = Boolean(snapshot.expiryDate && snapshot.expiryDate < today);

  return (
    <main className="min-h-screen bg-muted/40 px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <h1 className="font-heading text-xl font-semibold">
              Quote {snapshot.displayNumber}
            </h1>
            <DocumentStatusBadge status={status} />
          </div>
          <Button asChild variant="outline" size="sm">
            <a href={`/e/${token}/pdf`}>
              <Download />
              Download PDF
            </a>
          </Button>
        </div>

        <PublicEstimateResponse
          token={token}
          awaitingDecision={isAwaitingDecision(status)}
          expired={expired}
        />

        {status === "accepted" && (
          <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm">
            You accepted this quote. {snapshot.branding?.legalName ?? "The sender"}{" "}
            will be in touch.
          </p>
        )}
        {status === "declined" && (
          <p className="rounded-md border px-4 py-2 text-sm text-muted-foreground">
            You declined this quote.
          </p>
        )}

        <Card>
          <CardContent className="space-y-8 pt-6">
            <div className="grid gap-6 sm:grid-cols-3">
              <div className="space-y-1 text-sm">
                <h3 className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
                  From
                </h3>
                <p className="font-medium">
                  {snapshot.branding?.legalName ?? "Your vendor"}
                </p>
                {snapshot.branding?.addressLine1 && (
                  <p className="text-muted-foreground">
                    {snapshot.branding.addressLine1}
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
                  For
                </h3>
                <p className="font-medium">{snapshot.customer.name}</p>
                {snapshot.customer.addressLine1 && (
                  <p className="text-muted-foreground">
                    {snapshot.customer.addressLine1}
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
                    <dt className="text-muted-foreground">Valid until</dt>
                    <dd>{snapshot.expiryDate ?? "—"}</dd>
                  </div>
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
                    <TableHead className="text-right">Tax</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {snapshot.lines.map((l) => (
                    <TableRow key={l.position}>
                      <TableCell className="font-medium">{l.description}</TableCell>
                      <TableCell className="text-right font-mono">
                        {l.quantity}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {fmt(l.unitPriceMinor)}
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
                  <span className="font-mono">{fmt(snapshot.totals.subtotalMinor)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax</span>
                  <span className="font-mono">{fmt(snapshot.totals.taxTotalMinor)}</span>
                </div>
                <div className="flex justify-between border-t pt-1.5 text-base font-semibold">
                  <span>Total</span>
                  <span className="font-mono">{fmt(snapshot.totals.totalMinor)}</span>
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

        {data.watermark && (
          <p className="text-center text-xs text-muted-foreground">
            Created with invoicer — professional invoicing for Kenyan
            freelancers and teams
          </p>
        )}
      </div>
    </main>
  );
}
