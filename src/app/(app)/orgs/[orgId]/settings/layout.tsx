import { requireMembership } from "@/lib/transport/org";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsNav } from "./settings-nav";

/**
 * Settings shell: category navigation on the left, the selected settings
 * page on the right (Zoho-style). Categories grow as slices land.
 */
export default async function SettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  await requireMembership(orgId);

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-xl font-semibold text-foreground">
        Settings
      </h1>
      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <Card className="h-fit py-0 lg:sticky lg:top-20">
          <CardContent className="px-2 py-3">
            <SettingsNav orgId={orgId} />
          </CardContent>
        </Card>
        <div className="min-w-0 space-y-6">{children}</div>
      </div>
    </div>
  );
}
