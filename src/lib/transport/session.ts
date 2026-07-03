import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import type { ActorContext } from "@/lib/audit/context";
import type { RequestMeta } from "@/lib/services/organizations";

/** Thin transport helpers (ARCHITECTURE.md §1.1) — no business logic here. */

export async function requireSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  return session;
}

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
