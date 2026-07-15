import Link from "next/link";
import { C, F, START_FREE_HREF } from "../tokens";
import { CheckMark, CtaButton, Eyebrow, SectionTitle } from "../parts";

const FREE = [
  "Unlimited branded invoices & quotes",
  "M-Pesa payment recording",
  "Cash-flow dashboard & who-owes-you view",
  "Full audit trail & credit notes",
  "One user, generous volume",
];

const PRO = [
  "Everything in Free, plus:",
  "Team seats & roles",
  "Recurring invoices & automated reminders",
  "Multi-currency billing",
  "Custom branding, templates & client portal",
  "Advanced reports",
];

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <CheckMark />
      {children}
    </span>
  );
}

const priceRow: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 6,
};
const amount: React.CSSProperties = {
  fontFamily: F.heading,
  fontWeight: 700,
  fontSize: 42,
  letterSpacing: "-0.02em",
};
const list: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  fontSize: 14.5,
  borderTop: `1px solid ${C.border}`,
  paddingTop: 22,
};

/** Pricing — Free feels like a real home; Pro is highlighted. */
export function Pricing() {
  return (
    <section
      id="pricing"
      data-reveal
      className="cj-pad"
      style={{
        background: C.alt,
        borderTop: `1px solid ${C.border}`,
        borderBottom: `1px solid ${C.border}`,
        padding: "112px 32px",
      }}
    >
      <div
        style={{
          maxWidth: 960,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 56,
        }}
      >
        <div
          style={{
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            gap: 16,
            alignItems: "center",
          }}
        >
          <Eyebrow>Pricing</Eyebrow>
          <SectionTitle style={{ fontWeight: 600 }}>
            Free is a real home, not a trap.
          </SectionTitle>
          <p
            style={{
              margin: 0,
              maxWidth: 560,
              fontSize: 17,
              lineHeight: 1.6,
              color: C.muted,
            }}
          >
            The core invoicing loop is free forever. Upgrade when your business
            does.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))",
            gap: 20,
            alignItems: "stretch",
          }}
        >
          {/* Free */}
          <div
            style={{
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 16,
              padding: 36,
              display: "flex",
              flexDirection: "column",
              gap: 22,
            }}
          >
            <div
              style={{ display: "flex", flexDirection: "column", gap: 6 }}
            >
              <span
                style={{
                  fontFamily: F.heading,
                  fontWeight: 600,
                  fontSize: 21,
                }}
              >
                Free
              </span>
              <span style={{ fontSize: 14, color: C.muted }}>
                Everything you need to bill and get paid.
              </span>
            </div>
            <div style={priceRow}>
              <span style={amount}>KSh 0</span>
              <span style={{ fontSize: 14, color: C.muted }}>forever</span>
            </div>
            <div style={list}>
              {FREE.map((f) => (
                <Feature key={f}>{f}</Feature>
              ))}
            </div>
            <Link
              href={START_FREE_HREF}
              className="cj-outline"
              style={{
                marginTop: "auto",
                display: "block",
                textAlign: "center",
                background: C.surface,
                color: C.ink,
                fontWeight: 600,
                fontSize: 15,
                padding: "14px 0",
                borderRadius: 10,
                border: `1px solid ${C.ink}`,
              }}
            >
              Start free
            </Link>
          </div>

          {/* Pro */}
          <div
            style={{
              background: C.surface,
              border: `2px solid ${C.green800}`,
              borderRadius: 16,
              padding: 36,
              display: "flex",
              flexDirection: "column",
              gap: 22,
              boxShadow: "0 16px 40px rgba(16,59,5,.12)",
              position: "relative",
            }}
          >
            <span
              style={{
                position: "absolute",
                top: -13,
                left: 36,
                background: C.goldSoft,
                color: C.ink,
                border: `1px solid ${C.gold}`,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: ".06em",
                textTransform: "uppercase",
                padding: "4px 12px",
                borderRadius: 999,
              }}
            >
              Pro
            </span>
            <div
              style={{ display: "flex", flexDirection: "column", gap: 6 }}
            >
              <span
                style={{
                  fontFamily: F.heading,
                  fontWeight: 600,
                  fontSize: 21,
                }}
              >
                Pro
              </span>
              <span style={{ fontSize: 14, color: C.muted }}>
                For teams and freelancers going full-time.
              </span>
            </div>
            <div style={priceRow}>
              <span style={amount}>KSh 1,500</span>
              <span style={{ fontSize: 14, color: C.muted }}>/ month</span>
            </div>
            <div style={list}>
              {PRO.map((f) => (
                <Feature key={f}>{f}</Feature>
              ))}
            </div>
            <CtaButton
              size="md"
              style={{
                marginTop: "auto",
                display: "block",
                textAlign: "center",
                fontSize: 15,
                padding: "14px 0",
                borderRadius: 10,
              }}
            >
              Start free, upgrade later
            </CtaButton>
          </div>
        </div>

        <p
          style={{
            margin: 0,
            textAlign: "center",
            fontSize: 14,
            color: C.muted,
          }}
        >
          No card to start. Upgrade or downgrade any time — your data stays yours.
        </p>
      </div>
    </section>
  );
}
