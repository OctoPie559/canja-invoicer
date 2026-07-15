import Image from "next/image";
import Link from "next/link";
import { Check } from "lucide-react";
import { C, F, START_FREE_HREF } from "./tokens";

/** The Canja wordmark. `variant` picks the colour treatment for the surface. */
export function Wordmark({
  variant = "color",
  height = 26,
  alt = "Canja",
  style,
}: {
  variant?: "color" | "white" | "black";
  height?: number;
  alt?: string;
  style?: React.CSSProperties;
}) {
  const src = {
    color: "/logo_assets/wordmark-color.png",
    white: "/logo_assets/wordmark-white.png",
    black: "/logo_assets/wordmark-black.png",
  }[variant];
  return (
    <Image
      src={src}
      alt={alt}
      width={512}
      height={512}
      priority
      style={{ height, width: "80px", display: "block", ...style }}
    />
  );
}

/** Small green uppercase label that opens most sections. */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: ".08em",
        textTransform: "uppercase",
        color: C.green600,
      }}
    >
      {children}
    </span>
  );
}

/** Section heading in the display face. */
export function SectionTitle({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <h2
      style={{
        margin: 0,
        fontFamily: F.heading,
        fontWeight: 600,
        fontSize: "clamp(30px,4vw,46px)",
        lineHeight: 1.15,
        letterSpacing: "-0.02em",
        textWrap: "balance",
        ...style,
      }}
    >
      {children}
    </h2>
  );
}

/** Green check used in feature/plan lists. */
export function CheckMark({ size = 14 }: { size?: number }) {
  return (
    <Check
      size={size}
      strokeWidth={2.5}
      color={C.green600}
      style={{ flexShrink: 0, marginTop: 3 }}
    />
  );
}

/** Primary gold CTA. Defaults to the signup route. */
export function CtaButton({
  children,
  href = START_FREE_HREF,
  size = "md",
  pulse = false,
  style,
}: {
  children: React.ReactNode;
  href?: string;
  size?: "sm" | "md" | "lg";
  pulse?: boolean;
  style?: React.CSSProperties;
}) {
  const pad =
    size === "lg" ? "18px 40px" : size === "sm" ? "10px 20px" : "16px 32px";
  const font = size === "lg" ? 18 : size === "sm" ? 14.5 : 17;
  return (
    <Link
      href={href}
      className="cj-cta"
      style={{
        display: "inline-block",
        background: C.gold,
        color: C.ink,
        fontWeight: 700,
        fontSize: font,
        padding: pad,
        borderRadius: 12,
        transition: "background .12s,transform .12s",
        ...(pulse ? { animation: "goldPulse 2.8s ease-out 3" } : null),
        ...style,
      }}
    >
      {children}
    </Link>
  );
}

/** Secondary white/outline button (e.g. “See how it works”). */
export function GhostButton({
  children,
  href,
  style,
}: {
  children: React.ReactNode;
  href: string;
  style?: React.CSSProperties;
}) {
  return (
    <a
      href={href}
      className="cj-ghost"
      style={{
        display: "inline-block",
        background: C.surface,
        color: C.ink,
        fontWeight: 600,
        fontSize: 17,
        padding: "16px 32px",
        borderRadius: 12,
        border: `1px solid ${C.border}`,
        transition: "background .12s",
        ...style,
      }}
    >
      {children}
    </a>
  );
}
