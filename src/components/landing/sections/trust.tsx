import { C, F } from "../tokens";
import { Eyebrow, SectionTitle } from "../parts";
import { TrustIllos } from "./trust-illustrations";

const CARDS = [
  {
    span: 2,
    illo: TrustIllos.immutable,
    title: "Immutable records",
    body: "Once issued, an invoice can't be quietly edited. Corrections happen through credit notes — on the record.",
  },
  {
    span: 2,
    illo: TrustIllos.audit,
    title: "Full audit trail",
    body: "Every issue, view, payment, and reminder is logged. If a client disputes, you have the receipts.",
  },
  {
    span: 2,
    illo: TrustIllos.delivery,
    title: "Reliable delivery",
    body: "Invoices arrive, links open fast on any phone, and you see exactly when a client viewed them.",
  },
  {
    span: 3,
    illo: TrustIllos.export,
    title: "Your data is yours",
    body: "Export everything, any time — invoices, clients, payments. Leave whenever you like and take it all with you.",
  },
  {
    span: 3,
    illo: TrustIllos.lawful,
    title: "Handled the lawful way",
    body: "Your records are stored securely and handled in line with the Kenya Data Protection Act, 2019.",
  },
] as const;

/** Trust & security — a bento of illustrated cards. Earns the signup. */
export function Trust() {
  return (
    <section data-reveal className="cj-pad" style={{ padding: "112px 32px" }}>
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 56,
        }}
      >
        <div
          style={{
            maxWidth: 680,
            margin: "0 auto",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            gap: 16,
            alignItems: "center",
          }}
        >
          <Eyebrow>Trust &amp; security</Eyebrow>
          <SectionTitle style={{ fontWeight: 600 }}>
            This is your money. We treat it that way.
          </SectionTitle>
        </div>

        <div
          className="cj-trust"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(6,1fr)",
            gap: 20,
          }}
        >
          {CARDS.map((card) => {
            const Illo = card.illo;
            return (
              <div
                key={card.title}
                style={{
                  gridColumn: `span ${card.span}`,
                  minWidth: 0,
                  background: C.surface,
                  border: `1px solid ${C.border}`,
                  borderRadius: 20,
                  padding: 28,
                  display: "flex",
                  flexDirection: "column",
                  gap: 20,
                  boxShadow: "0 4px 16px rgba(20,35,26,.06)",
                }}
              >
                <Illo />
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <h3
                    style={{
                      margin: 0,
                      fontFamily: F.heading,
                      fontWeight: 600,
                      fontSize: 19,
                    }}
                  >
                    {card.title}
                  </h3>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 14.5,
                      lineHeight: 1.6,
                      color: C.muted,
                    }}
                  >
                    {card.body}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
