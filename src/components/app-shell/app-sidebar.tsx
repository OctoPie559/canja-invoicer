"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Users,
} from "lucide-react";
import { Logo } from "./logo";
import { OrgSwitcher, type OrgSummary } from "./org-switcher";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

/**
 * App navigation. New sections slot in here as slices land
 * (invoices, estimates, payments, reports, settings).
 */
export function AppSidebar({
  orgs,
  currentOrgId,
}: {
  orgs: OrgSummary[];
  currentOrgId: string;
}) {
  const pathname = usePathname();
  const orgRoot = `/orgs/${currentOrgId}`;
  const items = [
    { title: "Overview", href: orgRoot, icon: LayoutDashboard, exact: true },
    { title: "Customers", href: `${orgRoot}/customers`, icon: Users },
    { title: "Products & services", href: `${orgRoot}/products`, icon: Package },
  ];

  return (
    <Sidebar>
      <SidebarHeader className="gap-4 px-4 pt-4">
        <Logo />
        <OrgSwitcher orgs={orgs} currentOrgId={currentOrgId} />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="tracking-widest uppercase">
            Workspace
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const active = item.exact
                  ? pathname === item.href
                  : pathname.startsWith(item.href);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={active}>
                      <Link
                        href={item.href}
                        className={
                          active ? "font-medium text-primary" : undefined
                        }
                      >
                        <item.icon
                          className={active ? "text-primary" : undefined}
                        />
                        {item.title}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
