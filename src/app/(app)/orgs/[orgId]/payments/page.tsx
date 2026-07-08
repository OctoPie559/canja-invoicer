import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { Money } from "@/lib/domain/money";
import { listPayments } from "@/lib/services/payments";
import { requireMembership } from "@/lib/transport/org";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const METHOD_LABELS: Record<string, string> = {
  mpesa: "M-Pesa",
  bank: "Bank",
  cash: "Cash",
  card: "Card",
  other: "Other",
};

export default async function PaymentsPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  await requireMembership(orgId);
  const payments = await listPayments(getDb(), orgId);

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-xl font-semibold text-foreground">
        Payments received
      </h1>
      <Card className="py-0">
        <CardContent className="px-0">
          {payments.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">
              No payments recorded yet — record one from an issued invoice.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-muted-foreground">
                      {p.paidAt.toISOString().slice(0, 10)}
                    </TableCell>
                    <TableCell className="font-medium">
                      <Link
                        href={`/orgs/${orgId}/invoices/${p.invoiceId}`}
                        className="hover:underline"
                      >
                        {p.displayNumber ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell>{p.customerName}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {METHOD_LABELS[p.method] ?? p.method}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {Money.fromMinor(p.amountMinor ?? 0n, p.currency).toString()}
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
