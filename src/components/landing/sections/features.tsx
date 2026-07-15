import Link from "next/link";
import {
  MessageSquare,
  Bell,
  BarChart3,
  Globe,
  FileText,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import { C, F, START_FREE_HREF } from "../tokens";
import { Eyebrow, SectionTitle } from "../parts";

/* ---- shared bits ------------------------------------------------------- */

const mono: React.CSSProperties = { fontFamily: F.mono };
const tabular: React.CSSProperties = {
  fontFamily: F.mono,
  fontVariantNumeric: "tabular-nums",
};

/** White mockup card that sits inside each row's tinted panel. */
function Card({
  children,
  maxWidth = 420,
}: {
  children: React.ReactNode;
  maxWidth?: number;
}) {
  return (
    <div
      style={{
        background: C.surface,
        boxShadow:
          "0 0 0 1px rgba(20,35,26,.10),0 16px 40px rgba(20,35,26,.08)",
        width: "100%",
        maxWidth,
        padding: 28,
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      {children}
    </div>
  );
}

function StatTile({
  label,
  value,
  context,
  serious = false,
}: {
  label: string;
  value: string;
  context: string;
  serious?: boolean;
}) {
  return (
    <div
      style={{
        background: C.surface,
        boxShadow: "inset 0 0 0 1px rgba(20,35,26,.10)",
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 3,
        minHeight: 88,
      }}
    >
      <span
        style={{
          fontSize: 10.5,
          letterSpacing: ".05em",
          textTransform: "uppercase",
          color: C.muted,
          fontWeight: 600,
        }}
      >
        {label}
      </span>
      <span
        style={{
          ...tabular,
          fontSize: 19,
          fontWeight: 600,
          color: serious ? "#B91C1C" : C.ink,
        }}
      >
        {value}
      </span>
      <span style={{ fontSize: 11, color: C.muted }}>{context}</span>
    </div>
  );
}

/** One feature row: copy on one side, a live-looking mockup on the other. */
function FeatureRow({
  icon: Icon,
  title,
  body,
  cta,
  reversed = false,
  panelBg,
  children,
}: {
  icon: LucideIcon;
  title: string;
  body: React.ReactNode;
  cta: React.ReactNode;
  reversed?: boolean;
  panelBg: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: reversed ? "row-reverse" : "row",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 48,
      }}
    >
      <div
        style={{
          flex: 1,
          minWidth: 280,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 14,
        }}
      >
        <span
          style={{
            display: "inline-flex",
            width: 42,
            height: 42,
            alignItems: "center",
            justifyContent: "center",
            background: C.green100,
            borderRadius: 10,
          }}
        >
          <Icon size={20} strokeWidth={2} color={C.green800} />
        </span>
        <h3
          style={{
            margin: 0,
            fontFamily: F.heading,
            fontWeight: 600,
            fontSize: "clamp(24px,2.6vw,32px)",
            lineHeight: 1.15,
            letterSpacing: "-0.01em",
          }}
        >
          {title}
        </h3>
        <p
          style={{
            margin: 0,
            fontSize: 16.5,
            lineHeight: 1.65,
            color: C.muted,
            textWrap: "pretty",
          }}
        >
          {body}
        </p>
        <Link href={START_FREE_HREF} style={{ fontWeight: 600, fontSize: 15 }}>
          {cta}
        </Link>
      </div>
      <div
        style={{
          flex: 1.35,
          minWidth: 320,
          background: panelBg,
          border: `1px solid ${C.border}`,
          borderRadius: 20,
          padding: "clamp(24px,4vw,48px)",
          display: "flex",
          justifyContent: "center",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/* ---- section ----------------------------------------------------------- */

export function Features() {
  return (
    <section id="features" data-reveal style={{ padding: "112px 32px" }}>
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
          <Eyebrow>Features</Eyebrow>
          <SectionTitle style={{ fontWeight: 600 }}>
            Everything between the work and the money.
          </SectionTitle>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 72 }}>
          {/* Quotes */}
          <FeatureRow
            icon={MessageSquare}
            title="Quotes clients accept online"
            body={
              <>
                Send an estimate, the client accepts or declines with one tap —
                and an accepted quote becomes an invoice automatically. No
                re-typing, no &ldquo;did you see my quote?&rdquo;
              </>
            }
            cta="Send your first quote →"
            panelBg={C.alt}
          >
            <Card>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ ...mono, fontSize: 12, color: C.muted }}>
                  QUO-0112
                </span>
                <span
                  style={{
                    background: C.green100,
                    color: C.green800,
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "4px 10px",
                    letterSpacing: ".05em",
                    textTransform: "uppercase",
                  }}
                >
                  Quote
                </span>
              </div>
              <div
                style={{ display: "flex", flexDirection: "column", gap: 3 }}
              >
                <span style={{ fontSize: 13.5, color: C.muted }}>
                  Amara Studio · Brand identity
                </span>
                <span style={{ ...tabular, fontSize: 26, fontWeight: 600 }}>
                  KSh 42,000
                </span>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <span
                  style={{
                    flex: 1,
                    textAlign: "center",
                    background: C.green800,
                    color: C.darkText,
                    fontWeight: 600,
                    fontSize: 13.5,
                    padding: "11px 0",
                  }}
                >
                  Accept quote
                </span>
                <span
                  style={{
                    flex: 1,
                    textAlign: "center",
                    background: C.surface,
                    border: `1px solid ${C.border}`,
                    color: C.muted,
                    fontSize: 13.5,
                    padding: "10px 0",
                  }}
                >
                  Decline
                </span>
              </div>
              <div
                style={{
                  borderTop: `1px solid ${C.border}`,
                  paddingTop: 14,
                  display: "flex",
                  flexDirection: "column",
                  gap: 9,
                  fontSize: 13,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    animation: "seqIn 6s ease-out infinite both",
                  }}
                >
                  <span style={{ color: C.green800, fontWeight: 600 }}>
                    Accepted by client ✓
                  </span>
                  <span style={{ ...mono, color: C.muted }}>09:31</span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    animation: "seqIn 6s ease-out .8s infinite both",
                  }}
                >
                  <span style={{ color: C.muted }}>Converted to invoice</span>
                  <span style={mono}>INV-0049</span>
                </div>
              </div>
            </Card>
          </FeatureRow>

          {/* Reminders */}
          <FeatureRow
            icon={Bell}
            title="Reminders on autopilot"
            body="Polite, automatic follow-ups before and after the due date. Canja does the chasing — you keep the relationship."
            cta="Stop chasing payments →"
            reversed
            panelBg={C.green100}
          >
            <Card>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  Reminder schedule · INV-0044
                </span>
                <span
                  style={{
                    display: "inline-flex",
                    width: 18,
                    transformOrigin: "50% 0",
                    animation: "bellSwing 4s ease-in-out infinite",
                  }}
                >
                  <Bell size={18} strokeWidth={2} color={C.green600} />
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {[
                  {
                    label: "3 days before due · gentle nudge",
                    tag: "Sent",
                    bg: C.green100,
                    fg: C.green800,
                    delay: "0s",
                  },
                  {
                    label: "On the due date · payment due today",
                    tag: "Sent",
                    bg: C.green100,
                    fg: C.green800,
                    delay: ".6s",
                  },
                  {
                    label: "3 days overdue · firm follow-up",
                    tag: "Sending…",
                    bg: C.goldSoft,
                    fg: C.warn,
                    delay: "1.2s",
                  },
                ].map((r) => (
                  <div
                    key={r.label}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 10,
                      padding: "11px 0",
                      borderTop: `1px solid ${C.border}`,
                      fontSize: 13,
                    }}
                  >
                    <span style={{ color: C.muted }}>{r.label}</span>
                    <span
                      style={{
                        background: r.bg,
                        color: r.fg,
                        fontSize: 11.5,
                        fontWeight: 600,
                        padding: "4px 12px",
                        animation: `seqIn 6s ease-out ${r.delay} infinite both`,
                      }}
                    >
                      {r.tag}
                    </span>
                  </div>
                ))}
              </div>
              <span
                style={{
                  fontSize: 12,
                  color: C.muted,
                  borderTop: `1px solid ${C.border}`,
                  paddingTop: 12,
                }}
              >
                You approve the tone once. Canja handles the rest.
              </span>
            </Card>
          </FeatureRow>

          {/* Dashboard */}
          <FeatureRow
            icon={BarChart3}
            title="Cash-flow & aging dashboard"
            body="Who owes you, what's overdue, what came in this month — one glance, always current. No more solving your cash flow like a mystery."
            cta="Know who owes you →"
            panelBg={C.alt}
          >
            <Card maxWidth={460}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                }}
              >
                <StatTile
                  label="Outstanding"
                  value="KSh 128,400"
                  context="12 invoices awaiting payment"
                />
                <StatTile
                  label="Overdue"
                  value="KSh 23,100"
                  context="2 invoices past due"
                  serious
                />
              </div>
              <div
                style={{ display: "flex", flexDirection: "column", gap: 8 }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: ".05em",
                    textTransform: "uppercase",
                    color: C.muted,
                  }}
                >
                  Paid per month
                </span>
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-end",
                    gap: 8,
                    height: 88,
                  }}
                >
                  {[
                    { h: "38%", c: C.green100 },
                    { h: "55%", c: C.green300 },
                    { h: "46%", c: C.green100 },
                    { h: "68%", c: C.green300 },
                    { h: "58%", c: C.green300 },
                    { h: "82%", c: C.green600 },
                    { h: "72%", c: C.green300 },
                    { h: "100%", c: C.green800 },
                  ].map((b, i) => (
                    <span
                      key={i}
                      style={{
                        flex: 1,
                        height: b.h,
                        background: b.c,
                        display: "block",
                        transformOrigin: "bottom",
                        animation: `riseIn 5s cubic-bezier(0.16,1,0.3,1) ${i * 0.1}s infinite both`,
                      }}
                    />
                  ))}
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    ...mono,
                    fontSize: 10,
                    color: C.muted,
                  }}
                >
                  {["Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"].map(
                    (m) => (
                      <span key={m}>{m}</span>
                    ),
                  )}
                </div>
              </div>
            </Card>
          </FeatureRow>

          {/* Multi-currency */}
          <FeatureRow
            icon={Globe}
            title="Bill in any currency"
            body="KES first — but when a client pays in dollars, euros, or pounds, you bill them in their currency and still see every shilling in one record."
            cta="Bill international clients →"
            reversed
            panelBg={C.green100}
          >
            <Card>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ ...mono, fontSize: 12, color: C.muted }}>
                  INV-0051
                </span>
                <span style={{ fontSize: 13, color: C.muted }}>
                  Delta Studio · Berlin
                </span>
              </div>
              <div
                style={{ display: "flex", flexDirection: "column", gap: 3 }}
              >
                <span style={{ ...tabular, fontSize: 26, fontWeight: 600 }}>
                  € 1,250.00
                </span>
                <span
                  style={{
                    fontSize: 13,
                    color: C.muted,
                    animation: "seqIn 6s ease-out .6s infinite both",
                  }}
                >
                  ≈ KSh 178,940 at today&apos;s rate
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  ...mono,
                  fontSize: 12.5,
                  borderTop: `1px solid ${C.border}`,
                  paddingTop: 16,
                }}
              >
                {["KES", "USD"].map((c) => (
                  <span
                    key={c}
                    style={{
                      background: C.alt,
                      color: C.muted,
                      padding: "7px 14px",
                    }}
                  >
                    {c}
                  </span>
                ))}
                <span
                  style={{
                    background: C.green800,
                    color: C.darkText,
                    padding: "7px 14px",
                    fontWeight: 600,
                    animation: "softPulse 3.5s ease-in-out infinite",
                  }}
                >
                  EUR
                </span>
                <span
                  style={{
                    background: C.alt,
                    color: C.muted,
                    padding: "7px 14px",
                  }}
                >
                  GBP
                </span>
              </div>
            </Card>
          </FeatureRow>

          {/* PDF templates */}
          <FeatureRow
            icon={FileText}
            title="Multiple PDF templates"
            body="Pick a look that fits your brand — clean, classic, or bold. Every PDF is crisp, consistent, and carries your logo, so the invoice looks as professional as the work."
            cta={<>Make it look like&nbsp;you&nbsp;→</>}
            panelBg={C.alt}
          >
            <PdfTemplates />
          </FeatureRow>

          {/* Audit trail */}
          <FeatureRow
            icon={ShieldCheck}
            title="Full audit trail"
            body="Issued documents are immutable — corrections happen through credit notes, on the record. Every issue, view, reminder, and payment is logged, so disputes end with the receipts."
            cta="Keep every record →"
            reversed
            panelBg={C.green100}
          >
            <Card>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  Activity · INV-0047
                </span>
                <span
                  style={{
                    background: C.green100,
                    color: C.green800,
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "4px 10px",
                    letterSpacing: ".05em",
                    textTransform: "uppercase",
                  }}
                >
                  Immutable
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                  fontSize: 13,
                }}
              >
                {[
                  { text: "Invoice issued by you", time: "09:14", dot: C.green300, paid: false, delay: "0s" },
                  { text: "Viewed by Amara Studio", time: "09:31", dot: C.green300, paid: false, delay: ".6s" },
                  { text: "Reminder sent · due in 3 days", time: "Mon", dot: C.green300, paid: false, delay: "1.2s" },
                  { text: "Paid via M-Pesa · SGH4K92XT", time: "14:02", dot: C.success, paid: true, delay: "1.8s" },
                ].map((r) => (
                  <div
                    key={r.text}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 12,
                      animation: `seqIn 8s ease-out ${r.delay} infinite both`,
                    }}
                  >
                    <span
                      style={{
                        flexShrink: 0,
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: r.dot,
                        marginTop: 5,
                      }}
                    />
                    <span
                      style={{
                        flex: 1,
                        color: r.paid ? C.green800 : C.ink,
                        fontWeight: r.paid ? 600 : 400,
                      }}
                    >
                      {r.text}
                    </span>
                    <span style={{ ...mono, color: r.paid ? C.success : C.muted }}>
                      {r.time}
                    </span>
                  </div>
                ))}
              </div>
              <span
                style={{
                  fontSize: 12,
                  color: C.muted,
                  borderTop: `1px solid ${C.border}`,
                  paddingTop: 12,
                }}
              >
                Locked at issue. Corrections via credit note only.
              </span>
            </Card>
          </FeatureRow>
        </div>
      </div>
    </section>
  );
}

