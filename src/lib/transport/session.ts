import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import type { ActorContext } from "@/lib/audit/context";
import type { RequestMeta } from "@/lib/services/organizations";

/** Thin transport helpers (ARCHITECTURE.md §1.1) — no business logic here. */

/**
 * The current session. Wrapped in React `cache` so the many callers in a
 * single request (layout, page, and every membership check) share ONE session
 * lookup instead of each round-tripping the auth store.
 */
export const requireSession = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  return session;
});

/** Session or null — for pages reachable while logged out (e.g. invitations). */
export const getOptionalSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

export async function requestMeta(): Promise<RequestMeta> {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    userAgent: h.get("user-agent") ?? undefined,
    requestId: h.get("x-vercel-id") ?? crypto.randomUUID(),
  };
}

/** Actor context for a user acting inside one organization. */
export async function userActor(
  userId: string,
  organizationId: string,
): Promise<ActorContext> {
  return {
    actorType: "user",
    actorId: userId,
    organizationId,
    ...(await requestMeta()),
  };
}
