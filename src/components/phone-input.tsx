"use client";

import { useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import {
  AsYouType,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";
import { COUNTRIES, DEFAULT_COUNTRY } from "@/lib/domain/countries";
import { Input } from "@/components/ui/input";
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

/** Format national digits the way the chosen country writes them. */
function formatNational(country: CountryCode, input: string): string {
  return new AsYouType(country).input(input);
}

/** Canonical E.164 for storage; falls back to a best-effort +dial+digits. */
function toE164(country: CountryCode, national: string): string {
  const digits = national.replace(/\D/g, "");
  if (!digits) return "";
  const parsed = parsePhoneNumberFromString(digits, country);
  if (parsed) return parsed.number;
  return `+${getCountryCallingCode(country)}${digits}`;
}

/** Split an existing stored value back into a country + display number. */
function seed(raw: string | null | undefined): {
  country: CountryCode;
  display: string;
} {
  if (!raw) return { country: DEFAULT_COUNTRY, display: "" };
  const parsed = raw.startsWith("+")
    ? parsePhoneNumberFromString(raw)
    : parsePhoneNumberFromString(raw, DEFAULT_COUNTRY);
  if (parsed?.country) {
    return {
      country: parsed.country,
      display: formatNational(parsed.country, parsed.nationalNumber),
    };
  }
  return { country: DEFAULT_COUNTRY, display: raw };
}

/**
 * International phone input (issue 9): a country dial-code picker plus a
 * national-number field formatted the local way (Kenya +254 7xx xxx xxx, US
 * (xxx) xxx-xxxx). Stores canonical E.164. Uncontrolled by default (posts via
 * a hidden input `name`); pass value/onChange to control it (contact grid).
 */
export function PhoneInput({
  name,
  id,
  defaultValue,
  value: controlledValue,
  onChange,
  placeholder,
}: {
  name?: string;
  id?: string;
  defaultValue?: string | null;
  value?: string | null;
  onChange?: (e164: string) => void;
  placeholder?: string;
}) {
  const initial = seed(controlledValue ?? defaultValue);
  const [country, setCountry] = useState<CountryCode>(initial.country);
  const [display, setDisplay] = useState(initial.display);
  const [open, setOpen] = useState(false);

  const emit = (c: CountryCode, d: string) => {
    onChange?.(toE164(c, d));
  };

  const onCountry = (c: CountryCode) => {
    setCountry(c);
    setOpen(false);
    emit(c, display);
  };
  const onNumber = (raw: string) => {
    const formatted = formatNational(country, raw);
    setDisplay(formatted);
    emit(country, formatted);
  };

  return (
    <div className="flex gap-2">
      {name && <input type="hidden" name={name} value={toE164(country, display)} />}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Country code"
            className="flex shrink-0 items-center gap-1 border bg-transparent px-1 text-[10px]"
          >
            <span className="text-muted-foreground">
              +{getCountryCallingCode(country)}
            </span>
            <ChevronsUpDown className="size-2.5 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0">
          <Command>
            <CommandInput placeholder="Search countries…" />
            <CommandList>
              <CommandEmpty>No matching country.</CommandEmpty>
              <CommandGroup>
                {COUNTRIES.map((c) => (
                  <CommandItem
                    key={c.code}
                    value={`${c.name} +${c.dialCode}`}
                    onSelect={() => onCountry(c.code)}
                  >
                    <span className="flex-1">{c.name}</span>
                    <span className="text-muted-foreground">+{c.dialCode}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder={placeholder}
        value={display}
        onChange={(e) => onNumber(e.target.value)}
      />
    </div>
  );
}
