"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  FileText,
  LayoutDashboard,
  Package,
  Settings,
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
  const workspaceItems = [
    { title: "Overview", href: orgRoot, icon: LayoutDashboard, exact: true },
    { title: "Customers", href: `${orgRoot}/customers`, icon: Users },
    { title: "Products & services", href: `${orgRoot}/products`, icon: Package },
  ];
  // billing documents and money-in live under their own Sales section;
  // estimates and credit notes join it as their slices land
  const salesItems = [
    { title: "Invoices", href: `${orgRoot}/invoices`, icon: FileText },
    {
      title: "Payments received",
      href: `${orgRoot}/payments`,
      icon: Banknote,
      // manual payment recording arrives with slice 4 — visible so the
      // structure is honest about where money-in will live, but inert
      disabled: true,
    },
  ];

  return (
    <Sidebar>
      {/* h-14 + border-b matches the content header, so the hairline runs
          as one continuous line across the app (per the design reference) */}
      <div className="flex h-14 shrink-0 items-center border-b border-sidebar-border px-4">
        <Logo />
      </div>
      <SidebarHeader className="px-4 pt-3">
        <OrgSwitcher orgs={orgs} currentOrgId={currentOrgId} />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="tracking-widest uppercase">
            Workspace
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {workspaceItems.map((item) => (
                <NavItem key={item.href} item={item} pathname={pathname} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel className="tracking-widest uppercase">
            Sales
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {salesItems.map((item) => (
                <NavItem key={item.href} item={item} pathname={pathname} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <NavItem
                item={{
                  title: "Settings",
                  href: `${orgRoot}/settings`,
                  icon: Settings,
                }}
                pathname={pathname}
              />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}

function NavItem({
  item,
  pathname,
}: {
  item: {
    title: string;
    href: string;
    icon: LucideIcon;
    exact?: boolean;
    disabled?: boolean;
  };
  pathname: string;
}) {
  if (item.disabled) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          disabled
          className="cursor-default text-muted-foreground opacity-60"
        >
          <item.icon />
          {item.title}
          <span className="ml-auto text-[10px] tracking-wide uppercase">
            Soon
          </span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }
  const active = item.exact
    ? pathname === item.href
    : pathname.startsWith(item.href);
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active}>
        <Link
          href={item.href}
          className={active ? "font-medium text-primary" : undefined}
        >
          <item.icon className={active ? "text-primary" : undefined} />
          {item.title}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
