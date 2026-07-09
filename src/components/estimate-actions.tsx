"use client";

import { useActionState, useState } from "react";
import { ArrowRightLeft, BadgeCheck, Check, Clock, Send, X } from "lucide-react";
import {
  convertEstimateAction,
  estimateDecisionAction,
  issueEstimateAction,
  sendEstimateAction,
} from "@/app/actions/estimates";
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

export function IssueEstimateDialog({
  organizationId,
  estimateId,
  version,
  nextDisplayNumber,
  defaultIssueDate,
  defaultExpiryDate,
}: {
  organizationId: string;
  estimateId: string;
  version: number;
  nextDisplayNumber: string;
  defaultIssueDate: string;
  defaultExpiryDate: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(
    issueEstimateAction.bind(null, organizationId),
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
            <DialogTitle>Issue this estimate?</DialogTitle>
            <DialogDescription>
              Issuing assigns the next number (expected{" "}
              <span className="font-mono font-medium">{nextDisplayNumber}</span>
              ) and locks the document. Share the PDF or public link with your
              customer afterwards.
            </DialogDescription>
          </DialogHeader>
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <input type="hidden" name="id" value={estimateId} />
          <input type="hidden" name="version" value={version} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="est-issue-date">Issue date</Label>
              <Input
                id="est-issue-date"
                name="issueDate"
                type="date"
                defaultValue={defaultIssueDate}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="est-expiry-date">Valid until</Label>
              <Input
                id="est-expiry-date"
                name="expiryDate"
                type="date"
                defaultValue={defaultExpiryDate}
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Issuing…" : "Issue estimate"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Accept / decline / expired marks + convert — the post-issue actions. */
export function EstimateDecisionButtons({
  organizationId,
  estimateId,
  version,
  status,
}: {
  organizationId: string;
  estimateId: string;
  version: number;
  status: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const decide = async (decision: "accepted" | "declined" | "expired") => {
    const result = await estimateDecisionAction(
      organizationId,
      estimateId,
      decision,
    );
    if (result?.error) setError(result.error);
  };
  const convert = async () => {
    const result = await convertEstimateAction(
      organizationId,
      estimateId,
      version,
    );
    if (result?.error) setError(result.error);
  };

  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-xs text-destructive">{error}</span>}
      {(status === "sent" || status === "declined" || status === "expired") && (
        <Button size="sm" onClick={() => decide("accepted")}>
          <Check />
          Mark accepted
        </Button>
      )}
      {(status === "sent" || status === "accepted") && (
        <Button variant="outline" size="sm" onClick={() => decide("declined")}>
          <X />
          Declined
        </Button>
      )}
      {status === "sent" && (
        <Button variant="outline" size="sm" onClick={() => decide("expired")}>
          <Clock />
          Expired
        </Button>
      )}
      {status === "accepted" && (
        <Button size="sm" variant="secondary" onClick={convert}>
          <ArrowRightLeft />
          Convert to invoice
        </Button>
      )}
    </span>
  );
}

export function SendEstimateDialog({
  organizationId,
  estimateId,
  displayNumber,
  contacts,
}: {
  organizationId: string;
  estimateId: string;
  displayNumber: string;
  contacts: Array<{ id: string; name: string; email: string | null }>;
}) {
  const [open, setOpen] = useState(false);
  const sendable = contacts.filter((c) => c.email);
  const [selected, setSelected] = useState<string[]>(() =>
    sendable.map((c) => c.id),
  );
  const [state, action, pending] = useActionState<ActionState, FormData>(
    sendEstimateAction.bind(null, organizationId),
    { error: null },
  );
  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Send />
          Send
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form action={action} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Send {displayNumber}</DialogTitle>
            <DialogDescription>
              Emails the quote with the PDF attached and a link where the
              customer can view, accept, or decline it. Recipients are this
              customer&apos;s contact persons.
            </DialogDescription>
          </DialogHeader>
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <input type="hidden" name="id" value={estimateId} />
          <input
            type="hidden"
            name="contactIds"
            value={JSON.stringify(selected)}
          />
          {sendable.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              None of this customer&apos;s contact persons has an email
              address. Add one on the customer&apos;s page first.
            </p>
          ) : (
            <ul className="space-y-2">
              {sendable.map((c) => (
                <li key={c.id}>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selected.includes(c.id)}
                      onChange={() => toggle(c.id)}
                      className="size-4 accent-primary"
                    />
                    <span className="font-medium">{c.name}</span>
                    <span className="text-muted-foreground">{c.email}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || selected.length === 0}>
              {pending ? "Sending…" : "Send quote"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
