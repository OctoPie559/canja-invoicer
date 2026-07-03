import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Who is causing the current mutation (PROJECT_BRIEF.md §5.3). Threaded from
 * the transport wrapper via AsyncLocalStorage so audit attribution is
 * automatic and impossible to forget. Services also receive it explicitly as
 * their first argument — ALS is the carrier, not a hidden dependency.
 */
export interface ActorContext {
  actorType: "user" | "system" | "api_key";
  /** User id / api key id; null for the system actor (cron, webhooks). */
  actorId: string | null;
  /** The organization the actor is acting in. */
  organizationId: string;
  /** Request metadata for the audit trail. */
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

const storage = new AsyncLocalStorage<ActorContext>();

/** Wrap a unit of work (request handler, cron run) with its actor. */
export function runWithActor<T>(ctx: ActorContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/** The current actor, or null outside any runWithActor scope. */
export function currentActor(): ActorContext | null {
  return storage.getStore() ?? null;
}

/** System actor for automated work (cron overdue marking, callbacks). */
export function systemActor(organizationId: string): ActorContext {
  return { actorType: "system", actorId: null, organizationId };
}
