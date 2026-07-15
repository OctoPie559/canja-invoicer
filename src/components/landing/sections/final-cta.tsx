import { C, F } from "../tokens";
import { CtaButton, Wordmark } from "../parts";

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "#features" },
      { label: "Pricing", href: "#pricing" },
      { label: "How it works", href: "#how" },
      { label: "For freelancers", href: "#why" },
      { label: "For agencies", href: "#why" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "#top" },
      { label: "Contact", href: "#top" },
      { label: "WhatsApp us", href: "#top" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Blog", href: "#top" },
      { label: "Help / FAQ", href: "#faq" },
      { label: "M-Pesa guide", href: "#top" },
      { label: "Compare", href: "#why" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "#top" },
      { label: "Terms", href: "#top" },
      { label: "Data protection", href: "#top" },
    ],
  },
];

const colHead: React.CSSProperties = {
  fontWeight: 600,
  fontSize: 12.5,
  letterSpacing: ".07em",
  textTransform: "uppercase",
  color: C.darkText,
};

/** Final CTA band (the one deep-green moment) + the site footer. */
export function FinalCta() {
  return (
    <section id="cta" style={{ background: C.green900, color: C.darkText }}>
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "120px 32px 96px",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 28,
        }}
      >
        <Wordmark variant="white" height={32} />
        <h2
          style={{
            margin: 0,
            fontFamily: F.heading,
            fontWeight: 700,
            fontSize: "clamp(36px,5vw,64px)",
            lineHeight: 1.08,
            letterSpacing: "-0.02em",
            maxWidth: 820,
            textWrap: "balance",
          }}
        >
          Send your first invoice in the next five minutes.
        </h2>
        <p
          style={{
            margin: 0,
            fontSize: 18,
            color: C.darkMuted,
            maxWidth: 520,
            lineHeight: 1.6,
          }}
        >
          Free forever core. No card required. Built for how Kenya gets paid.
        </p>
        <CtaButton
          size="lg"
          style={{ boxShadow: "0 8px 24px rgba(244,164,35,.35)" }}
        >
          Start free
        </CtaButton>
      </div>

      <footer style={{ borderTop: "1px solid rgba(243,249,240,.14)" }}>
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "64px 32px 40px",
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr",
            gap: 40,
            fontSize: 14,
          }}
        >
          <div
            style={{ display: "flex", flexDirection: "column", gap: 16 }}
          >
            <Wordmark variant="white" height={32} />
            <p
              style={{
                margin: 0,
                color: C.darkMuted,
                lineHeight: 1.6,
                maxWidth: 260,
              }}
            >
              Invoicing and payments for Kenyan freelancers and small teams. From
              finished work to paid — the M-Pesa way.
            </p>
          </div>
          {COLUMNS.map((col) => (
            <div
              key={col.title}
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              <span style={colHead}>{col.title}</span>
              {col.links.map((l) => (
                <a key={l.label} href={l.href} className="cj-foot-link">
                  {l.label}
                </a>
              ))}
            </div>
          ))}
        </div>
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "0 32px 40px",
          }}
        >
          <div
            style={{
              borderTop: "1px solid rgba(243,249,240,.14)",
              paddingTop: 24,
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 16,
              fontSize: 13.5,
              color: C.darkMuted,
            }}
          >
            <span>© 2026 Canja. All rights reserved.</span>
            <span>Made in Kenya 🇰🇪</span>
          </div>
        </div>
      </footer>
    </section>
  );
}
