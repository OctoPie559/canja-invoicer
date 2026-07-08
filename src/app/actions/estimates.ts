"use server";

import { redirect } from "next/navigation";
import { runWithActor } from "@/lib/audit/context";
import { getDb } from "@/lib/db/client";
import { DomainError } from "@/lib/domain/errors";
import { ZodError } from "zod";
import {
  convertEstimateToInvoice,
  createEstimateDraft,
  deleteEstimateDraft,
  issueEstimate,
  recordEstimateDecision,
  updateEstimateDraft,
} from "@/lib/services/estimates";
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

function draftFields(formData: FormData) {
  let lines: unknown = [];
  try {
    lines = JSON.parse(String(formData.get("lines") ?? "[]"));
  } catch {
    lines = [];
  }
  return {
    customerId: String(formData.get("customerId") ?? ""),
    currency: String(formData.get("currency") ?? "KES") as never,
    issueDate: String(formData.get("issueDate") ?? ""),
    expiryDate: String(formData.get("expiryDate") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    terms: String(formData.get("terms") ?? ""),
    lines: lines as never,
  };
}

export async function createEstimateDraftAction(
  organizationId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  let estimateId: string;
  try {
    ({ estimateId } = await runWithActor(ctx, () =>
      createEstimateDraft(getDb(), ctx, draftFields(formData)),
    ));
  } catch (error) {
    return mapError(error);
  }
  redirect(`/orgs/${organizationId}/estimates/${estimateId}`);
}

export async function updateEstimateDraftAction(
  organizationId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  const id = String(formData.get("id") ?? "");
  try {
    await runWithActor(ctx, () =>
      updateEstimateDraft(getDb(), ctx, {
        id,
        version: Number(formData.get("version") ?? 0),
        ...draftFields(formData),
      }),
    );
  } catch (error) {
    return mapError(error);
  }
  redirect(`/orgs/${organizationId}/estimates/${id}`);
}

export async function deleteEstimateDraftAction(
  organizationId: string,
  estimateId: string,
  version: number,
): Promise<ActionState> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  try {
    await runWithActor(ctx, () =>
      deleteEstimateDraft(getDb(), ctx, { id: estimateId, version }),
    );
  } catch (error) {
    return mapError(error);
  }
  redirect(`/orgs/${organizationId}/estimates`);
}

export async function issueEstimateAction(
  organizationId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  const id = String(formData.get("id") ?? "");
  try {
    await runWithActor(ctx, () =>
      issueEstimate(getDb(), ctx, {
        id,
        version: Number(formData.get("version") ?? 0),
        issueDate: String(formData.get("issueDate") ?? ""),
        expiryDate: String(formData.get("expiryDate") ?? ""),
      }),
    );
  } catch (error) {
    return mapError(error);
  }
  redirect(`/orgs/${organizationId}/estimates/${id}`);
}

export async function estimateDecisionAction(
  organizationId: string,
  estimateId: string,
  decision: "accepted" | "declined" | "expired",
): Promise<ActionState> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  try {
    await runWithActor(ctx, () =>
      recordEstimateDecision(getDb(), ctx, { id: estimateId, decision }),
    );
  } catch (error) {
    return mapError(error);
  }
  redirect(`/orgs/${organizationId}/estimates/${estimateId}`);
}

export async function convertEstimateAction(
  organizationId: string,
  estimateId: string,
  version: number,
): Promise<ActionState> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  let invoiceId: string;
  try {
    ({ invoiceId } = await runWithActor(ctx, () =>
      convertEstimateToInvoice(getDb(), ctx, { id: estimateId, version }),
    ));
  } catch (error) {
    return mapError(error);
  }
  redirect(`/orgs/${organizationId}/invoices/${invoiceId}`);
}
