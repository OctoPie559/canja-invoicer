import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Database, Transaction } from "@/lib/db/client";
import { withOrgTransaction } from "@/lib/db/tx";
import { comments, customers, user } from "@/lib/db/schema";
import { newId } from "@/lib/domain/ids";
import { NotFoundError, PermissionError } from "@/lib/domain/errors";
import { writeAudit } from "@/lib/audit/write";
import type { ActorContext } from "@/lib/audit/context";
import { authorize, can } from "@/lib/authz/permissions";
import { getMembership } from "./organizations";

/**
 * Internal comments pinned to an entity (customers now; other entities
 * reuse the same service later). Full mutation pipeline; the target entity
 * is verified to belong to the org inside the transaction.
 */

export const addCommentSchema = z.object({
  entityType: z.enum(["customer"]), // grows with invoice/estimate later
  entityId: z.string().min(1),
  body: z.string().trim().min(1, "Comment cannot be empty").max(2000),
});
export type AddCommentInput = z.input<typeof addCommentSchema>;

async function assertEntityInOrg(
  tx: Transaction,
  organizationId: string,
  entityType: "customer",
  entityId: string,
): Promise<void> {
  if (entityType === "customer") {
    const [row] = await tx
      .select({ id: customers.id })
      .from(customers)
      .where(
        and(
          eq(customers.id, entityId),
          eq(customers.organizationId, organizationId),
          isNull(customers.deletedAt),
        ),
      )
      .limit(1);
    if (!row) throw new NotFoundError("customer");
  }
}

export async function addComment(
  db: Database,
  ctx: ActorContext,
  input: AddCommentInput,
): Promise<{ commentId: string }> {
  const data = addCommentSchema.parse(input);
  if (!ctx.actorId) throw new PermissionError("comment.create");
  const commentId = newId();

  await withOrgTransaction(db, ctx.organizationId, async (tx) => {
    const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
    authorize(caller.role, "comment.create");
    await assertEntityInOrg(tx, ctx.organizationId, data.entityType, data.entityId);

    await tx.insert(comments).values({
      id: commentId,
      organizationId: ctx.organizationId,
      entityType: data.entityType,
      entityId: data.entityId,
      authorId: ctx.actorId!,
      body: data.body,
    });
    await writeAudit(tx, ctx, {
      action: "comment.added",
      entityType: data.entityType,
      entityId: data.entityId,
      changes: { after: { commentId } },
    });
  });

  return { commentId };
}

export async function deleteComment(
  db: Database,
  ctx: ActorContext,
  commentId: string,
): Promise<void> {
  if (!ctx.actorId) throw new PermissionError("comment.delete");

  await withOrgTransaction(db, ctx.organizationId, async (tx) => {
    const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);

    const [existing] = await tx
      .select({
        id: comments.id,
        authorId: comments.authorId,
        entityType: comments.entityType,
        entityId: comments.entityId,
      })
      .from(comments)
      .where(
        and(
          eq(comments.id, commentId),
          eq(comments.organizationId, ctx.organizationId),
          isNull(comments.deletedAt),
        ),
      )
      .for("update");
    if (!existing) throw new NotFoundError("comment");

    // authors may always remove their own note; others need the permission
    if (existing.authorId !== ctx.actorId && !can(caller.role, "comment.delete")) {
      throw new PermissionError("comment.delete");
    }

    await tx
      .update(comments)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(comments.id, commentId));
    await writeAudit(tx, ctx, {
      action: "comment.deleted",
      entityType: existing.entityType,
      entityId: existing.entityId,
      changes: { before: { commentId } },
    });
  });
}

/** Comments with author names, oldest first (a conversation reads down). */
export async function listComments(
  db: Database,
  organizationId: string,
  entityType: string,
  entityId: string,
) {
  return db
    .select({
      id: comments.id,
      body: comments.body,
      authorId: comments.authorId,
      authorName: user.name,
      createdAt: comments.createdAt,
    })
    .from(comments)
    .innerJoin(user, eq(user.id, comments.authorId))
    .where(
      and(
        eq(comments.organizationId, organizationId),
        eq(comments.entityType, entityType),
        eq(comments.entityId, entityId),
        isNull(comments.deletedAt),
      ),
    )
    .orderBy(asc(comments.createdAt));
}
