import {
  getCountries,
  getCountryCallingCode,
  type CountryCode,
} from "libphonenumber-js";

/**
 * Country reference data (issues 8 & 9), derived from libphonenumber-js's
 * metadata + Intl.DisplayNames so there is no hand-maintained list to rot.
 * Names are the value we store (the address columns are free text and already
 * hold names), so switching a free-text input to a select is display-only —
 * no migration, existing rows keep rendering.
 */

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

export interface CountryInfo {
  /** ISO 3166-1 alpha-2, e.g. "KE" */
  code: CountryCode;
  /** English display name, e.g. "Kenya" — what we persist */
  name: string;
  /** international calling code without "+", e.g. "254" */
  dialCode: string;
}

export const COUNTRIES: CountryInfo[] = getCountries()
  .map((code) => ({
    code,
    name: regionNames.of(code) ?? code,
    dialCode: getCountryCallingCode(code),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

/** Default to Kenya (Kenya-first) when nothing else is known. */
export const DEFAULT_COUNTRY: CountryCode = "KE";

export function countryByCode(code: string): CountryInfo | undefined {
  return BY_CODE.get(code as CountryCode);
}
