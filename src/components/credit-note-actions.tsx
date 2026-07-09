"use client";

import { useActionState, useState } from "react";
import { BadgeCheck, Ban } from "lucide-react";
import {
  issueCreditNoteAction,
  voidCreditNoteAction,
} from "@/app/actions/credit-notes";
import type { ActionState } from "@/app/actions/organizations";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function IssueCreditNoteDialog({
  organizationId,
  creditNoteId,
  version,
  nextDisplayNumber,
  invoiceNumber,
  total,
}: {
  organizationId: string;
  creditNoteId: string;
  version: number;
  nextDisplayNumber: string;
  invoiceNumber: string;
  total: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(
    issueCreditNoteAction.bind(null, organizationId),
    { error: null },
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <BadgeCheck />
          Issue
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form action={action} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Issue this credit note?</DialogTitle>
            <DialogDescription>
              Issues <span className="font-mono">{nextDisplayNumber}</span> for{" "}
              <span className="font-mono">{total}</span> against{" "}
              <span className="font-mono">{invoiceNumber}</span>, reducing its
              effective balance permanently. The document locks on issue.
            </DialogDescription>
          </DialogHeader>
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <input type="hidden" name="id" value={creditNoteId} />
          <input type="hidden" name="version" value={version} />
          <div className="space-y-2">
            <Label htmlFor="cn-issue-date">Issue date</Label>
            <Input
              id="cn-issue-date"
              name="issueDate"
              type="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Issuing…" : "Issue credit note"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function VoidCreditNoteDialog({
  organizationId,
  creditNoteId,
  displayNumber,
}: {
  organizationId: string;
  creditNoteId: string;
  displayNumber: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(
    voidCreditNoteAction.bind(null, organizationId),
    { error: null },
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          <Ban />
          Void
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form action={action} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Void {displayNumber}?</DialogTitle>
            <DialogDescription>
              Voiding restores the credited amount to the invoice&apos;s
              balance. The document stays on record; your reason lands in the
              audit trail.
            </DialogDescription>
          </DialogHeader>
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <input type="hidden" name="id" value={creditNoteId} />
          <div className="space-y-2">
            <Label htmlFor="cn-void-reason">Reason</Label>
            <Textarea id="cn-void-reason" name="reason" rows={2} required minLength={3} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Voiding…" : "Void credit note"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
