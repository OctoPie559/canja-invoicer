import { Zap, Check } from "lucide-react";
import { F } from "../tokens";
import { CtaButton, GhostButton } from "../parts";

// Deep-green ink used over the bright hero green.
const HERO_INK = "#0B2A03";

/**
 * Hero: a full-bleed green stage with the brand photo behind a top-down fade.
 * The background sits in its own layer (`data-hero-bg`) so the shell can
 * parallax it on scroll. Pulled up under the transparent nav (margin corrected
 * to the nav's real height by the shell; the inline value is the no-JS fallback).
 */
export function Hero() {
  return (
    <header
      id="top"
      className="cj-hero"
      style={{
        position: "relative",
        overflow: "hidden",
        marginTop: -68,
        padding: "150px 32px clamp(170px,22vw,280px)",
        textAlign: "center",
        backgroundColor: "#77DC72",
      }}
    >
      <div
        data-hero-bg
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: -160,
          bottom: 0,
          backgroundImage: "url('/bg-image.webp')",
          backgroundSize: "cover",
          backgroundPosition: "center bottom",
          backgroundRepeat: "no-repeat",
          willChange: "transform",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg,rgba(119,220,114,.96) 0%,rgba(119,220,114,.88) 52%,rgba(119,220,114,.55) 78%,rgba(119,220,114,0) 100%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "relative",
          maxWidth: 860,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 24,
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: "#FFFFFF",
            color: "#103B05",
            border: "1px solid rgba(11,42,3,.15)",
            borderRadius: 999,
            padding: "7px 16px",
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: ".04em",
            textTransform: "uppercase",
            boxShadow: "0 2px 10px rgba(11,42,3,.12)",
          }}
        >
          <Zap size={14} strokeWidth={2} />
          Built for how Kenya gets paid
        </div>

        <h1
          style={{
            margin: 0,
            fontFamily: F.heading,
            fontWeight: 700,
            fontSize: "clamp(44px,6.4vw,78px)",
            lineHeight: 1.04,
            letterSpacing: "-0.02em",
            textWrap: "balance",
            color: HERO_INK,
          }}
        >
          Invoices that actually get paid.
        </h1>

        <p
          style={{
            margin: 0,
            maxWidth: 640,
            fontSize: 19,
            lineHeight: 1.6,
            color: "rgba(11,42,3,.82)",
            textWrap: "pretty",
          }}
        >
          Professional invoices, M-Pesa payments, and one clear record of every
          shilling — built for Kenyan freelancers and small teams.
        </p>

        <div
          style={{
            display: "flex",
            gap: 14,
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          <CtaButton pulse>Start free</CtaButton>
          <GhostButton href="#how">See how it works</GhostButton>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 14,
            fontWeight: 500,
            color: "rgba(11,42,3,.85)",
          }}
        >
          <Check size={15} strokeWidth={2} color={HERO_INK} />
          Free forever core&nbsp;·&nbsp;No card required&nbsp;·&nbsp;Built for
          Kenya
        </div>
      </div>
    </header>
  );
}
