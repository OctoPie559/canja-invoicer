"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface CustomerListEntry {
  id: string;
  name: string;
  email: string | null;
}

/** Left pane of the customers master-detail view (Zoho-style). */
export function CustomerListPane({
  organizationId,
  customers,
  canCreate,
}: {
  organizationId: string;
  customers: CustomerListEntry[];
  canCreate: boolean;
}) {
  const params = useParams<{ customerId?: string }>();
  const [query, setQuery] = useState("");
  const filtered = query
    ? customers.filter((c) =>
        `${c.name} ${c.email ?? ""}`.toLowerCase().includes(query.toLowerCase()),
      )
    : customers;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b p-3">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search customers"
            className="pl-8"
          />
        </div>
        {canCreate && (
          <Button asChild size="icon" aria-label="New customer">
            <Link href={`/orgs/${organizationId}/customers/new`}>
              <Plus />
            </Link>
          </Button>
        )}
      </div>
      <ul className="flex-1 divide-y overflow-y-auto">
        {filtered.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-muted-foreground">
            {customers.length === 0 ? "No customers yet." : "No matches."}
          </li>
        ) : (
          filtered.map((customer) => (
            <li key={customer.id}>
              <Link
                href={`/orgs/${organizationId}/customers/${customer.id}`}
                className={cn(
                  "block px-4 py-3 text-sm hover:bg-muted/50",
                  params.customerId === customer.id && "bg-muted",
                )}
              >
                <span className="block font-medium text-foreground">
                  {customer.name}
                </span>
                {customer.email && (
                  <span className="block truncate text-xs text-muted-foreground">
                    {customer.email}
                  </span>
                )}
              </Link>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
