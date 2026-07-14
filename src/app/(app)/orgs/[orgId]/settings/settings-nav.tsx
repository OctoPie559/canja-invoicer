"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  Building2,
  CalendarClock,
  CreditCard,
  FileText,
  Palette,
  Percent,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Settings sub-navigation (Zoho-style categories). Disabled entries mark
 * where future slices' settings will live, so the structure is honest
 * about the roadmap without shipping dead links.
 */

interface SettingsNavItem {
  title: string;
  segment: string;
  icon: LucideIcon;
  disabled?: boolean;
}

const GROUPS: Array<{ label: string; items: SettingsNavItem[] }> = [
  {
    label: "Organization",
    items: [
      { title: "Profile", segment: "profile", icon: Building2 },
      { title: "Branding", segment: "branding", icon: Palette },
    ],
  },
  {
    label: "Users",
    items: [{ title: "Members & roles", segment: "members", icon: Users }],
  },
  {
    label: "Billing",
    items: [{ title: "Plan & billing", segment: "billing", icon: CreditCard }],
  },
  {
    label: "Taxes",
    items: [{ title: "Tax rates", segment: "tax-rates", icon: Percent }],
  },
  {
    label: "Sales",
    items: [
      { title: "Payment terms", segment: "payment-terms", icon: CalendarClock },
      { title: "Invoices", segment: "invoices", icon: FileText },
      // slice 4 ships manual payment recording preferences
      {
        title: "Payments received",
        segment: "payments",
        icon: Banknote,
        disabled: true,
      },
    ],
  },
];

export function SettingsNav({ orgId }: { orgId: string }) {
  const pathname = usePathname();
  const base = `/orgs/${orgId}/settings`;

  return (
    <nav className="space-y-5">
      {GROUPS.map((group) => (
        <div key={group.label}>
          <h3 className="mb-1 px-2 text-xs font-medium tracking-widest text-muted-foreground uppercase">
            {group.label}
          </h3>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const href = `${base}/${item.segment}`;
              const active = pathname.startsWith(href);
              if (item.disabled) {
                return (
                  <li
                    key={item.segment}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground opacity-60"
                  >
                    <item.icon className="size-4" />
                    {item.title}
                    <span className="ml-auto text-[10px] tracking-wide uppercase">
                      Soon
                    </span>
                  </li>
                );
              }
              return (
                <li key={item.segment}>
                  <Link
                    href={href}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground hover:bg-muted",
                    )}
                  >
                    <item.icon className="size-4" />
                    {item.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
