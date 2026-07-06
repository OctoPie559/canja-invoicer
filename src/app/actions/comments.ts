"use server";

import { revalidatePath } from "next/cache";
import { runWithActor } from "@/lib/audit/context";
import { getDb } from "@/lib/db/client";
import { DomainError } from "@/lib/domain/errors";
import { ZodError } from "zod";
import { addComment, deleteComment } from "@/lib/services/comments";
import { requireSession, userActor } from "@/lib/transport/session";
import type { ActionState } from "./organizations";

/** Thin wrappers (ARCHITECTURE.md §1.2). */

function mapError(error: unknown): ActionState {
  if (error instanceof ZodError) {
    return { error: error.issues[0]?.message ?? "Invalid input" };
  }
  if (error instanceof DomainError) {
    return { error: error.message };
  }
  throw error;
}

export async function addCustomerCommentAction(
  organizationId: string,
  customerId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  try {
    await runWithActor(ctx, () =>
      addComment(getDb(), ctx, {
        entityType: "customer",
        entityId: customerId,
        body: String(formData.get("body") ?? ""),
      }),
    );
  } catch (error) {
    return mapError(error);
  }
  revalidatePath(`/orgs/${organizationId}/customers/${customerId}`);
  return { error: null };
}

export async function deleteCustomerCommentAction(
  organizationId: string,
  customerId: string,
  commentId: string,
): Promise<ActionState> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  try {
    await runWithActor(ctx, () => deleteComment(getDb(), ctx, commentId));
  } catch (error) {
    return mapError(error);
  }
  revalidatePath(`/orgs/${organizationId}/customers/${customerId}`);
  return { error: null };
}
