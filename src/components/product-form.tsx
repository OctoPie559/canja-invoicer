"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import type { ActionState } from "@/app/actions/organizations";
import {
  createProductAction,
  updateProductAction,
} from "@/app/actions/products";
import { SUPPORTED_CURRENCIES } from "@/lib/validation/currencies";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const initialState: ActionState = { error: null };

/** Common units offered alongside whatever the org has already used. */
const DEFAULT_UNITS = [
  "hour",
  "day",
  "week",
  "month",
  "project",
  "item",
  "piece",
  "kg",
  "page",
  "word",
];

export interface ProductFormValues {
  id?: string;
  version?: number;
  name?: string;
  productType?: string;
  description?: string | null;
  unitLabel?: string | null;
  /** decimal string, e.g. "1500.00" */
  unitPrice?: string;
  currency?: string;
}

/** Combobox with type-to-add: pick an existing unit or create a new one. */
function UnitCombobox({
  options,
  defaultValue,
}: {
  options: string[];
  defaultValue?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(defaultValue ?? "");
  const [query, setQuery] = useState("");
  const all = [...new Set([...options, ...DEFAULT_UNITS])].sort();
  const trimmed = query.trim().toLowerCase();
  const canCreate =
    trimmed.length > 0 && !all.some((u) => u.toLowerCase() === trimmed);

  const choose = (unit: string) => {
    setValue(unit);
    setQuery("");
    setOpen(false);
  };

  return (
    <>
      <input type="hidden" name="unitLabel" value={value} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            {value || (
              <span className="text-muted-foreground">
                Select or type to add
              </span>
            )}
            <ChevronsUpDown className="size-4 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0">
          <Command>
            <CommandInput
              placeholder="Search or type a new unit…"
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              <CommandEmpty>No matching unit.</CommandEmpty>
              <CommandGroup>
                {all.map((unit) => (
                  <CommandItem key={unit} value={unit} onSelect={() => choose(unit)}>
                    <Check
                      className={cn(
                        "size-4",
                        value === unit ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {unit}
                  </CommandItem>
                ))}
                {canCreate && (
                  <CommandItem
                    value={query.trim()}
                    onSelect={() => choose(query.trim())}
                  >
                    <Plus className="size-4" />
                    Add &quot;{query.trim()}&quot;
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  );
}

export function ProductForm({
  organizationId,
  product,
  unitOptions,
  cancelHref,
}: {
  organizationId: string;
  product?: ProductFormValues;
  /** Unit labels already used by the org. */
  unitOptions: string[];
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
    <form action={action} className="space-y-6">
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

      <fieldset className="space-y-4">
        <legend className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
          Item information
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="p-name">Name</Label>
            <Input id="p-name" name="name" required defaultValue={product?.name ?? ""} />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <div className="flex h-8 items-center gap-6 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="productType"
                  value="service"
                  defaultChecked={(product?.productType ?? "service") === "service"}
                  className="size-4 accent-primary"
                />
                Service
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="productType"
                  value="goods"
                  defaultChecked={product?.productType === "goods"}
                  className="size-4 accent-primary"
                />
                Goods
              </label>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Unit</Label>
            <UnitCombobox
              options={unitOptions}
              defaultValue={product?.unitLabel}
            />
          </div>
          {/* product image slot lands here with the R2 storage adapter (slice 4) */}
        </div>
      </fieldset>

      <fieldset className="space-y-4 border-t pt-4">
        <legend className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
          Sales information
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="p-price">Selling price</Label>
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
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="p-description">Description</Label>
            <Textarea
              id="p-description"
              name="description"
              rows={3}
              defaultValue={product?.description ?? ""}
            />
          </div>
        </div>
      </fieldset>

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
