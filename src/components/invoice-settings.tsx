"use client";

import { useActionState, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  createTaxRateAction,
  deleteTaxRateAction,
  updateInvoiceNumberingAction,
} from "@/app/actions/settings";
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
    defaultPaymentTermsDays: number;
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
        <div className="space-y-1.5">
          <Label htmlFor="num-terms">Payment terms (days)</Label>
          <Input
            id="num-terms"
            name="defaultPaymentTermsDays"
            type="number"
            min={0}
            max={365}
            defaultValue={settings.defaultPaymentTermsDays}
            className="w-36"
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
