"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { ActionState } from "@/app/actions/organizations";
import {
  createProductAction,
  updateProductAction,
} from "@/app/actions/products";
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

export interface ProductFormValues {
  id?: string;
  version?: number;
  name?: string;
  description?: string | null;
  unitLabel?: string | null;
  /** decimal string, e.g. "1500.00" */
  unitPrice?: string;
  currency?: string;
}

export function ProductForm({
  organizationId,
  product,
  cancelHref,
}: {
  organizationId: string;
  product?: ProductFormValues;
  cancelHref: string;
}) {
  const editing = Boolean(product?.id);
  const [state, action, pending] = useActionState(
    (editing ? updateProductAction : createProductAction).bind(
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
          <input type="hidden" name="id" value={product!.id} />
          <input type="hidden" name="version" value={product!.version} />
        </>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="p-name">Name</Label>
          <Input id="p-name" name="name" required defaultValue={product?.name ?? ""} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="p-description">Description</Label>
          <Textarea
            id="p-description"
            name="description"
            rows={3}
            defaultValue={product?.description ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="p-price">Unit price</Label>
          <Input
            id="p-price"
            name="unitPrice"
            required
            inputMode="decimal"
            pattern="^\d+(\.\d{1,2})?$"
            placeholder="1500.00"
            defaultValue={product?.unitPrice ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="p-currency">Currency</Label>
          <Select name="currency" defaultValue={product?.currency ?? "KES"}>
            <SelectTrigger id="p-currency" className="w-full">
              <SelectValue />
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
          <Label htmlFor="p-unit">Unit label</Label>
          <Input
            id="p-unit"
            name="unitLabel"
            placeholder="hour, project, item…"
            defaultValue={product?.unitLabel ?? ""}
          />
        </div>
      </div>
      <div className="flex items-center gap-2 border-t pt-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : editing ? "Save changes" : "Create product"}
        </Button>
        <Button asChild type="button" variant="outline">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
