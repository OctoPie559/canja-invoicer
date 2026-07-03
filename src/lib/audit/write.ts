import { auditLog } from "@/lib/db/schema";
import type { Transaction } from "@/lib/db/client";
import { newId } from "@/lib/domain/ids";
import type { ActorContext } from "./context";

/**
 * Audit event payload. `action` is a business event (invoice.issued,
 * member.role_changed), not a column diff — intent is what gets audited.
 */
export interface AuditEvent {
  action: string;
  entityType: string;
  entityId?: string;
  /** Before/after diff or created/deleted payload. */
  changes?: Record<string, unknown>;
  reason?: string;
}

/**
 * Write the audit row for a mutation INSIDE the caller's transaction
 * (PROJECT_BRIEF.md §5.2): if the change rolls back, the audit entry rolls
 * back with it; if it commits, the entry is guaranteed. Every service
 * mutation calls this — no mutation is exempt.
 *
 * Note: audit rows legitimately contain personal data (they exist for
 * dispute resolution) and follow the §7 retention rules. Masking applies to
 * logs and error reports, not to the trail itself.
 */
export async function writeAudit(
  tx: Transaction,
  ctx: ActorContext,
  event: AuditEvent,
): Promise<void> {
  await tx.insert(auditLog).values({
    id: newId(),
    organizationId: ctx.organizationId,
    actorId: ctx.actorId,
    actorType: ctx.actorType,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    changes: event.changes,
    metadata: {
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    },
    reason: event.reason,
  });
}
