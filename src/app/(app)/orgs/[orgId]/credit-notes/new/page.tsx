import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getDb } from "@/lib/db/client";
import { can } from "@/lib/authz/permissions";
import { Money } from "@/lib/domain/money";
import { issuedCreditsForInvoice } from "@/lib/services/credit-notes";
import { getInvoice } from "@/lib/services/invoices";
import { listTaxRates } from "@/lib/services/settings";
import { requireMembership } from "@/lib/transport/org";
import { CreditNoteForm } from "@/components/credit-note-form";
import { Card, CardContent } from "@/components/ui/card";

/** New credit note against a specific invoice (?invoiceId=…). */
export default async function NewCreditNotePage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ invoiceId?: string }>;
}) {
  const { orgId } = await params;
  const { invoiceId } = await searchParams;
  const { role } = await requireMembership(orgId);
  if (!can(role, "credit_note.create")) redirect(`/orgs/${orgId}/credit-notes`);
  if (!invoiceId) redirect(`/orgs/${orgId}/invoices`);

  const db = getDb();
  const invoice = await getInvoice(db, orgId, invoiceId);
  if (!invoice || invoice.status === "draft" || invoice.status === "void") {
    notFound();
  }
  const [taxRates, credited] = await Promise.all([
    listTaxRates(db, orgId),
    issuedCreditsForInvoice(db, orgId, invoiceId, invoice.currency),
  ]);
  const creditable = Money.fromMinor(
    (invoice.totalMinor ?? 0n) - credited.amountMinor,
    invoice.currency,
  );

  return (
    <div className="space-y-4">
      <Link
        href={`/orgs/${orgId}/invoices/${invoiceId}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Back to {invoice.displayNumber}
      </Link>
      <h1 className="font-heading text-xl font-semibold text-foreground">
        New credit note
      </h1>
      <Card>
        <CardContent className="pt-6">
          <CreditNoteForm
            organizationId={orgId}
            invoiceId={invoiceId}
            invoiceNumber={invoice.displayNumber ?? "this invoice"}
            currency={invoice.currency}
            creditableLabel={creditable.toString()}
            taxRates={taxRates}
            prefillLines={invoice.lines.map((l) => ({
              description: l.description,
              quantity: l.quantity,
              unitPrice: Money.fromMinor(
                l.unitPriceMinor ?? 0n,
                invoice.currency,
              ).toDecimalString(),
              taxRateBps: l.taxRateBps,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
