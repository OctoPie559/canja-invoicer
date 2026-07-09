"use server";

import { getDb } from "@/lib/db/client";
import { DomainError } from "@/lib/domain/errors";
import {
  recordEstimateView,
  recordPublicEstimateDecision,
} from "@/lib/services/estimates";
import { requestMeta } from "@/lib/transport/session";
import type { ActionState } from "./organizations";

/**
 * Public, token-authenticated estimate actions — no session. The unguessable
 * token IS the capability; the service scopes everything to the estimate's
 * own organization and records a CUSTOMER actor.
 */

/** Fire-and-forget view mark from the public page (client effect). */
export async function recordEstimateViewAction(token: string): Promise<void> {
  try {
    await recordEstimateView(getDb(), token, await requestMeta());
  } catch {
    // view tracking is best-effort — never surface an error to the client
  }
}

export async function publicEstimateDecisionAction(
  token: string,
  decision: "accepted" | "declined",
): Promise<ActionState> {
  try {
    await recordPublicEstimateDecision(
      getDb(),
      token,
      decision,
      await requestMeta(),
    );
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
  return { error: null };
}
