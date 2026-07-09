"use client";

import { useActionState, useState } from "react";
import { BadgeCheck, Ban, BellRing, Send } from "lucide-react";
import {
  issueInvoiceAction,
  sendInvoiceAction,
  sendInvoiceReminderAction,
  voidInvoiceAction,
} from "@/app/actions/invoices";
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

/**
 * Issue and void are the two irreversible invoice actions, so both get a
 * confirmation dialog that states exactly what is about to happen. The
 * server re-checks everything; these dialogs are UX.
 */

export function IssueInvoiceDialog({
  organizationId,
  invoiceId,
  version,
  currency,
  baseCurrency,
  nextDisplayNumber,
  defaultIssueDate,
  defaultDueDate,
}: {
  organizationId: string;
  invoiceId: string;
  version: number;
  currency: string;
  baseCurrency: string;
  /** Best-effort preview — the number is only final at issue time. */
  nextDisplayNumber: string;
  defaultIssueDate: string;
  defaultDueDate: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(
    issueInvoiceAction.bind(null, organizationId),
    { error: null },
  );
  const foreign = currency !== baseCurrency;

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
            <DialogTitle>Issue this invoice?</DialogTitle>
            <DialogDescription>
              Issuing assigns the next number (expected{" "}
              <span className="font-mono font-medium">{nextDisplayNumber}</span>
              ), locks the document permanently, and snapshots the customer and
              line details. After this, corrections need a credit note or a new
              invoice.
            </DialogDescription>
          </DialogHeader>
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <input type="hidden" name="id" value={invoiceId} />
          <input type="hidden" name="version" value={version} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="issue-date">Issue date</Label>
              <Input
                id="issue-date"
                name="issueDate"
                type="date"
                defaultValue={defaultIssueDate}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="due-date">Due date</Label>
              <Input
                id="due-date"
                name="dueDate"
                type="date"
                defaultValue={defaultDueDate}
                required
              />
            </div>
          </div>
          {foreign && (
            <div className="space-y-2">
              <Label htmlFor="fx-rate">
                Exchange rate — 1 {currency} in {baseCurrency}
              </Label>
              <Input
                id="fx-rate"
                name="fxRateToBase"
                inputMode="decimal"
                placeholder="e.g. 129.55"
                required
              />
              <p className="text-xs text-muted-foreground">
                Frozen on the invoice at issue; reports convert with this rate
                forever.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Issuing…" : "Issue invoice"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function VoidInvoiceDialog({
  organizationId,
  invoiceId,
  displayNumber,
}: {
  organizationId: string;
  invoiceId: string;
  displayNumber: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(
    voidInvoiceAction.bind(null, organizationId),
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
              Voiding annuls the invoice — it stops counting toward balances
              but stays on record exactly as issued, with your reason in the
              audit trail. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <input type="hidden" name="id" value={invoiceId} />
          <div className="space-y-2">
            <Label htmlFor="void-reason">Reason</Label>
            <Textarea
              id="void-reason"
              name="reason"
              rows={2}
              placeholder="e.g. Duplicate of INV-000012"
              required
              minLength={3}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Voiding…" : "Void invoice"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SendInvoiceDialog({
  organizationId,
  invoiceId,
  displayNumber,
  contacts,
}: {
  organizationId: string;
  invoiceId: string;
  displayNumber: string;
  /** the customer's contact persons; only those with an email are sendable */
  contacts: Array<{
    id: string;
    name: string;
    email: string | null;
  }>;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(() =>
    contacts.filter((c) => c.email).map((c) => c.id),
  );
  const [state, action, pending] = useActionState<ActionState, FormData>(
    sendInvoiceAction.bind(null, organizationId),
    { error: null },
  );
  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  const sendable = contacts.filter((c) => c.email);

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
              Emails the invoice with the PDF attached and a link to the
              hosted view. Recipients are this customer&apos;s contact
              persons.
            </DialogDescription>
          </DialogHeader>
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <input type="hidden" name="id" value={invoiceId} />
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
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={pending || selected.length === 0}
            >
              {pending ? "Sending…" : "Send invoice"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SendReminderDialog({
  organizationId,
  invoiceId,
  displayNumber,
  daysOverdue,
  contacts,
}: {
  organizationId: string;
  invoiceId: string;
  displayNumber: string;
  /** 0 if not yet past due (button still allowed for a pre-due nudge) */
  daysOverdue: number;
  contacts: Array<{ id: string; name: string; email: string | null }>;
}) {
  const [open, setOpen] = useState(false);
  const sendable = contacts.filter((c) => c.email);
  const [selected, setSelected] = useState<string[]>(() =>
    sendable.map((c) => c.id),
  );
  const [state, action, pending] = useActionState<ActionState, FormData>(
    sendInvoiceReminderAction.bind(null, organizationId),
    { error: null },
  );
  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <BellRing />
          Send reminder
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form action={action} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Send a payment reminder</DialogTitle>
            <DialogDescription>
              Emails the customer a follow-up for {displayNumber}
              {daysOverdue > 0
                ? ` — now ${daysOverdue} day${daysOverdue === 1 ? "" : "s"} overdue`
                : ""}
              , showing the current balance and a link to view and pay.
            </DialogDescription>
          </DialogHeader>
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <input type="hidden" name="id" value={invoiceId} />
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
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending || selected.length === 0}>
              {pending ? "Sending…" : "Send reminder"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
