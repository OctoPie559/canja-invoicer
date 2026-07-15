import { Send } from "lucide-react";
import { C, F } from "../tokens";
import { Eyebrow, SectionTitle } from "../parts";

const cardStyle: React.CSSProperties = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: 16,
  padding: 32,
  display: "flex",
  flexDirection: "column",
  gap: 16,
  boxShadow: "0 4px 16px rgba(20,35,26,.06)",
};

const visualStyle: React.CSSProperties = {
  marginTop: "auto",
  background: C.canvas,
  border: `1px solid ${C.border}`,
  padding: 14,
  display: "flex",
  flexDirection: "column",
};

function StepHead({ n, title }: { n: string; title: string }) {
  return (
    <>
      <span
        style={{
          fontFamily: F.mono,
          fontSize: 13,
          color: C.green600,
          fontWeight: 600,
        }}
      >
        {n}
      </span>
      <h3
        style={{
          margin: 0,
          fontFamily: F.heading,
          fontWeight: 600,
          fontSize: 22,
        }}
      >
        {title}
      </h3>
    </>
  );
}

const body: React.CSSProperties = {
  margin: 0,
  fontSize: 15,
  lineHeight: 1.6,
  color: C.muted,
};

/** How it works — three steps with mini animated visuals. The "aha". */
export function HowItWorks() {
  return (
    <section
      id="how"
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
          maxWidth: 1200,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 56,
        }}
      >
        <div
          style={{
            maxWidth: 640,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <Eyebrow>How it works</Eyebrow>
          <SectionTitle style={{ fontWeight: 600 }}>
            Three steps. That&apos;s the whole job.
          </SectionTitle>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))",
            gap: 20,
          }}
        >
          {/* 01 · Create */}
          <div style={cardStyle}>
            <StepHead n="01" title="Create" />
            <p style={body}>
              A branded invoice or quote in minutes. Your logo, your terms, KES
              or any currency, KRA PIN included.
            </p>
            <div style={{ ...visualStyle, gap: 8 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 11,
                  color: C.muted,
                }}
              >
                <span style={{ fontFamily: F.mono }}>INV-0048</span>
                <span>Draft</span>
              </div>
              <div
                style={{
                  height: 8,
                  background: C.green100,
                  width: "80%",
                  transformOrigin: "left",
                  animation: "drawIn 4.5s cubic-bezier(0.16,1,0.3,1) infinite",
                }}
              />
              <div
                style={{
                  height: 8,
                  background: C.green100,
                  width: "55%",
                  transformOrigin: "left",
                  animation:
                    "drawIn 4.5s cubic-bezier(0.16,1,0.3,1) .35s infinite both",
                }}
              />
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderTop: `1px solid ${C.border}`,
                  paddingTop: 8,
                  fontSize: 12,
                }}
              >
                <span style={{ color: C.muted }}>Total</span>
                <span style={{ fontFamily: F.mono, fontWeight: 600 }}>
                  KSh 42,000
                </span>
              </div>
            </div>
          </div>

          {/* 02 · Send */}
          <div style={cardStyle}>
            <StepHead n="02" title="Send" />
            <p style={body}>
              Email it or share a link. Your client opens it on their phone, sees
              a clean branded invoice, and pays right there.
            </p>
            <div style={{ ...visualStyle, gap: 10 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12,
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    animation: "planeHop 5s ease-in-out infinite",
                  }}
                >
                  <Send size={14} strokeWidth={2} color={C.green600} />
                </span>
                <span style={{ fontFamily: F.mono, color: C.muted }}>
                  canja.co.ke/i/inv-0048
                </span>
              </div>
              <div style={{ display: "flex", gap: 6, fontSize: 11 }}>
                <span
                  style={{
                    background: C.green100,
                    color: C.green800,
                    padding: "4px 10px",
                    fontWeight: 600,
                    animation: "seqIn 6s ease-out infinite both",
                  }}
                >
                  Sent 09:14
                </span>
                <span
                  style={{
                    background: C.green100,
                    color: C.green800,
                    padding: "4px 10px",
                    fontWeight: 600,
                    animation: "seqIn 6s ease-out .6s infinite both",
                  }}
                >
                  Viewed 09:31
                </span>
              </div>
            </div>
          </div>

          {/* 03 · Get paid & tracked */}
          <div style={cardStyle}>
            <StepHead n="03" title="Get paid & tracked" />
            <p style={body}>
              The M-Pesa payment lands, the invoice flips to paid, and your
              dashboard updates. No matching messages to jobs.
            </p>
            <div style={{ ...visualStyle, gap: 8, fontSize: 12 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  animation: "seqIn 6s ease-out infinite both",
                }}
              >
                <span style={{ fontFamily: F.mono }}>M-Pesa · SGH4K92XT</span>
                <span
                  style={{
                    fontFamily: F.mono,
                    fontWeight: 600,
                    color: C.success,
                  }}
                >
                  +42,000
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderTop: `1px solid ${C.border}`,
                  paddingTop: 8,
                }}
              >
                <span style={{ color: C.muted }}>INV-0048</span>
                <span
                  style={{
                    background: C.green100,
                    color: C.green800,
                    padding: "3px 10px",
                    fontWeight: 600,
                    fontSize: 11,
                    animation: "seqIn 6s ease-out .8s infinite both",
                  }}
                >
                  Paid
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
