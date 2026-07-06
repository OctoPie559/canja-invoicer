import { notFound } from "next/navigation";
import { can } from "@/lib/authz/permissions";
import { requireMembership } from "@/lib/transport/org";
import { ProductForm } from "@/components/product-form";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function NewProductPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const { role } = await requireMembership(orgId);
  if (!can(role, "product.create")) notFound();

  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader>
        <CardTitle className="font-heading text-lg">New product</CardTitle>
      </CardHeader>
      <CardContent>
        <ProductForm organizationId={orgId} />
      </CardContent>
    </Card>
  );
}
