import { getDb } from "@/lib/db/client";
import { listUserOrganizations } from "@/lib/services/organizations";
import { requireMembership } from "@/lib/transport/org";
import { requireSession } from "@/lib/transport/session";
import { AppSidebar } from "@/components/app-shell/app-sidebar";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { getBranding } from "@/lib/services/branding";
import { getFileStorage } from "@/lib/storage/r2";

/**
 * The app shell for org-scoped routes: sidebar (wordmark, org switcher, nav)
 * plus a content header row. Membership is enforced here AND on every page —
 * defense in depth, since layouts don't re-render on same-route navigation.
 */
export default async function OrgShellLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const [session] = await Promise.all([
    requireSession(),
    requireMembership(orgId),
  ]);
  const [orgs, branding] = await Promise.all([
    listUserOrganizations(getDb(), session.user.id),
    getBranding(getDb(), orgId),
  ]);
  let logoUrl: string | null = null;
  if (branding.logoKey) {
    try {
      logoUrl = getFileStorage().publicUrl(branding.logoKey);
    } catch {
      logoUrl = null; // storage not configured in this environment
    }
  }


  return (
    <SidebarProvider>
      <AppSidebar orgs={orgs} currentOrgId={orgId} logoUrl={logoUrl} session={session} />
      <SidebarInset className="bg-muted/40">
        <header className="flex h-14 items-center gap-2 border-b bg-background px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
        </header>
        <main className="w-full max-w-7xl flex-1 p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
