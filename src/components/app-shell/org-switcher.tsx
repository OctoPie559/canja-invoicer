"use client";

import Link from "next/link";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import Image from "next/image";

export interface OrgSummary {
  id: string;
  name: string;
  role: string;
}

/** Workspace switcher at the very top of the sidebar (per design brief). */
export function OrgSwitcher({
  orgs,
  currentOrgId,
  logoUrl,
}: {
  orgs: OrgSummary[];
  currentOrgId: string;
  logoUrl?: string | null
}) {
  const current = orgs.find((o) => o.id === currentOrgId);
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild className="px-0">
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent"
            >
              {logoUrl ? (
                <Image
                  width={32}
                  height={32}
                  src = {logoUrl}
                  alt = {current?.name ?? "Organization logo"}
                  className = "size-8 rounded-md"
                  loading = "eager"
                />
              ) : (
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-sm font-semibold text-primary">
                  {current?.name?.[0]?.toUpperCase() ?? "?"}
                </span>
              )}
              <span className="grid flex-1 text-left leading-tight">
                <span className="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
                  Organization
                </span>
                <span className="truncate text-sm font-semibold">
                  {current?.name ?? "Select organization"}
                </span>
              </span>
              <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Your organizations
            </DropdownMenuLabel>
            {orgs.map((org) => (
              <DropdownMenuItem key={org.id} asChild>
                <Link href={`/orgs/${org.id}`}>
                  <span className="flex size-6 items-center justify-center rounded-sm bg-primary/10 text-xs font-semibold text-primary">
                    {org.name[0]?.toUpperCase()}
                  </span>
                  <span className="flex-1 truncate">{org.name}</span>
                  {org.id === currentOrgId && <Check className="size-4" />}
                </Link>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/orgs/new">
                <Plus className="size-4" />
                New organization
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
