import { maskPiiInText } from "@/lib/domain/pii";

/**
 * Deep-scrub every string in an outbound Sentry payload (event or
 * breadcrumb): MSISDNs must never leave the system unmasked
 * (PROJECT_BRIEF.md §7). Non-string values (timestamps, ids) are untouched.
 */
export function scrubStrings<T>(value: T): T {
  return scrubValue(value) as T;
}

function scrubValue(value: unknown): unknown {
  if (typeof value === "string") return maskPiiInText(value);
  if (Array.isArray(value)) return value.map(scrubValue);
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      result[key] = scrubValue(v);
    }
    return result;
  }
  return value;
}
