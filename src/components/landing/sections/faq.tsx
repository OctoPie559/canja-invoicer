import { ChevronDown } from "lucide-react";
import { C, F } from "../tokens";
import { Eyebrow, SectionTitle } from "../parts";

const QA = [
  {
    q: "Is it really free?",
    a: "Yes. The core loop — create branded invoices and quotes, send them, record payments, see your dashboard, keep a full audit trail — is free forever for one user with generous volume. Pro exists for teams and automation, not to hold basics hostage.",
  },
  {
    q: "How do M-Pesa payments work?",
    a: "Your client opens the invoice link and pays with M-Pesa right there. The payment is recorded against that exact invoice, the status flips to paid, and your dashboard updates — no more matching M-Pesa SMS to jobs by hand.",
  },
  {
    q: "Can my clients pay online?",
    a: "Yes — every invoice and quote has a hosted link your client can open on any phone: view it, accept a quote, or pay. No app download, no account needed on their side.",
  },
  {
    q: "Is my data safe?",
    a: "Issued documents are immutable, every action is on the audit trail, and your data is exportable any time. We handle it in line with the Kenya Data Protection Act, 2019.",
  },
  {
    q: "Do I need to be tech-savvy?",
    a: "No. If you can send a WhatsApp message, you can send a Canja invoice. Your first one takes about five minutes, and it works on the phone you already have.",
  },
];

/** FAQ — kill the last objections. Native <details> for zero-JS accordions. */
export function Faq() {
  return (
    <section id="faq" data-reveal style={{ padding: "112px 32px" }}>
      <div
        style={{
          maxWidth: 760,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 40,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Eyebrow>FAQ</Eyebrow>
          <SectionTitle style={{ fontWeight: 600 }}>
            The last few questions.
          </SectionTitle>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          {QA.map(({ q, a }, i) => (
            <details
              key={q}
              style={{
                borderTop: `1px solid ${C.border}`,
                borderBottom:
                  i === QA.length - 1 ? `1px solid ${C.border}` : undefined,
              }}
            >
              <summary
                style={{
                  listStyle: "none",
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 16,
                  padding: "22px 4px",
                  fontSize: 17,
                  fontWeight: 600,
                }}
              >
                {q}
                <ChevronDown
                  size={16}
                  strokeWidth={2}
                  color={C.green600}
                  style={{ flexShrink: 0 }}
                />
              </summary>
              <p
                style={{
                  margin: 0,
                  padding: "0 4px 22px",
                  fontSize: 15.5,
                  lineHeight: 1.65,
                  color: C.muted,
                  fontFamily: F.sans,
                }}
              >
                {a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
