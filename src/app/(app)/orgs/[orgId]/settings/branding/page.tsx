import { getDb } from "@/lib/db/client";
import { can } from "@/lib/authz/permissions";
import { getBranding } from "@/lib/services/branding";
import { getFileStorage } from "@/lib/storage/r2";
import { requireMembership } from "@/lib/transport/org";
import {
  BrandingDetailsForm,
  BrandingLogoForm,
} from "@/components/branding-settings";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function BrandingSettingsPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const { role } = await requireMembership(orgId);
  const branding = await getBranding(getDb(), orgId);
  const canManage = can(role, "branding.update");

  let logoUrl: string | null = null;
  if (branding.logoKey) {
    try {
      logoUrl = getFileStorage().publicUrl(branding.logoKey);
    } catch {
      logoUrl = null; // storage not configured in this environment
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base">Logo</CardTitle>
          <CardDescription>
            Your mark on invoices, emails, and the hosted invoice view.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {canManage ? (
            <BrandingLogoForm organizationId={orgId} logoUrl={logoUrl} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Branding is managed by organization admins.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base">
            Business details
          </CardTitle>
          <CardDescription>
            Printed in the “From” block of your documents, with your accent
            color on the PDF.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {canManage ? (
            <BrandingDetailsForm
              organizationId={orgId}
              branding={{ ...branding, logoUrl }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              {branding.legalName ?? "Not configured yet."}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
