/**
 * Landing-page design tokens — the Canja brand palette (PROJECT brief §10) and
 * font stacks, in one place so the marketing sections stay consistent and are
 * trivial to re-theme. Edit a colour here and every section follows.
 *
 * These are plain constants (not Tailwind) on purpose: the landing design uses
 * exact hex + clamp() type the app's theme doesn't define, and inline styles
 * keyed off this object read closer to the design than a wall of arbitrary
 * Tailwind values would.
 */
export const C = {
  // neutrals (warm, to sit with the green)
  canvas: "#FBFAF7",
  surface: "#FFFFFF",
  alt: "#F4F5F1",
  border: "#E7E5DE",
  ink: "#14231A",
  muted: "#6B7A70",
  // brand green scale (anchored on #103B05)
  green900: "#0B2A03",
  green800: "#103B05",
  green600: "#1F6A16",
  green300: "#8FD07E",
  green100: "#E6F3E1",
  // warm-gold accent (CTAs only)
  gold: "#F4A423",
  goldHover: "#DB9016",
  goldSoft: "#FDEFD4",
  // dark band (final CTA + footer)
  darkText: "#F3F9F0",
  darkMuted: "#A9C4A0",
  // semantic
  success: "#2E7D32",
  warn: "#D97706",
  danger: "#DC2626",
} as const;

export const F = {
  heading: "var(--font-heading),'Bricolage Grotesque',sans-serif",
  sans: "var(--font-sans),'Outfit',sans-serif",
  mono: "var(--font-geist-mono),'Geist Mono',monospace",
} as const;

/** Real auth routes the marketing CTAs point at. */
export const START_FREE_HREF = "/signup";
export const LOGIN_HREF = "/login";
