"use server";

import { redirect } from "next/navigation";
import { runWithActor } from "@/lib/audit/context";
import { getDb } from "@/lib/db/client";
import { DomainError } from "@/lib/domain/errors";
import { ZodError } from "zod";
import {
  createCreditNote,
  deleteCreditNote,
  issueCreditNote,
  updateCreditNote,
  voidCreditNote,
} from "@/lib/services/credit-notes";
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

function cnLines(formData: FormData): unknown {
  try {
    return JSON.parse(String(formData.get("lines") ?? "[]"));
  } catch {
    return [];
  }
}

export async function createCreditNoteAction(
  organizationId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  let creditNoteId: string;
  try {
    ({ creditNoteId } = await runWithActor(ctx, () =>
      createCreditNote(getDb(), ctx, {
        invoiceId: String(formData.get("invoiceId") ?? ""),
        reason: String(formData.get("reason") ?? ""),
        lines: cnLines(formData) as never,
      }),
    ));
  } catch (error) {
    return mapError(error);
  }
  redirect(`/orgs/${organizationId}/credit-notes/${creditNoteId}`);
}

export async function updateCreditNoteAction(
  organizationId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  const id = String(formData.get("id") ?? "");
  try {
    await runWithActor(ctx, () =>
      updateCreditNote(getDb(), ctx, {
        id,
        version: Number(formData.get("version") ?? 0),
        reason: String(formData.get("reason") ?? ""),
        lines: cnLines(formData) as never,
      }),
    );
  } catch (error) {
    return mapError(error);
  }
  redirect(`/orgs/${organizationId}/credit-notes/${id}`);
}

export async function deleteCreditNoteAction(
  organizationId: string,
  creditNoteId: string,
  version: number,
): Promise<ActionState> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  try {
    await runWithActor(ctx, () =>
      deleteCreditNote(getDb(), ctx, { id: creditNoteId, version }),
    );
  } catch (error) {
    return mapError(error);
  }
  redirect(`/orgs/${organizationId}/credit-notes`);
}

export async function issueCreditNoteAction(
  organizationId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  const id = String(formData.get("id") ?? "");
  try {
    await runWithActor(ctx, () =>
      issueCreditNote(getDb(), ctx, {
        id,
        version: Number(formData.get("version") ?? 0),
        issueDate: String(formData.get("issueDate") ?? ""),
      }),
    );
  } catch (error) {
    return mapError(error);
  }
  redirect(`/orgs/${organizationId}/credit-notes/${id}`);
}

export async function voidCreditNoteAction(
  organizationId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  const id = String(formData.get("id") ?? "");
  try {
    await runWithActor(ctx, () =>
      voidCreditNote(getDb(), ctx, {
        id,
        reason: String(formData.get("reason") ?? ""),
      }),
    );
  } catch (error) {
    return mapError(error);
  }
  redirect(`/orgs/${organizationId}/credit-notes/${id}`);
}
