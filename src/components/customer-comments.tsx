"use client";

import { useActionState, useRef } from "react";
import { Trash2 } from "lucide-react";
import type { ActionState } from "@/app/actions/organizations";
import {
  addCustomerCommentAction,
  deleteCustomerCommentAction,
} from "@/app/actions/comments";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const initialState: ActionState = { error: null };

export interface CommentView {
  id: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: Date;
}

export function CustomerComments({
  organizationId,
  customerId,
  comments,
  currentUserId,
  canComment,
  canDeleteAny,
}: {
  organizationId: string;
  customerId: string;
  comments: CommentView[];
  currentUserId: string;
  canComment: boolean;
  canDeleteAny: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await addCustomerCommentAction(
        organizationId,
        customerId,
        prev,
        formData,
      );
      if (!result.error) formRef.current?.reset();
      return result;
    },
    initialState,
  );

  return (
    <div className="space-y-6">
      {canComment && (
        <form ref={formRef} action={action} className="space-y-2">
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <Textarea
            name="body"
            required
            rows={3}
            placeholder="Add an internal note about this customer…"
          />
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Adding…" : "Add comment"}
          </Button>
        </form>
      )}
      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No comments yet.</p>
      ) : (
        <ul className="space-y-4">
          {comments.map((comment) => (
            <li key={comment.id} className="flex gap-3">
              <Avatar className="size-8">
                <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                  {comment.authorName[0]?.toUpperCase() ?? "?"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-1">
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {comment.authorName}
                  </span>
                  {comment.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                  {(comment.authorId === currentUserId || canDeleteAny) && (
                    <button
                      type="button"
                      aria-label="Delete comment"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() =>
                        deleteCustomerCommentAction(
                          organizationId,
                          customerId,
                          comment.id,
                        )
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </p>
                <p className="text-sm whitespace-pre-wrap">{comment.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
