import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { getDb } from "@/lib/db/client";
import { can } from "@/lib/authz/permissions";
import { Money } from "@/lib/domain/money";
import {
  getProduct,
  getProductTimeline,
  getProductTransactions,
  getProductVersions,
} from "@/lib/services/products";
import { requireMembership } from "@/lib/transport/org";
import { deleteProductAction } from "@/app/actions/products";
import { ActivityRoadmap } from "@/components/activity-roadmap";
import { DeleteButton } from "@/components/delete-button";
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

export default async function ProductWorkspacePage({
  params,
}: {
  params: Promise<{ orgId: string; productId: string }>;
}) {
  const { orgId, productId } = await params;
  const { role } = await requireMembership(orgId);
  const db = getDb();

  const product = await getProduct(db, orgId, productId);
  if (!product) notFound();
  const [timeline, versions, transactions] = await Promise.all([
    getProductTimeline(db, orgId, productId),
    getProductVersions(db, orgId, productId),
    getProductTransactions(db, orgId, productId),
  ]);
  const price = Money.fromMinor(product.unitPriceMinor, product.currency);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h1 className="font-heading text-xl font-semibold text-foreground">
            {product.name}
          </h1>
          <Badge variant="secondary" className="font-mono">
            {price.toString()}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {can(role, "product.update") && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/orgs/${orgId}/products/${productId}/edit`}>
                <Pencil />
                Edit
              </Link>
            </Button>
          )}
          {can(role, "product.delete") && (
            <DeleteButton
              action={deleteProductAction.bind(
                null,
                orgId,
                productId,
                product.version,
              )}
            />
          )}
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardContent className="grid gap-6 pt-6 lg:grid-cols-[1fr_1.2fr]">
              {/* section 1: item & sales information */}
              <div className="space-y-5 lg:border-r lg:pr-6">
                <div className="space-y-3">
                  <h3 className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
                    Item information
                  </h3>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Type</dt>
                      <dd className="capitalize">{product.productType}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Unit</dt>
                      <dd>{product.unitLabel ?? "—"}</dd>
                    </div>
                  </dl>
                </div>
                <div className="space-y-3">
                  <h3 className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
                    Sales information
                  </h3>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Selling price</dt>
                      <dd className="font-mono font-medium">
                        {price.toString()}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Currency</dt>
                      <dd>{product.currency}</dd>
                    </div>
                    {product.description && (
                      <div>
                        <dt className="text-muted-foreground">Description</dt>
                        <dd className="whitespace-pre-wrap">
                          {product.description}
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
                <div className="space-y-3">
                  <h3 className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
                    Price & version history
                  </h3>
                  <ul className="divide-y text-sm">
                    {versions.map((v) => {
                      const data = v.data as {
                        unitPriceMinor?: string;
                        currency?: string;
                      };
                      const versionPrice =
                        data.unitPriceMinor && data.currency
                          ? Money.fromMinor(
                              BigInt(data.unitPriceMinor),
                              data.currency,
                            ).toString()
                          : "—";
                      return (
                        <li
                          key={v.id}
                          className="flex items-center justify-between py-2"
                        >
                          <span className="flex items-center gap-2">
                            <Badge variant="secondary">v{v.version}</Badge>
                            <span className="font-mono">{versionPrice}</span>
                          </span>
                          <span className="text-muted-foreground">
                            {v.changedAt.toISOString().slice(0, 16).replace("T", " ")}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>

              {/* section 2: activity */}
              <div className="border-t pt-6 lg:border-t-0 lg:pt-0">
                <h3 className="mb-4 text-xs font-medium tracking-widest text-muted-foreground uppercase">
                  Activity
                </h3>
                <ActivityRoadmap entries={timeline} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transactions">
          <Card>
            <CardContent className="pt-6">
              <h3 className="mb-4 text-xs font-medium tracking-widest text-muted-foreground uppercase">
                Invoice lines
              </h3>
              {transactions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  This product has not appeared on any invoice yet — invoicing
                  arrives with the next slice.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit price</TableHead>
                      <TableHead className="text-right">Line total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell className="font-medium">
                          {line.displayNumber ?? "Draft"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{line.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {line.quantity}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {Money.fromMinor(line.unitPriceMinor, line.currency).toString()}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {Money.fromMinor(line.lineTotalMinor, line.currency).toString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
