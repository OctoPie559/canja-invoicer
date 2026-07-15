import { X, Check } from "lucide-react";
import { C, F } from "../tokens";
import { Eyebrow, SectionTitle, Wordmark } from "../parts";

const GLOBAL = [
  "Cards & Stripe first — M-Pesa is a clunky workaround",
  "USD-first defaults, KES an afterthought",
  "No KRA PIN, no Kenyan business context",
  "Desktop-first, heavy on variable connections",
];

const CANJA: [string, string][] = [
  ["M-Pesa native", " — the way your clients already pay"],
  ["KES by default", ", multi-currency when you need it"],
  ["KRA PIN on every invoice", ", built for Kenyan business"],
  ["Fast and light on mobile", " — built for the phone in your pocket"],
];

function Row({
  ok,
  children,
}: {
  ok: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <span style={{ flexShrink: 0, marginTop: 2 }}>
        {ok ? (
          <Check size={16} strokeWidth={2.5} color={C.green600} />
        ) : (
          <X size={16} strokeWidth={2} color={C.danger} />
        )}
      </span>
      <span>{children}</span>
    </div>
  );
}

/** Why Canja — confident, non-defensive comparison vs the incumbents. */
export function WhyCanja() {
  return (
    <section
      id="why"
      data-reveal
      style={{
        background: C.alt,
        borderTop: `1px solid ${C.border}`,
        borderBottom: `1px solid ${C.border}`,
        padding: "112px 32px",
      }}
    >
      <div
        style={{
          maxWidth: 1080,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 56,
        }}
      >
        <div
          style={{
            maxWidth: 720,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <Eyebrow>Why Canja</Eyebrow>
          <SectionTitle style={{ fontWeight: 600 }}>
            Zoho and QuickBooks are built for cards. Canja is built for M-Pesa.
          </SectionTitle>
          <p
            style={{
              margin: 0,
              fontSize: 17,
              lineHeight: 1.6,
              color: C.muted,
              textWrap: "pretty",
            }}
          >
            Global tools assume Stripe and card checkouts — not native for Kenyan
            merchants. Canja is local by design.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))",
            gap: 20,
            alignItems: "stretch",
          }}
        >
          <div
            style={{
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 16,
              padding: 32,
              display: "flex",
              flexDirection: "column",
              gap: 20,
            }}
          >
            <span
              style={{
                fontFamily: F.heading,
                fontWeight: 600,
                fontSize: 19,
                color: C.muted,
              }}
            >
              Global tools
            </span>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 14,
                fontSize: 15,
                color: C.muted,
              }}
            >
              {GLOBAL.map((g) => (
                <Row key={g} ok={false}>
                  {g}
                </Row>
              ))}
            </div>
          </div>

          <div
            style={{
              background: C.surface,
              border: `2px solid ${C.green600}`,
              borderRadius: 16,
              padding: 32,
              display: "flex",
              flexDirection: "column",
              gap: 20,
              boxShadow: "0 12px 32px rgba(16,59,5,.10)",
            }}
          >
            <Wordmark height={20} />
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 14,
                fontSize: 15,
                color: C.ink,
              }}
            >
              {CANJA.map(([bold, rest]) => (
                <Row key={bold} ok>
                  <strong>{bold}</strong>
                  {rest}
                </Row>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
