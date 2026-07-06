import { getDb } from "@/lib/db/client";
import { listUserOrganizations } from "@/lib/services/organizations";
import { requireMembership } from "@/lib/transport/org";
import { requireSession } from "@/lib/transport/session";
import { AppSidebar } from "@/components/app-shell/app-sidebar";
import { UserMenu } from "@/components/app-shell/user-menu";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

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
  const orgs = await listUserOrganizations(getDb(), session.user.id);

  return (
    <SidebarProvider>
      <AppSidebar orgs={orgs} currentOrgId={orgId} />
      <SidebarInset className="bg-muted/40">
        <header className="flex h-14 items-center gap-2 border-b bg-background px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <div className="ml-auto">
            <UserMenu
              name={session.user.name}
              email={session.user.email}
              emailVerified={session.user.emailVerified}
              settingsHref={`/orgs/${orgId}/settings`}
            />
          </div>
        </header>
        <main className="w-full max-w-6xl flex-1 p-3">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
