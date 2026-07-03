"use server";

import { redirect } from "next/navigation";
import { runWithActor } from "@/lib/audit/context";
import { getDb } from "@/lib/db/client";
import { DomainError } from "@/lib/domain/errors";
import { ZodError } from "zod";
import {
  acceptInvitation,
  createOrganization,
  inviteMember,
  revokeInvitation,
} from "@/lib/services/organizations";
import {
  requestMeta,
  requireSession,
  userActor,
} from "@/lib/transport/session";

/**
 * Server Actions are thin wrappers (ARCHITECTURE.md §1.2): authenticate,
 * build the actor context, call one service, map errors. Nothing else.
 */

export interface ActionState {
  error: string | null;
}

function mapError(error: unknown): ActionState {
  if (error instanceof ZodError) {
    return { error: error.issues[0]?.message ?? "Invalid input" };
  }
  if (error instanceof DomainError) {
    return { error: error.message };
  }
  throw error; // unexpected — let Sentry/error boundary handle it
}

export async function createOrganizationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  let organizationId: string;
  try {
    const result = await createOrganization(
      getDb(),
      {
        name: String(formData.get("name") ?? ""),
        type: formData.get("type") === "business" ? "business" : "personal",
      },
      { userId: session.user.id, meta: await requestMeta() },
    );
    organizationId = result.organizationId;
  } catch (error) {
    return mapError(error);
  }
  redirect(`/orgs/${organizationId}`);
}

export async function inviteMemberAction(
  organizationId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  try {
    await runWithActor(ctx, () =>
      inviteMember(getDb(), ctx, {
        email: String(formData.get("email") ?? ""),
        role: String(formData.get("role") ?? "member") as
          | "admin"
          | "member"
          | "viewer",
      }),
    );
  } catch (error) {
    return mapError(error);
  }
  redirect(`/orgs/${organizationId}`);
}

export async function revokeInvitationAction(
  organizationId: string,
  invitationId: string,
): Promise<void> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  await runWithActor(ctx, () => revokeInvitation(getDb(), ctx, invitationId));
  redirect(`/orgs/${organizationId}`);
}

export async function acceptInvitationAction(
  invitationId: string,
): Promise<ActionState> {
  const session = await requireSession();
  let organizationId: string;
  try {
    const result = await acceptInvitation(
      getDb(),
      { userId: session.user.id, meta: await requestMeta() },
      { invitationId },
    );
    organizationId = result.organizationId;
  } catch (error) {
    return mapError(error);
  }
  redirect(`/orgs/${organizationId}`);
}
