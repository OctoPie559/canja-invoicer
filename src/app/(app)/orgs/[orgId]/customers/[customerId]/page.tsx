import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { getDb } from "@/lib/db/client";
import { can } from "@/lib/authz/permissions";
import { Money } from "@/lib/domain/money";
import { listComments } from "@/lib/services/comments";
import {
  getCustomer,
  getCustomerMails,
  getCustomerReceivables,
  getCustomerStatement,
  getCustomerTimeline,
  getCustomerTransactions,
} from "@/lib/services/customers";
import { requireMembership } from "@/lib/transport/org";
import { deleteCustomerAction } from "@/app/actions/customers";
import { ActivityTimeline } from "@/components/activity-timeline";
import { CustomerComments } from "@/components/customer-comments";
import { DeleteButton } from "@/components/delete-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

function money(amountMinor: bigint, currency: string): string {
  return Money.fromMinor(amountMinor, currency).toString();
}

function balanceDue(
  totalMinor: bigint,
  amountPaidMinor: bigint,
  currency: string,
): string {
  return Money.fromMinor(totalMinor, currency)
    .subtract(Money.fromMinor(amountPaidMinor, currency))
    .toString();
}

function statementPeriod(preset: string): { from: Date; to: Date; label: string } {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  if (preset === "last-month") {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    return { from, to: monthStart, label: "Last month" };
  }
  if (preset === "all") {
    return { from: new Date(0), to: new Date(Date.UTC(2100, 0, 1)), label: "All time" };
  }
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { from: monthStart, to: nextMonth, label: "This month" };
}

