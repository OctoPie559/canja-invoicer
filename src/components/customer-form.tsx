"use client";

import { useActionState } from "react";
import type { ActionState } from "@/app/actions/organizations";
import {
  createCustomerAction,
  updateCustomerAction,
} from "@/app/actions/customers";
import { SUPPORTED_CURRENCIES } from "@/lib/validation/currencies";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const initialState: ActionState = { error: null };

export interface CustomerFormValues {
  id?: string;
  version?: number;
  name?: string;
  customerType?: string;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  country?: string | null;
  shippingAddressLine1?: string | null;
  shippingAddressLine2?: string | null;
  shippingCity?: string | null;
  shippingCountry?: string | null;
  notes?: string | null;
  preferredCurrency?: string | null;
}

export function CustomerForm({
  organizationId,
  customer,
}: {
  organizationId: string;
  customer?: CustomerFormValues;
}) {
  const editing = Boolean(customer?.id);
  const [state, action, pending] = useActionState(
    (editing ? updateCustomerAction : createCustomerAction).bind(
      null,
      organizationId,
    ),
    initialState,
  );

  return (
    <form action={action} className="space-y-6">
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {editing && (
        <>
          <input type="hidden" name="id" value={customer!.id} />
          <input type="hidden" name="version" value={customer!.version} />
        </>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="c-name">Name</Label>
          <Input id="c-name" name="name" required defaultValue={customer?.name ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="c-type">Customer type</Label>
          <Select name="customerType" defaultValue={customer?.customerType ?? "business"}>
            <SelectTrigger id="c-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="business">Business</SelectItem>
              <SelectItem value="individual">Individual</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="c-currency">Preferred currency</Label>
          <Select
            name="preferredCurrency"
            defaultValue={customer?.preferredCurrency ?? undefined}
          >
            <SelectTrigger id="c-currency" className="w-full">
              <SelectValue placeholder="Organization default" />
            </SelectTrigger>
            <SelectContent>
              {SUPPORTED_CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <fieldset className="space-y-4">
        <legend className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
          Billing address
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="c-address1">Address line 1</Label>
            <Input id="c-address1" name="addressLine1" defaultValue={customer?.addressLine1 ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-address2">Address line 2</Label>
            <Input id="c-address2" name="addressLine2" defaultValue={customer?.addressLine2 ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-city">City</Label>
            <Input id="c-city" name="city" defaultValue={customer?.city ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-country">Country</Label>
            <Input id="c-country" name="country" defaultValue={customer?.country ?? ""} />
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
          Shipping address
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="c-ship1">Address line 1</Label>
            <Input id="c-ship1" name="shippingAddressLine1" defaultValue={customer?.shippingAddressLine1 ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-ship2">Address line 2</Label>
            <Input id="c-ship2" name="shippingAddressLine2" defaultValue={customer?.shippingAddressLine2 ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-ship-city">City</Label>
            <Input id="c-ship-city" name="shippingCity" defaultValue={customer?.shippingCity ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-ship-country">Country</Label>
            <Input id="c-ship-country" name="shippingCountry" defaultValue={customer?.shippingCountry ?? ""} />
          </div>
        </div>
      </fieldset>

      {!editing && (
        <fieldset className="space-y-4">
          <legend className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
            Primary contact person (optional)
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pc-first">First name</Label>
              <Input id="pc-first" name="contactFirstName" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pc-last">Last name</Label>
              <Input id="pc-last" name="contactLastName" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pc-email">Email</Label>
              <Input id="pc-email" name="contactEmail" type="email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pc-mobile">Mobile</Label>
              <Input id="pc-mobile" name="contactMobile" type="tel" placeholder="+2547…" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            More people (and details like designation or work phone) can be
            added from the customer&apos;s overview.
          </p>
        </fieldset>
      )}

      <div className="space-y-2">
        <Label htmlFor="c-notes">Notes</Label>
        <Textarea id="c-notes" name="notes" rows={3} defaultValue={customer?.notes ?? ""} />
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : editing ? "Save changes" : "Create customer"}
      </Button>
    </form>
  );
}
