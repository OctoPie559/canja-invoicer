import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { Money } from "@/lib/domain/money";
import { listCreditNotes } from "@/lib/services/credit-notes";
import { requireMembership } from "@/lib/transport/org";
import { DocumentStatusBadge } from "@/components/document-status-badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function CreditNotesPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  await requireMembership(orgId);
  const creditNotes = await listCreditNotes(getDb(), orgId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-xl font-semibold text-foreground">
          Credit notes
        </h1>
        <p className="text-sm text-muted-foreground">
          Created from an invoice&apos;s page
        </p>
      </div>
      <Card className="py-0">
        <CardContent className="px-0">
          {creditNotes.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">
              No credit notes yet — open an issued invoice and choose
              “Credit” to correct or refund it.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Issue date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {creditNotes.map((cn) => (
                  <TableRow key={cn.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/orgs/${orgId}/credit-notes/${cn.id}`}
                        className="hover:underline"
                      >
                        {cn.displayNumber ?? "Draft"}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/orgs/${orgId}/invoices/${cn.invoiceId}`}
                        className="text-muted-foreground hover:underline"
                      >
                        {cn.invoiceNumber ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell>{cn.customerName}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {cn.issueDate ?? "—"}
                    </TableCell>
                    <TableCell>
                      <DocumentStatusBadge status={cn.status} />
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {Money.fromMinor(cn.totalMinor ?? 0n, cn.currency).toString()}
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
