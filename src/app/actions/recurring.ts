"use server";

import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { runWithActor } from "@/lib/audit/context";
import { getDb } from "@/lib/db/client";
import { DomainError } from "@/lib/domain/errors";
import {
  createRecurring,
  deleteRecurring,
  recurringAction,
  updateRecurring,
} from "@/lib/services/recurring";
import { requireSession, userActor } from "@/lib/transport/session";
import type { ActionState } from "./organizations";

/** Thin wrappers (ARCHITECTURE.md §1.2): auth → ctx → one service → map. */

function mapError(error: unknown): ActionState {
  if (error instanceof ZodError) {
    return { error: error.issues[0]?.message ?? "Invalid input" };
  }
  if (error instanceof DomainError) {
    return { error: error.message };
  }
  throw error;
}

function scheduleFields(formData: FormData) {
  let lines: unknown = [];
  try {
    lines = JSON.parse(String(formData.get("lines") ?? "[]"));
  } catch {
    lines = [];
  }
  return {
    customerId: String(formData.get("customerId") ?? ""),
    currency: String(formData.get("currency") ?? "KES") as never,
    frequency: String(formData.get("frequency") ?? "monthly") as never,
    intervalCount: Number(formData.get("intervalCount") ?? 1),
    startDate: String(formData.get("startDate") ?? ""),
    endDate: String(formData.get("endDate") ?? ""),
    autoIssue: String(formData.get("autoIssue") ?? "draft") as never,
    notes: String(formData.get("notes") ?? ""),
    terms: String(formData.get("terms") ?? ""),
    lines: lines as never,
  };
}

export async function createRecurringAction(
  organizationId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  let recurringId: string;
  try {
    ({ recurringId } = await runWithActor(ctx, () =>
      createRecurring(getDb(), ctx, scheduleFields(formData)),
    ));
  } catch (error) {
    return mapError(error);
  }
  redirect(`/orgs/${organizationId}/recurring/${recurringId}`);
}

export async function updateRecurringAction(
  organizationId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  const id = String(formData.get("id") ?? "");
  try {
    await runWithActor(ctx, () =>
      updateRecurring(getDb(), ctx, {
        id,
        version: Number(formData.get("version") ?? 0),
        ...scheduleFields(formData),
      }),
    );
  } catch (error) {
    return mapError(error);
  }
  redirect(`/orgs/${organizationId}/recurring/${id}`);
}

export async function recurringActionAction(
  organizationId: string,
  recurringId: string,
  action: "pause" | "resume" | "end",
): Promise<ActionState> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  try {
    await runWithActor(ctx, () =>
      recurringAction(getDb(), ctx, { id: recurringId, action }),
    );
  } catch (error) {
    return mapError(error);
  }
  redirect(`/orgs/${organizationId}/recurring/${recurringId}`);
}

export async function deleteRecurringAction(
  organizationId: string,
  recurringId: string,
  version: number,
): Promise<ActionState> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  try {
    await runWithActor(ctx, () =>
      deleteRecurring(getDb(), ctx, { id: recurringId, version }),
    );
  } catch (error) {
    return mapError(error);
  }
  redirect(`/orgs/${organizationId}/recurring`);
}
