"use client";

import { useActionState, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  createTaxRateAction,
  deleteTaxRateAction,
  updateInvoiceDefaultsAction,
  updateInvoiceNumberingAction,
  updatePaymentTermsDefaultAction,
} from "@/app/actions/settings";
import {
  PAYMENT_TERMS_PRESETS,
  paymentTermsLabel,
} from "@/lib/domain/payment-terms";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ActionState } from "@/app/actions/organizations";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Slice-2 settings: named tax rates (percent in the UI, basis points on
 * the wire) and invoice numbering. Rates copied onto lines never change
 * retroactively — editing a rate only affects future lines.
 */

export function TaxRatesSettings({
  organizationId,
  taxRates,
  canManage,
}: {
  organizationId: string;
  taxRates: Array<{ id: string; name: string; rateBps: number; version: number }>;
  canManage: boolean;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createTaxRateAction.bind(null, organizationId),
    { error: null },
  );
  const [percent, setPercent] = useState("");

  return (
    <div className="space-y-4">
      {taxRates.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No tax rates yet. Add VAT 16% if you charge Kenyan VAT.
        </p>
      ) : (
        <ul className="divide-y text-sm">
          {taxRates.map((t) => (
            <li key={t.id} className="flex items-center justify-between py-2">
              <span>
                {t.name}{" "}
                <span className="font-mono text-muted-foreground">
                  {(t.rateBps / 100).toFixed(2).replace(/\.?0+$/, "")}%
                </span>
              </span>
              {canManage && (
                <form
                  action={async () => {
                    await deleteTaxRateAction(organizationId, t.id, t.version);
                  }}
                >
                  <Button
                    type="submit"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${t.name}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <form action={action} className="flex flex-wrap items-end gap-2">
          {state.error && (
            <Alert variant="destructive" className="w-full">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="tax-name">Name</Label>
            <Input
              id="tax-name"
              name="name"
              placeholder="VAT"
              className="w-40"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tax-percent">Rate %</Label>
            <Input
              id="tax-percent"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              inputMode="decimal"
              placeholder="16"
              className="w-24"
              required
            />
          </div>
          {/* percent → basis points; the server validates the integer range */}
          <input
            type="hidden"
            name="rateBps"
            value={Math.round((Number(percent) || 0) * 100)}
          />
          <Button type="submit" size="sm" disabled={pending}>
            <Plus />
            {pending ? "Adding…" : "Add rate"}
          </Button>
        </form>
      )}
    </div>
  );
}

export function InvoiceNumberingSettings({
  organizationId,
  settings,
  canManage,
}: {
  organizationId: string;
  settings: {
    invoicePrefix: string;
    invoiceNextNumber: number;
    version: number;
  };
  canManage: boolean;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    updateInvoiceNumberingAction.bind(null, organizationId),
    { error: null },
  );

  const preview = `${settings.invoicePrefix}-${String(
    settings.invoiceNextNumber,
  ).padStart(6, "0")}`;

  if (!canManage) {
    return (
      <p className="text-sm text-muted-foreground">
        Next invoice number:{" "}
        <span className="font-mono font-medium text-foreground">{preview}</span>
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <input type="hidden" name="version" value={settings.version} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="num-prefix">Prefix</Label>
          <Input
            id="num-prefix"
            name="invoicePrefix"
            defaultValue={settings.invoicePrefix}
            className="w-28"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="num-next">Next number</Label>
          <Input
            id="num-next"
            name="invoiceNextNumber"
            type="number"
            min={settings.invoiceNextNumber}
            defaultValue={settings.invoiceNextNumber}
            className="w-32"
            required
          />
        </div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Next invoice will be numbered{" "}
        <span className="font-mono">{preview}</span>. The counter only moves
        forward — numbers are never reused.
      </p>
    </form>
  );
}

export function PaymentTermsDefaultSettings({
  organizationId,
  settings,
  canManage,
}: {
  organizationId: string;
  settings: { defaultPaymentTermsDays: number; version: number };
  canManage: boolean;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    updatePaymentTermsDefaultAction.bind(null, organizationId),
    { error: null },
  );

  if (!canManage) {
    return (
      <p className="text-sm text-muted-foreground">
        Default terms:{" "}
        <span className="font-medium text-foreground">
          {paymentTermsLabel(settings.defaultPaymentTermsDays)}
        </span>
      </p>
    );
  }

  // offer the current value even when it is not one of the named presets
  const options = [
    ...new Set([
      ...PAYMENT_TERMS_PRESETS.map((p) => p.days),
      settings.defaultPaymentTermsDays,
    ]),
  ].sort((a, b) => a - b);

  return (
    <form action={action} className="space-y-4">
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <input type="hidden" name="version" value={settings.version} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="terms-default">Default payment terms</Label>
          <Select
            name="defaultPaymentTermsDays"
            defaultValue={String(settings.defaultPaymentTermsDays)}
          >
            <SelectTrigger id="terms-default" className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((days) => (
                <SelectItem key={days} value={String(days)}>
                  {paymentTermsLabel(days)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Used when neither the invoice nor the customer specifies terms.
        Customers can carry their own terms on their profile.
      </p>
    </form>
  );
}

export function InvoiceDefaultsSettings({
  organizationId,
  settings,
  taxRates,
  canManage,
}: {
  organizationId: string;
  settings: {
    defaultTaxRateId: string | null;
    defaultInvoiceNotes: string | null;
    defaultInvoiceTerms: string | null;
    version: number;
  };
  taxRates: Array<{ id: string; name: string; rateBps: number }>;
  canManage: boolean;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    updateInvoiceDefaultsAction.bind(null, organizationId),
    { error: null },
  );

  if (!canManage) {
    return (
      <p className="text-sm text-muted-foreground">
        Defaults are managed by organization admins.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <input type="hidden" name="version" value={settings.version} />
      <div className="space-y-1.5">
        <Label htmlFor="def-tax">Default tax rate for new lines</Label>
        <Select
          name="defaultTaxRateId"
          defaultValue={settings.defaultTaxRateId ?? "none"}
        >
          <SelectTrigger id="def-tax" className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No tax</SelectItem>
            {taxRates.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name} ({(t.rateBps / 100).toFixed(2).replace(/\.?0+$/, "")}%)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="def-notes">Default customer notes</Label>
          <Textarea
            id="def-notes"
            name="defaultInvoiceNotes"
            rows={3}
            placeholder="Thank you for your business."
            defaultValue={settings.defaultInvoiceNotes ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="def-terms">Default terms & conditions</Label>
          <Textarea
            id="def-terms"
            name="defaultInvoiceTerms"
            rows={3}
            placeholder="Payment due within the stated terms."
            defaultValue={settings.defaultInvoiceTerms ?? ""}
          />
        </div>
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save defaults"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Prefilled into every new invoice; editable per document.
      </p>
    </form>
  );
}
