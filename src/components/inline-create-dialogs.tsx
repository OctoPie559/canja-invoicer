"use client";

import { CustomerForm, type CreatedCustomer } from "@/components/customer-form";
import { ProductForm, type CreatedProduct } from "@/components/product-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Quick-create dialogs for use INSIDE another form (invoice/quote builders).
 * They host the FULL customer/product forms so anything can be created without
 * leaving the half-built document; on success the new entity is handed back to
 * the builder (via the inline actions) instead of redirecting. Radix portals
 * the dialog to <body>, so the form never nests in the host form's DOM.
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
  onCreated: (customer: CreatedCustomer) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-heading">New customer</DialogTitle>
          <DialogDescription>
            Create a customer without leaving this invoice.
          </DialogDescription>
        </DialogHeader>
        {/* keyed on `open` so the form resets each time the dialog reopens */}
        <CustomerForm
          key={open ? "open" : "closed"}
          organizationId={organizationId}
          cancelHref=""
          onCreated={(c) => {
            onCreated(c);
            onOpenChange(false);
          }}
          onCancel={() => onOpenChange(false)}
        />
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
  /** invoice currency — prefilled, still editable */
  currency: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (product: CreatedProduct) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-heading">
            New product or service
          </DialogTitle>
          <DialogDescription>
            Create an item without leaving this invoice.
          </DialogDescription>
        </DialogHeader>
        <ProductForm
          key={open ? "open" : "closed"}
          organizationId={organizationId}
          unitOptions={[]}
          defaultCurrency={currency}
          cancelHref=""
          onCreated={(p) => {
            onCreated(p);
            onOpenChange(false);
          }}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
