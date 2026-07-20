"use client";

import { useState } from "react";
import {
  createCustomerInlineAction,
} from "@/app/actions/customers";
import { createProductInlineAction } from "@/app/actions/products";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Quick-create dialogs for use INSIDE another form (invoice/quote builders).
 * Radix portals the dialog to <body>, so these forms never nest in the host
 * form's DOM. Just the essentials — full editing lives on the entity pages.
 */

export function NewCustomerDialog({
  organizationId,
  open,
  onOpenChange,
  onCreated,
}: {
  organizationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (customer: {
    id: string;
    name: string;
    paymentTermsDays: number | null;
  }) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    e.stopPropagation(); // never bubble into the host form
    setPending(true);
    setError(null);
    const result = await createCustomerInlineAction(
      organizationId,
      new FormData(e.currentTarget),
    );
    setPending(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    onCreated(result.customer);
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setError(null);
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-heading">New customer</DialogTitle>
          <DialogDescription>
            Just the essentials — add contacts, addresses, and terms later
            from the Customers page.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="qc-name">Name</Label>
            <Input id="qc-name" name="name" required minLength={2} autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="qc-type">Type</Label>
            <Select name="customerType" defaultValue="business">
              <SelectTrigger id="qc-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="business">Business</SelectItem>
                <SelectItem value="individual">Individual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <a
            href={`/orgs/${organizationId}/customers/new`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Need address, contacts, or a logo? Open the full customer form ↗
          </a>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create customer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function NewProductDialog({
  organizationId,
  currency,
  open,
  onOpenChange,
  onCreated,
}: {
  organizationId: string;
  /** The host document's currency — the quick product is priced in it. */
  currency: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (product: {
    id: string;
    name: string;
    unitPrice: string;
    currency: string;
    defaultTaxRateBps: number | null;
  }) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    e.stopPropagation();
    setPending(true);
    setError(null);
    const result = await createProductInlineAction(
      organizationId,
      new FormData(e.currentTarget),
    );
    setPending(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    onCreated(result.product);
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setError(null);
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-heading">
            New product or service
          </DialogTitle>
          <DialogDescription>
            Just the essentials — descriptions, images, and tax defaults live
            on the Products page.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <input type="hidden" name="currency" value={currency} />
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="qp-name">Name</Label>
            <Input id="qp-name" name="name" required minLength={2} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="qp-price">Unit price ({currency})</Label>
              <Input
                id="qp-price"
                name="unitPrice"
                inputMode="decimal"
                placeholder="0.00"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="qp-type">Type</Label>
              <Select name="productType" defaultValue="service">
                <SelectTrigger id="qp-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="service">Service</SelectItem>
                  <SelectItem value="goods">Goods</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <a
            href={`/orgs/${organizationId}/products/new`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Need a description, unit, or image? Open the full product form ↗
          </a>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create product"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
