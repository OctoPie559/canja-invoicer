"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { COUNTRIES } from "@/lib/domain/countries";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * Searchable country picker (issue 8). Stores the country NAME (the address
 * columns are free text and already hold names), so this is a friendlier input
 * over the same data — no migration, existing values still render. Uncontrolled
 * by default (posts via a hidden input `name`); pass value/onChange to control.
 */
export function CountrySelect({
  name,
  id,
  defaultValue,
  value: controlledValue,
  onChange,
  placeholder = "Select a country",
}: {
  name?: string;
  id?: string;
  defaultValue?: string | null;
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [internal, setInternal] = useState(defaultValue ?? "");
  const value = controlledValue ?? internal;

  const set = (v: string) => {
    if (onChange) onChange(v);
    else setInternal(v);
    setOpen(false);
  };

  return (
    <>
      {name && <input type="hidden" name={name} value={value} />}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            id={id}
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            {value || <span className="text-muted-foreground">{placeholder}</span>}
            <ChevronsUpDown className="size-4 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0">
          <Command>
            <CommandInput placeholder="Search countries…" />
            <CommandList>
              <CommandEmpty>No matching country.</CommandEmpty>
              <CommandGroup>
                {value && (
                  <CommandItem value={`__clear ${value}`} onSelect={() => set("")}>
                    <Check className="size-4 opacity-0" />
                    <span className="text-muted-foreground">Clear</span>
                  </CommandItem>
                )}
                {COUNTRIES.map((c) => (
                  <CommandItem key={c.code} value={c.name} onSelect={() => set(c.name)}>
                    <Check
                      className={cn("size-4", value === c.name ? "opacity-100" : "opacity-0")}
                    />
                    {c.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  );
}
