import { maskPiiInText } from "@/lib/domain/pii";

/**
 * Deep-scrub every string in an outbound Sentry payload (event, breadcrumb,
 * or log): MSISDNs must never leave the system unmasked (PROJECT_BRIEF.md
 * §7), and email local parts are masked too (ARCHITECTURE.md §7).
 * Non-string values (timestamps, ids) are untouched.
 */
export function scrubStrings<T>(value: T): T {
  return scrubValue(value) as T;
}

const EMAIL_PATTERN =
  /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*(@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

function maskEmailsInText(text: string): string {
  return text.replace(EMAIL_PATTERN, "$1***$2");
}

function scrubValue(value: unknown): unknown {
  if (typeof value === "string") {
    return maskEmailsInText(maskPiiInText(value));
  }
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
