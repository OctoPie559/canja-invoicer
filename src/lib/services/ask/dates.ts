import type { Period } from "@/lib/validation/ask";

/**
 * Resolve a symbolic period to inclusive ISO date bounds. Date math happens
 * HERE, in code — the LLM only ever names a symbol or passes an explicit
 * range through.
 *
 * ponytail: Kenya-first — Nairobi is a fixed UTC+3 with no DST, so "today"
 * is plain offset arithmetic. Add a per-org timezone setting when Canja
 * leaves East Africa.
 */
const NAIROBI_OFFSET_MS = 3 * 60 * 60 * 1000;

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}

export function resolvePeriod(
  period: Period,
  now: Date = new Date(),
): { from: string | null; to: string | null } {
  if (typeof period === "object") return { from: period.from, to: period.to };
  if (period === "all_time") return { from: null, to: null };

  const local = new Date(now.getTime() + NAIROBI_OFFSET_MS);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const q = Math.floor(m / 3);

  switch (period) {
    case "this_month":
      return { from: iso(y, m, 1), to: iso(y, m, daysInMonth(y, m)) };
    case "last_month": {
      const ly = m === 0 ? y - 1 : y;
      const lm = m === 0 ? 11 : m - 1;
      return { from: iso(ly, lm, 1), to: iso(ly, lm, daysInMonth(ly, lm)) };
    }
    case "this_quarter":
      return { from: iso(y, q * 3, 1), to: iso(y, q * 3 + 2, daysInMonth(y, q * 3 + 2)) };
    case "last_quarter": {
      const ly = q === 0 ? y - 1 : y;
      const start = q === 0 ? 9 : (q - 1) * 3;
      return { from: iso(ly, start, 1), to: iso(ly, start + 2, daysInMonth(ly, start + 2)) };
    }
    case "this_year":
      return { from: iso(y, 0, 1), to: iso(y, 11, 31) };
    case "last_year":
      return { from: iso(y - 1, 0, 1), to: iso(y - 1, 11, 31) };
  }
}

/** Human label for the answer prompt ("2026-07-01 to 2026-07-31"). */
export function periodLabel(range: {
  from: string | null;
  to: string | null;
}): string {
  if (!range.from && !range.to) return "all time";
  return `${range.from ?? "the beginning"} to ${range.to ?? "today"}`;
}
