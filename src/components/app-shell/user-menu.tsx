"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, LogOut, Settings } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join("") || "?"
  );
}

/** Stacked name/email + avatar + chevron, opening the account menu. */
export function UserMenu({
  name,
  email,
  emailVerified,
  settingsHref,
}: {
  name: string;
  email: string;
  emailVerified: boolean;
  /** Org settings link when rendered inside an organization. */
  settingsHref?: string;
}) {
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 outline-none">
        <span className="hidden text-right sm:block">
          <span className="block text-sm leading-tight font-semibold text-foreground">
            {name}
          </span>
          <span className="block text-xs leading-tight text-muted-foreground">
            {email}
          </span>
        </span>
        <Avatar className="size-9">
          <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
            {initials(name)}
          </AvatarFallback>
        </Avatar>
        <ChevronDown className="size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex items-center justify-between gap-2">
          <span className="truncate">{email}</span>
          {!emailVerified && <Badge variant="outline">unverified</Badge>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {settingsHref && (
          <DropdownMenuItem asChild>
            <Link href={settingsHref}>
              <Settings />
              Settings
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onClick={async () => {
            await authClient.signOut();
            router.push("/login");
          }}
        >
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
