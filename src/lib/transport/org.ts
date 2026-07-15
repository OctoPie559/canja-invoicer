import "server-only";
import { cache } from "react";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { member } from "@/lib/db/schema";
import { isRole, type Role } from "@/lib/authz/permissions";
import { requireSession } from "./session";

/**
 * Page/action guard: authenticated session + membership in the org, or 404.
 * Reads may bypass services but never tenancy (ARCHITECTURE.md §1.1).
 *
 * Wrapped in React `cache`: the org layout and the page it wraps both guard on
 * membership, and without memoization that's the same query twice per request.
 */
export const requireMembership = cache(async function requireMembership(
  organizationId: string,
): Promise<{
  session: Awaited<ReturnType<typeof requireSession>>;
  role: Role;
}> {
  const session = await requireSession();
  const [m] = await getDb()
    .select({ role: member.role })
    .from(member)
    .where(
      and(
        eq(member.organizationId, organizationId),
        eq(member.userId, session.user.id),
      ),
    )
    .limit(1);
  if (!m || !isRole(m.role)) notFound();
  return { session, role: m.role };
});
