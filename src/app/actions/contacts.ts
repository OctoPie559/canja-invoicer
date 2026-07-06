"use server";

import { revalidatePath } from "next/cache";
import { runWithActor } from "@/lib/audit/context";
import { getDb } from "@/lib/db/client";
import { DomainError } from "@/lib/domain/errors";
import { ZodError } from "zod";
import {
  createContact,
  deleteContact,
  updateContact,
} from "@/lib/services/contacts";
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

function contactFields(formData: FormData) {
  return {
    salutation: String(formData.get("salutation") ?? ""),
    firstName: String(formData.get("firstName") ?? ""),
    lastName: String(formData.get("lastName") ?? ""),
    email: String(formData.get("email") ?? ""),
    workPhone: String(formData.get("workPhone") ?? ""),
    mobile: String(formData.get("mobile") ?? ""),
    designation: String(formData.get("designation") ?? ""),
    department: String(formData.get("department") ?? ""),
    isPrimary: formData.get("isPrimary") === "on",
  };
}

export async function createContactAction(
  organizationId: string,
  customerId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  try {
    await runWithActor(ctx, () =>
      createContact(getDb(), ctx, { customerId, ...contactFields(formData) }),
    );
  } catch (error) {
    return mapError(error);
  }
  revalidatePath(`/orgs/${organizationId}/customers/${customerId}`);
  return { error: null };
}

export async function updateContactAction(
  organizationId: string,
  customerId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  try {
    await runWithActor(ctx, () =>
      updateContact(getDb(), ctx, {
        id: String(formData.get("id") ?? ""),
        version: Number(formData.get("version") ?? 0),
        ...contactFields(formData),
      }),
    );
  } catch (error) {
    return mapError(error);
  }
  revalidatePath(`/orgs/${organizationId}/customers/${customerId}`);
  return { error: null };
}

export async function deleteContactAction(
  organizationId: string,
  customerId: string,
  contactId: string,
  version: number,
): Promise<ActionState> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  try {
    await runWithActor(ctx, () =>
      deleteContact(getDb(), ctx, { id: contactId, version }),
    );
  } catch (error) {
    return mapError(error);
  }
  revalidatePath(`/orgs/${organizationId}/customers/${customerId}`);
  return { error: null };
}
