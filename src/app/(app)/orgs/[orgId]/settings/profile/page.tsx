import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { organization, subscriptions } from "@/lib/db/schema";
import { can } from "@/lib/authz/permissions";
import { getInvoiceSettings } from "@/lib/services/settings";
import { requireMembership } from "@/lib/transport/org";
import { OrgProfileForm } from "@/components/org-profile-form";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function OrgProfileSettingsPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const { role } = await requireMembership(orgId);
  const db = getDb();

  const [[org], settings, [subscription]] = await Promise.all([
    db
      .select({ name: organization.name, slug: organization.slug })
      .from(organization)
      .where(eq(organization.id, orgId))
      .limit(1),
    getInvoiceSettings(db, orgId),
    db
      .select({ plan: subscriptions.plan })
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, orgId))
      .limit(1),
  ]);
  if (!org) notFound();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-base">
          Organization profile
        </CardTitle>
        <CardDescription>
          Identity and plan. Branding (logo, colors, business details) joins
          in slice 4.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {can(role, "settings.update") ? (
          <OrgProfileForm organizationId={orgId} name={org.name} />
        ) : (
          <p className="text-sm">
            <span className="text-muted-foreground">Name: </span>
            <span className="font-medium">{org.name}</span>
          </p>
        )}
        <dl className="grid gap-3 border-t pt-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Slug</dt>
            <dd className="font-mono">{org.slug}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Base currency</dt>
            <dd className="font-medium">{settings.baseCurrency}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Plan</dt>
            <dd>
              <Badge variant="secondary" className="uppercase">
                {subscription?.plan ?? "free"}
              </Badge>
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
