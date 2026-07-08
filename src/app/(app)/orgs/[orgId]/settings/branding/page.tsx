import { getDb } from "@/lib/db/client";
import { can } from "@/lib/authz/permissions";
import { getBranding } from "@/lib/services/branding";
import { getFileStorage } from "@/lib/storage/r2";
import { requireMembership } from "@/lib/transport/org";
import { eq } from "drizzle-orm";
import { subscriptions } from "@/lib/db/schema";
import { PDF_TEMPLATES } from "@/lib/domain/pdf-templates";
import {
  BrandingDetailsForm,
  BrandingLogoForm,
  PdfTemplatePicker,
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
  const db = getDb();
  const branding = await getBranding(db, orgId);
  const [sub] = await db
    .select({ plan: subscriptions.plan })
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, orgId))
    .limit(1);
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
            PDF template
          </CardTitle>
          <CardDescription>
            The layout of your invoice PDFs and hosted documents. Templates
            beyond Classic are part of Pro.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {canManage ? (
            <PdfTemplatePicker
              organizationId={orgId}
              current={branding.pdfTemplate}
              isPro={(sub?.plan ?? "free") === "pro"}
              templates={[...PDF_TEMPLATES]}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Current template:{" "}
              <span className="font-medium capitalize">
                {branding.pdfTemplate}
              </span>
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
