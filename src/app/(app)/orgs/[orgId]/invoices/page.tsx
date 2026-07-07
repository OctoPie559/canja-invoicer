import Link from "next/link";
import { Search } from "lucide-react";
import { getDb } from "@/lib/db/client";
import { can } from "@/lib/authz/permissions";
import { Money } from "@/lib/domain/money";
import type { InvoiceStatus } from "@/lib/domain/invoice-status";
import { listInvoices } from "@/lib/services/invoices";
import { requireMembership } from "@/lib/transport/org";
import { InvoiceStatusBadge } from "@/components/invoice-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const STATUS_FILTERS: Array<{ label: string; value: InvoiceStatus | "all" }> = [
  { label: "All", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Sent", value: "sent" },
  { label: "Partial", value: "partial" },
  { label: "Paid", value: "paid" },
  { label: "Overdue", value: "overdue" },
  { label: "Void", value: "void" },
];

function isStatus(value: string): value is InvoiceStatus {
  return ["draft", "sent", "partial", "paid", "overdue", "void"].includes(value);
}

export default async function InvoicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const { orgId } = await params;
  const { status: statusParam = "all", q = "" } = await searchParams;
  const { role } = await requireMembership(orgId);

  const status = isStatus(statusParam) ? statusParam : undefined;
  const invoices = await listInvoices(getDb(), orgId, {
    status,
    q: q || undefined,
  });

  const filterHref = (value: string) => {
    const sp = new URLSearchParams();
    if (value !== "all") sp.set("status", value);
    if (q) sp.set("q", q);
    const qs = sp.toString();
    return `/orgs/${orgId}/invoices${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-xl font-semibold text-foreground">
          Invoices
        </h1>
        {can(role, "invoice.create") && (
          <Button asChild>
            <Link href={`/orgs/${orgId}/invoices/new`}>New invoice</Link>
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-1">
          {STATUS_FILTERS.map((f) => {
            const active =
              f.value === "all" ? !status : status === f.value;
            return (
              <Link
                key={f.value}
                href={filterHref(f.value)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {f.label}
              </Link>
            );
          })}
        </nav>
        <form method="GET" className="relative">
          {status && <input type="hidden" name="status" value={status} />}
          <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input
            type="search"
            name="q"
            placeholder="Search number or customer"
            defaultValue={q}
            className="w-64 pl-8"
          />
        </form>
      </div>

      <Card className="py-0">
        <CardContent className="px-0">
          {invoices.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <p className="text-sm text-muted-foreground">
                {q || status
                  ? "No invoices match this filter."
                  : "No invoices yet. Create your first one to start billing."}
              </p>
              {!q && !status && can(role, "invoice.create") && (
                <Button asChild variant="outline" className="mt-4">
                  <Link href={`/orgs/${orgId}/invoices/new`}>
                    Create an invoice
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Issue date</TableHead>
                  <TableHead>Due date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => {
                  const total = Money.fromMinor(
                    inv.totalMinor ?? 0n,
                    inv.currency,
                  );
                  const balance = total.subtract(
                    Money.fromMinor(inv.amountPaidMinor ?? 0n, inv.currency),
                  );
                  return (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium">
                        <Link
                          href={`/orgs/${orgId}/invoices/${inv.id}`}
                          className="hover:underline"
                        >
                          {inv.displayNumber ?? "Draft"}
                        </Link>
                      </TableCell>
                      <TableCell>{inv.customerName}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {inv.issueDate ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {inv.dueDate ?? "—"}
                      </TableCell>
                      <TableCell>
                        <InvoiceStatusBadge
                          status={inv.status as InvoiceStatus}
                        />
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {total.toString()}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {inv.status === "void" ? "—" : balance.toString()}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
