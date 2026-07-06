import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { can } from "@/lib/authz/permissions";
import { Money } from "@/lib/domain/money";
import {
  getProduct,
  getProductTimeline,
  getProductVersions,
} from "@/lib/services/products";
import { requireMembership } from "@/lib/transport/org";
import { deleteProductAction } from "@/app/actions/products";
import { ProductForm } from "@/components/product-form";
import { ActivityTimeline } from "@/components/activity-timeline";
import { DeleteButton } from "@/components/delete-button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ orgId: string; productId: string }>;
}) {
  const { orgId, productId } = await params;
  const { role } = await requireMembership(orgId);
  const db = getDb();

  const product = await getProduct(db, orgId, productId);
  if (!product) notFound();
  const [timeline, versions] = await Promise.all([
    getProductTimeline(db, orgId, productId),
    getProductVersions(db, orgId, productId),
  ]);
  const price = Money.fromMinor(product.unitPriceMinor, product.currency);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="font-heading text-xl font-semibold text-foreground">
            {product.name}
          </h1>
          <Badge variant="secondary" className="font-mono">
            {price.toString()}
          </Badge>
        </div>
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

      {can(role, "product.update") ? (
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-base">Details</CardTitle>
          </CardHeader>
          <CardContent>
            <ProductForm
              organizationId={orgId}
              product={{
                id: product.id,
                version: product.version,
                name: product.name,
                description: product.description,
                unitLabel: product.unitLabel,
                unitPrice: price.toDecimalString(),
                currency: product.currency,
              }}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-base">Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Price</dt>
                <dd className="font-mono">{price.toString()}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Unit</dt>
                <dd>{product.unitLabel ?? "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Description</dt>
                <dd>{product.description ?? "—"}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base">Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <ActivityTimeline entries={timeline} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base">
            Price & version history
          </CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    </div>
  );
}