export default async function CustomerWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string; customerId: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { orgId, customerId } = await params;
  const { period: periodPreset = "this-month" } = await searchParams;
  const { session, role } = await requireMembership(orgId);
  const db = getDb();

  const customer = await getCustomer(db, orgId, customerId);
  if (!customer) notFound();

  const period = statementPeriod(periodPreset);
  const [receivables, timeline, comments, transactions, mails, statement] =
    await Promise.all([
      getCustomerReceivables(db, orgId, customerId),
      getCustomerTimeline(db, orgId, customerId),
      listComments(db, orgId, "customer", customerId),
      getCustomerTransactions(db, orgId, customerId),
      getCustomerMails(db, orgId, customer.email),
      getCustomerStatement(db, orgId, customerId, period),
    ]);

  const address = [
    customer.addressLine1,
    customer.addressLine2,
    customer.city,
    customer.country,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-heading text-xl font-semibold text-foreground">
          {customer.name}
        </h1>
        <div className="flex items-center gap-2">
          {can(role, "customer.update") && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/orgs/${orgId}/customers/${customerId}/edit`}>
                <Pencil />
                Edit
              </Link>
            </Button>
          )}
          {can(role, "customer.delete") && (
            <DeleteButton
              action={deleteCustomerAction.bind(
                null,
                orgId,
                customerId,
                customer.version,
              )}
            />
          )}
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="comments">
            Comments{comments.length > 0 ? ` (${comments.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="mails">Mails</TabsTrigger>
          <TabsTrigger value="statement">Statement</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
            <Card>
              <CardHeader>
                <CardTitle className="font-heading text-base">
                  Contact & address
                </CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Primary contact</dt>
                    <dd className="font-medium">{customer.name}</dd>
                    {customer.email && <dd>{customer.email}</dd>}
                    {customer.phone && <dd>{customer.phone}</dd>}
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Billing address</dt>
                    <dd>{address || "No address on file"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">
                      Preferred currency
                    </dt>
                    <dd>{customer.preferredCurrency ?? "Organization default"}</dd>
                  </div>
                  {customer.notes && (
                    <div>
                      <dt className="text-muted-foreground">Notes</dt>
                      <dd className="whitespace-pre-wrap">{customer.notes}</dd>
                    </div>
                  )}
                </dl>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="font-heading text-base">
                  Receivables
                </CardTitle>
              </CardHeader>
              <CardContent>
                {receivables.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nothing outstanding.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Currency</TableHead>
                        <TableHead className="text-right">
                          Outstanding
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {receivables.map((row) => (
                        <TableRow key={row.currency}>
                          <TableCell>{row.currency}</TableCell>
                          <TableCell className="text-right font-mono">
                            {row.outstanding.toString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-base">
                Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityTimeline entries={timeline} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="comments">
          <Card>
            <CardContent className="pt-6">
              <CustomerComments
                organizationId={orgId}
                customerId={customerId}
                comments={comments}
                currentUserId={session.user.id}
                canComment={can(role, "comment.create")}
                canDeleteAny={can(role, "comment.delete")}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transactions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-base">Invoices</CardTitle>
            </CardHeader>
            <CardContent>
              {transactions.invoices.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No invoices yet — invoicing arrives with the next slice.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Number</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Balance due</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.invoices.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">
                          {inv.displayNumber ?? "Draft"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{inv.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {money(inv.totalMinor, inv.currency)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {balanceDue(inv.totalMinor, inv.amountPaidMinor, inv.currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-base">Payments</CardTitle>
            </CardHeader>
            <CardContent>
              {transactions.payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No payments recorded yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.payments.map((pay) => (
                      <TableRow key={pay.id}>
                        <TableCell>
                          {pay.paidAt.toISOString().slice(0, 10)}
                        </TableCell>
                        <TableCell className="uppercase">{pay.method}</TableCell>
                        <TableCell className="text-right font-mono">
                          {money(pay.amountMinor, pay.currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mails">
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-base">
                Emails sent
              </CardTitle>
            </CardHeader>
            <CardContent>
              {mails.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {customer.email
                    ? "No emails sent to this customer yet."
                    : "Add an email address to this customer to track mails."}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mails.map((mail) => (
                      <TableRow key={mail.id}>
                        <TableCell>
                          {mail.createdAt.toISOString().slice(0, 10)}
                        </TableCell>
                        <TableCell>{mail.type}</TableCell>
                        <TableCell>{mail.subject ?? "—"}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline">{mail.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="statement" className="space-y-4">
          <div className="flex items-center gap-2">
            {(
              [
                ["this-month", "This month"],
                ["last-month", "Last month"],
                ["all", "All time"],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                asChild
                variant={periodPreset === value ? "secondary" : "outline"}
                size="sm"
              >
                <Link
                  href={`/orgs/${orgId}/customers/${customerId}?period=${value}`}
                >
                  {label}
                </Link>
              </Button>
            ))}
          </div>
          {statement.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No transactions in {period.label.toLowerCase()}.
              </CardContent>
            </Card>
          ) : (
            statement.map((s) => (
              <Card key={s.currency}>
                <CardHeader>
                  <CardTitle className="font-heading text-base">
                    Statement of accounts — {s.currency} ({period.label})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <div>
                      <dt className="text-muted-foreground">Opening balance</dt>
                      <dd className="font-mono font-medium">
                        {s.opening.toString()}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Invoiced</dt>
                      <dd className="font-mono font-medium">
                        {s.invoiced.toString()}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Received</dt>
                      <dd className="font-mono font-medium">
                        {s.received.toString()}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Closing balance</dt>
                      <dd className="font-mono font-semibold">
                        {s.closing.toString()}
                      </dd>
                    </div>
                  </dl>
                  {s.lines.length > 0 && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Reference</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {s.lines.map((line, i) => (
                          <TableRow key={`${line.kind}-${line.reference}-${i}`}>
                            <TableCell>
                              {line.date.toISOString().slice(0, 10)}
                            </TableCell>
                            <TableCell className="capitalize">
                              {line.kind}
                            </TableCell>
                            <TableCell>{line.reference}</TableCell>
                            <TableCell className="text-right font-mono">
                              {line.kind === "payment" ? "−" : ""}
                              {line.amount.toString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
