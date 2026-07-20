"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { ActionState } from "@/app/actions/organizations";
import {
  createCustomerAction,
  updateCustomerAction,
} from "@/app/actions/customers";
import { PAYMENT_TERMS_PRESETS } from "@/lib/domain/payment-terms";
import { SUPPORTED_CURRENCIES } from "@/lib/validation/currencies";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CountrySelect } from "@/components/country-select";
import { PhoneInput } from "@/components/phone-input";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

const initialState: ActionState = { error: null };
const SALUTATIONS = ["Mr.", "Mrs.", "Ms.", "Dr.", "Prof."];

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
  paymentTermsDays?: number | null;
}

export interface ContactRowValues {
  id?: string;
  version?: number;
  salutation?: string | null;
  firstName?: string;
  lastName?: string | null;
  email?: string | null;
  workPhone?: string | null;
  mobile?: string | null;
  designation?: string | null;
  department?: string | null;
  isPrimary?: boolean;
}

interface ContactRowState extends ContactRowValues {
  key: string;
  deleted: boolean;
}

function ContactRowsEditor({
  rows,
  onChange,
}: {
  rows: ContactRowState[];
  onChange: (rows: ContactRowState[]) => void;
}) {
  const visible = rows.filter((r) => !r.deleted);
  const patch = (key: string, fields: Partial<ContactRowState>) =>
    onChange(rows.map((r) => (r.key === key ? { ...r, ...fields } : r)));
  const setPrimary = (key: string) =>
    onChange(rows.map((r) => ({ ...r, isPrimary: r.key === key })));

  return (
    <div className="space-y-4">
      {visible.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No contact persons — add the people you reach about billing.
        </p>
      )}
      {visible.map((row) => (
        <fieldset key={row.key} className="space-y-3 rounded-md border p-4">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="radio"
                name="__primaryContact"
                checked={row.isPrimary ?? false}
                onChange={() => setPrimary(row.key)}
                className="size-4 accent-primary"
              />
              Primary contact
              {row.isPrimary && <Badge variant="secondary">primary</Badge>}
            </label>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Remove contact person"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => patch(row.key, { deleted: true, isPrimary: false })}
            >
              <Trash2 />
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label>Salutation</Label>
              <Select
                value={row.salutation ?? undefined}
                onValueChange={(v) => patch(row.key, { salutation: v })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {SALUTATIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>First name</Label>
              <Input
                required
                value={row.firstName ?? ""}
                onChange={(e) => patch(row.key, { firstName: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Last name</Label>
              <Input
                value={row.lastName ?? ""}
                onChange={(e) => patch(row.key, { lastName: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input
                type="email"
                value={row.email ?? ""}
                onChange={(e) => patch(row.key, { email: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Work phone</Label>
              <PhoneInput
                value={row.workPhone ?? ""}
                onChange={(v) => patch(row.key, { workPhone: v })}
              />
            </div>
            <div className="space-y-1">
              <Label>Mobile</Label>
              <PhoneInput
                value={row.mobile ?? ""}
                onChange={(v) => patch(row.key, { mobile: v })}
              />
            </div>
            <div className="space-y-1">
              <Label>Designation</Label>
              <Input
                value={row.designation ?? ""}
                onChange={(e) => patch(row.key, { designation: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Department</Label>
              <Input
                value={row.department ?? ""}
                onChange={(e) => patch(row.key, { department: e.target.value })}
              />
            </div>
          </div>
        </fieldset>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          onChange([
            ...rows,
            { key: crypto.randomUUID(), deleted: false, isPrimary: visible.length === 0 },
          ])
        }
      >
        <Plus />
        Add contact person
      </Button>
    </div>
  );
}

export function CustomerForm({
  organizationId,
  customer,
  contacts,
  cancelHref,
}: {
  organizationId: string;
  customer?: CustomerFormValues;
  /** Existing contact persons (edit mode) — editable in the same save. */
  contacts?: ContactRowValues[];
  cancelHref: string;
}) {
  const editing = Boolean(customer?.id);
  const [contactRows, setContactRows] = useState<ContactRowState[]>(
    (contacts ?? []).map((c) => ({
      ...c,
      key: c.id ?? crypto.randomUUID(),
      deleted: false,
    })),
  );
  const [state, action, pending] = useActionState(
    (editing ? updateCustomerAction : createCustomerAction).bind(
      null,
      organizationId,
    ),
    initialState,
  );

  const contactsPayload = editing
    ? JSON.stringify(
        contactRows.map((row) => ({
          id: row.id,
          version: row.version,
          salutation: row.salutation,
          firstName: row.firstName ?? "",
          lastName: row.lastName,
          email: row.email,
          workPhone: row.workPhone,
          mobile: row.mobile,
          designation: row.designation,
          department: row.department,
          isPrimary: row.isPrimary ?? false,
          deleted: row.deleted,
        })),
      )
    : "";

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
          <input type="hidden" name="contacts" value={contactsPayload} />
        </>
      )}

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="address">Address</TabsTrigger>
          {editing && (
            <TabsTrigger value="contacts">
              Contact persons
              {contactRows.filter((r) => !r.deleted).length > 0 &&
                ` (${contactRows.filter((r) => !r.deleted).length})`}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="details" className="space-y-4 pt-2">
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
            <div className="space-y-2">
              <Label htmlFor="c-terms">Payment terms</Label>
              <Select
                name="paymentTermsDays"
                defaultValue={
                  customer?.paymentTermsDays != null
                    ? String(customer.paymentTermsDays)
                    : undefined
                }
              >
                <SelectTrigger id="c-terms" className="w-full">
                  <SelectValue placeholder="Organization default" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_TERMS_PRESETS.map((p) => (
                    <SelectItem key={p.days} value={String(p.days)}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Prefills the due date on this customer&apos;s invoices.
              </p>
            </div>
          </div>

          {!editing && (
            <fieldset className="space-y-4 border-t pt-4">
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
                  <PhoneInput id="pc-mobile" name="contactMobile" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                More people can be added when editing the customer.
              </p>
            </fieldset>
          )}

          <div className="space-y-2">
            <Label htmlFor="c-notes">Notes</Label>
            <Textarea id="c-notes" name="notes" rows={3} defaultValue={customer?.notes ?? ""} />
          </div>
        </TabsContent>

        <TabsContent value="address" className="space-y-6 pt-2">
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
                <CountrySelect id="c-country" name="country" defaultValue={customer?.country} />
              </div>
            </div>
          </fieldset>
          <fieldset className="space-y-4 border-t pt-4">
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
                <CountrySelect
                  id="c-ship-country"
                  name="shippingCountry"
                  defaultValue={customer?.shippingCountry}
                />
              </div>
            </div>
          </fieldset>
        </TabsContent>

        {editing && (
          <TabsContent value="contacts" className="pt-2">
            <ContactRowsEditor rows={contactRows} onChange={setContactRows} />
          </TabsContent>
        )}
      </Tabs>

      <div className="flex items-center gap-2 border-t pt-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : editing ? "Save changes" : "Create customer"}
        </Button>
        <Button asChild type="button" variant="outline">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
