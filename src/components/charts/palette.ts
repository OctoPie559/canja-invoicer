/**
 * Chart palette — every set below was run through the dataviz skill's
 * validate_palette.js (lightness band, chroma floor, adjacent-pair CVD
 * separation, contrast vs surface) in BOTH light and dark modes on
 * 2026-07-08. Change a hex → re-run the validator; never eyeball.
 *
 * Rules applied: color follows the entity (a series/status keeps its hue
 * everywhere), text wears text tokens (never series color), status colors
 * are reserved and always ship with a label.
 */

/** Two-series pair (cash flow): passes light AND dark unchanged. */
export const SERIES = {
  collected: "#2E7D32", // green — money in
  invoiced: "#2F6DB5", // blue — money billed
} as const;

/** Status palette; dark mode is its own validated set, not an auto-flip. */
export const STATUS_COLORS: Record<
  string,
  { light: string; dark: string }
> = {
  draft: { light: "#6B7280", dark: "#9CA3AF" }, // neutral
  sent: { light: "#2F6DB5", dark: "#3B82F6" },
  partial: { light: "#D97706", dark: "#D97706" },
  overdue: { light: "#DC2626", dark: "#EF4444" },
  paid: { light: "#2E7D32", dark: "#34A853" },
  void: { light: "#9CA3AF", dark: "#6B7280" },
};

/**
 * Aging = magnitude of lateness → sequential, one hue light→dark
 * (monotonic tailwind red steps); "current" is not late → neutral.
 */
export const AGING_COLORS: Record<string, { light: string; dark: string }> = {
  current: { light: "#9CA3AF", dark: "#6B7280" },
  "1-30": { light: "#FCA5A5", dark: "#F87171" },
  "31-60": { light: "#F87171", dark: "#EF4444" },
  "61-90": { light: "#EF4444", dark: "#DC2626" },
  "90+": { light: "#B91C1C", dark: "#B91C1C" },
};
