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
  email?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  country?: string | null;
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
    <form action={action} className="space-y-4">
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
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="c-name">Name</Label>
          <Input id="c-name" name="name" required defaultValue={customer?.name ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="c-email">Email</Label>
          <Input id="c-email" name="email" type="email" defaultValue={customer?.email ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="c-phone">Phone</Label>
          <Input id="c-phone" name="phone" type="tel" placeholder="+2547…" defaultValue={customer?.phone ?? ""} />
        </div>
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
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="c-notes">Notes</Label>
          <Textarea id="c-notes" name="notes" rows={3} defaultValue={customer?.notes ?? ""} />
        </div>
      </div>
      <Button type="submit" disabled={pending}>
        {pending
          ? "Saving…"
          : editing
            ? "Save changes"
            : "Create customer"}
      </Button>
    </form>
  );
}
