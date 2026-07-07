/**
 * Helpers for audit `changes` payloads and version-history row images.
 * JSONB columns are JSON.stringify'd by the driver, which throws on bigint —
 * money values are serialized as strings (minor units) instead.
 */

type Plain = Record<string, unknown>;

function safeValue(v: unknown): unknown {
  if (typeof v === "bigint") return v.toString();
  if (Array.isArray(v)) return v.map(safeValue);
  if (v !== null && typeof v === "object" && !(v instanceof Date)) {
    return jsonSafe(v as Plain);
  }
  return v;
}

/** Deep: invoice snapshots nest money inside lines/totals objects. */
export function jsonSafe(value: Plain): Plain {
  const result: Plain = {};
  for (const [key, v] of Object.entries(value)) {
    result[key] = safeValue(v);
  }
  return result;
}

/** before/after restricted to the fields that actually changed. */
export function changedFields(
  before: Plain,
  after: Plain,
  fields: readonly string[],
): { before: Plain; after: Plain; changed: string[] } {
  const b: Plain = {};
  const a: Plain = {};
  const changed: string[] = [];
  for (const f of fields) {
    const prev = before[f] ?? null;
    const next = after[f] ?? null;
    const equal =
      typeof prev === "bigint" || typeof next === "bigint"
        ? String(prev) === String(next)
        : prev === next;
    if (!equal) {
      changed.push(f);
      b[f] = typeof prev === "bigint" ? prev.toString() : prev;
      a[f] = typeof next === "bigint" ? next.toString() : next;
    }
  }
  return { before: b, after: a, changed };
}