/** Three floating PDF template thumbnails (the middle one lifted). */
function PdfTemplates() {
  const shell: React.CSSProperties = {
    width: 118,
    background: C.surface,
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 7,
  };
  const bar = (w: string, c: string = C.border): React.CSSProperties => ({
    height: 5,
    width: w,
    background: c,
    display: "block",
  });
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
      }}
    >
      <div
        style={{
          ...shell,
          boxShadow: "0 0 0 1px rgba(20,35,26,.10),0 12px 28px rgba(20,35,26,.10)",
          animation: "floatCard 4.5s ease-in-out infinite",
        }}
      >
        <Image
          src="/logo_assets/wordmark-color.png"
          alt=""
          width={120}
          height={30}
          style={{ height: 9, width: "auto", alignSelf: "flex-start" }}
        />
        <span style={bar("70%")} />
        <span style={bar("50%")} />
        <span
          style={{
            height: 22,
            background: C.canvas,
            border: `1px solid ${C.border}`,
            display: "block",
            marginTop: 4,
          }}
        />
        <span style={{ ...bar("45%"), alignSelf: "flex-end" }} />
      </div>

      <div
        style={{
          ...shell,
          boxShadow: "0 0 0 1px rgba(20,35,26,.10),0 16px 36px rgba(20,35,26,.14)",
          transform: "scale(1.12)",
          animation: "floatCard 4.5s ease-in-out .5s infinite",
        }}
      >
        <span
          style={{
            height: 18,
            background: C.green800,
            display: "flex",
            alignItems: "center",
            padding: "0 6px",
          }}
        >
          <Image
            src="/logo_assets/wordmark-white.png"
            alt=""
            width={120}
            height={30}
            style={{ height: 8, width: "auto" }}
          />
        </span>
        <span style={bar("70%")} />
        <span style={bar("55%")} />
        <span
          style={{
            height: 22,
            background: C.green100,
            display: "block",
            marginTop: 4,
          }}
        />
        <span style={{ ...bar("45%", C.green300), alignSelf: "flex-end" }} />
      </div>

      <div
        style={{
          ...shell,
          boxShadow: "0 0 0 1px rgba(20,35,26,.10),0 12px 28px rgba(20,35,26,.10)",
          animation: "floatCard 4.5s ease-in-out 1s infinite",
        }}
      >
        <span
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Image
            src="/logo_assets/wordmark-color.png"
            alt=""
            width={120}
            height={30}
            style={{ height: 8, width: "auto" }}
          />
          <span
            style={{
              width: 14,
              height: 14,
              background: C.gold,
              borderRadius: "50%",
              display: "block",
            }}
          />
        </span>
        <span style={bar("60%")} />
        <span
          style={{
            height: 22,
            background: C.canvas,
            border: `1px solid ${C.border}`,
            display: "block",
            marginTop: 4,
          }}
        />
        <span style={bar("40%")} />
        <span style={{ ...bar("45%", C.gold), alignSelf: "flex-end" }} />
      </div>
    </div>
  );
}
