import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { can } from "@/lib/authz/permissions";
import { Money } from "@/lib/domain/money";
import type { EstimateStatus } from "@/lib/domain/estimate-status";
import { listEstimates } from "@/lib/services/estimates";
import { requireMembership } from "@/lib/transport/org";
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
import { cn } from "@/lib/utils";

const FILTERS: Array<{ label: string; value: EstimateStatus | "all" }> = [
  { label: "All", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Sent", value: "sent" },
  { label: "Accepted", value: "accepted" },
  { label: "Declined", value: "declined" },
  { label: "Expired", value: "expired" },
  { label: "Converted", value: "converted" },
];

function isStatus(v: string): v is EstimateStatus {
  return ["draft", "sent", "accepted", "declined", "expired", "converted"].includes(v);
}

export default async function EstimatesPage({
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
  const estimates = await listEstimates(getDb(), orgId, {
    status,
    q: q || undefined,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-xl font-semibold text-foreground">
          Estimates
        </h1>
        {can(role, "estimate.create") && (
          <Button asChild>
            <Link href={`/orgs/${orgId}/estimates/new`}>New estimate</Link>
          </Button>
        )}
      </div>

      <nav className="flex flex-wrap gap-1">
        {FILTERS.map((f) => {
          const active = f.value === "all" ? !status : status === f.value;
          return (
            <Link
              key={f.value}
              href={`/orgs/${orgId}/estimates${f.value === "all" ? "" : `?status=${f.value}`}`}
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

      <Card className="py-0">
        <CardContent className="px-0">
          {estimates.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">
              {status
                ? "No estimates match this filter."
                : "No estimates yet — quote your next job here."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Issue date</TableHead>
                  <TableHead>Valid until</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {estimates.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/orgs/${orgId}/estimates/${e.id}`}
                        className="hover:underline"
                      >
                        {e.displayNumber ?? "Draft"}
                      </Link>
                    </TableCell>
                    <TableCell>{e.customerName}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {e.issueDate ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {e.expiryDate ?? "—"}
                    </TableCell>
                    <TableCell>
                      <DocumentStatusBadge status={e.status} />
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {Money.fromMinor(e.totalMinor ?? 0n, e.currency).toString()}
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
