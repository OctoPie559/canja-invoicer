import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Download } from "lucide-react";
import { getDb } from "@/lib/db/client";
import { can } from "@/lib/authz/permissions";
import { Money } from "@/lib/domain/money";
import {
  getCreditNote,
  getCreditNoteTimeline,
} from "@/lib/services/credit-notes";
import { getInvoiceSettings, listTaxRates } from "@/lib/services/settings";
import { requireMembership } from "@/lib/transport/org";
import { deleteCreditNoteAction } from "@/app/actions/credit-notes";
import { ActivityRoadmap } from "@/components/activity-roadmap";
import {
  IssueCreditNoteDialog,
  VoidCreditNoteDialog,
} from "@/components/credit-note-actions";
import { CreditNoteForm } from "@/components/credit-note-form";
import { DeleteButton } from "@/components/delete-button";
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

export default async function CreditNoteWorkspacePage({
  params,
}: {
  params: Promise<{ orgId: string; creditNoteId: string }>;
}) {
  const { orgId, creditNoteId } = await params;
  const { role } = await requireMembership(orgId);
  const db = getDb();
  const cn = await getCreditNote(db, orgId, creditNoteId);
  if (!cn) notFound();
  const [timeline, settings, taxRates] = await Promise.all([
    getCreditNoteTimeline(db, orgId, creditNoteId),
    getInvoiceSettings(db, orgId),
    listTaxRates(db, orgId),
  ]);
  const draft = cn.status === "draft";
  const fmt = (minor: bigint | null) =>
    Money.fromMinor(minor ?? 0n, cn.currency).toString();

  return (
    <div className="space-y-4">
      <Link
        href={`/orgs/${orgId}/credit-notes`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        All credit notes
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h1 className="font-heading text-xl font-semibold text-foreground">
            {cn.displayNumber ?? "Draft credit note"}
          </h1>
          <DocumentStatusBadge status={cn.status} />
          {cn.invoice && (
            <Link
              href={`/orgs/${orgId}/invoices/${cn.invoice.id}`}
              className="text-sm text-muted-foreground hover:underline"
            >
              against {cn.invoice.displayNumber}
            </Link>
          )}
        </div>
        <div className="flex items-center gap-2">
          {draft && can(role, "credit_note.issue") && (
            <IssueCreditNoteDialog
              organizationId={orgId}
              creditNoteId={creditNoteId}
              version={cn.version}
              nextDisplayNumber={`${settings.creditNotePrefix}-${String(settings.creditNoteNextNumber).padStart(6, "0")}`}
              invoiceNumber={cn.invoice?.displayNumber ?? "the invoice"}
              total={fmt(cn.totalMinor)}
            />
          )}
          {draft && can(role, "credit_note.create") && (
            <DeleteButton
              action={deleteCreditNoteAction.bind(
                null,
                orgId,
                creditNoteId,
                cn.version,
              )}
            />
          )}
          {cn.status === "issued" && can(role, "credit_note.issue") && (
            <VoidCreditNoteDialog
              organizationId={orgId}
              creditNoteId={creditNoteId}
              displayNumber={cn.displayNumber ?? "this credit note"}
            />
          )}
          {!draft && (
            <Button asChild variant="outline" size="sm">
              <a href={`/orgs/${orgId}/credit-notes/${creditNoteId}/pdf`}>
                <Download />
                PDF
              </a>
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="space-y-6 pt-6">
          {draft && cn.invoice ? (
            <CreditNoteForm
              organizationId={orgId}
              invoiceId={cn.invoice.id}
              invoiceNumber={cn.invoice.displayNumber ?? "this invoice"}
              currency={cn.currency}
              creditableLabel="see invoice"
              taxRates={taxRates}
              creditNote={{
                id: cn.id,
                version: cn.version,
                reason: cn.reason,
                lines: cn.lines.map((l) => ({
                  description: l.description,
                  quantity: l.quantity,
                  unitPrice: Money.fromMinor(
                    l.unitPriceMinor ?? 0n,
                    cn.currency,
                  ).toDecimalString(),
                  taxRateBps: l.taxRateBps,
                })),
              }}
            />
          ) : (
            <>
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
                  {cn.lines.map((l) => (
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
              <div className="ml-auto max-w-xs space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-mono">{fmt(cn.subtotalMinor)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax</span>
                  <span className="font-mono">{fmt(cn.taxTotalMinor)}</span>
                </div>
                <div className="flex justify-between border-t pt-1.5 text-base font-semibold">
                  <span>Credit total</span>
                  <span className="font-mono">{fmt(cn.totalMinor)}</span>
                </div>
              </div>
              {cn.reason && (
                <p className="border-t pt-4 text-sm text-muted-foreground">
                  Reason: {cn.reason}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <h3 className="mb-4 text-xs font-medium tracking-widest text-muted-foreground uppercase">
            Activity
          </h3>
          <ActivityRoadmap entries={timeline} />
        </CardContent>
      </Card>
    </div>
  );
}
