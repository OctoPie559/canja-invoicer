/* eslint-disable @next/next/no-img-element -- brand marks are fixed-height decorative assets */
"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import styles from "./landing.module.css";

/* Canja marketing landing page, ported from the Claude Design prototype into a
   real Next.js route. Layout stays inline (faithful to the design); motion and
   hover live in landing.module.css; repeated blocks are data-driven. */

const HEADING = "var(--font-heading), 'Bricolage Grotesque', sans-serif";
const MONO = "var(--font-geist-mono), 'Geist Mono', monospace";

const C = {
  ink: "#14231A",
  muted: "#6B7A70",
  green600: "#1F6A16",
  green800: "#103B05",
  green900: "#0B2A03",
  green300: "#8FD07E",
  green100: "#E6F3E1",
  gold: "#F4A423",
  goldSoft: "#FDEFD4",
  canvas: "#FBFAF7",
  surface: "#FFFFFF",
  alt: "#F4F5F1",
  border: "#E7E5DE",
  darkText: "#F3F9F0",
  darkMuted: "#A9C4A0",
};

const SIGNUP = "/signup";
const LOGIN = "/login";

const eyebrow: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  letterSpacing: ".08em",
  textTransform: "uppercase",
  color: C.green600,
};
const h2: CSSProperties = {
  margin: 0,
  fontFamily: HEADING,
  fontWeight: 600,
  fontSize: "clamp(30px,4vw,46px)",
  lineHeight: 1.15,
  letterSpacing: "-0.02em",
};
const card: CSSProperties = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: 16,
  boxShadow: "0 4px 16px rgba(20,35,26,.06)",
};

function Check({ stroke = C.green600, size = 14, mt = 3 }: { stroke?: string; size?: number; mt?: number }) {
  return (
    <svg style={{ flexShrink: 0, marginTop: mt }} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function Cross() {
  return (
    <svg style={{ flexShrink: 0, marginTop: 2 }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

const BADGE: Record<string, { bg: string; fg: string; label: string }> = {
  sent: { bg: "#DBEAFE", fg: "#1E40AF", label: "Sent" },
  paid: { bg: C.green100, fg: C.green800, label: "Paid" },
  overdue: { bg: "#FEE2E2", fg: "#B91C1C", label: "Overdue" },
  partial: { bg: "#FEF3C7", fg: "#92400E", label: "Partial" },
};
function StatusBadge({ status }: { status: keyof typeof BADGE }) {
  const s = BADGE[status];
  return (
    <span style={{ background: s.bg, color: s.fg, fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 6, justifySelf: "start" }}>
      {s.label}
    </span>
  );
}

function StatTile({ label, value, context, serious }: { label: string; value: string; context: string; serious?: boolean }) {
  return (
    <div style={{ background: C.surface, boxShadow: "inset 0 0 0 1px rgba(20,35,26,.10)", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 3, minHeight: 88 }}>
      <span style={{ fontSize: 10.5, letterSpacing: ".05em", textTransform: "uppercase", color: C.muted, fontWeight: 600 }}>{label}</span>
      <span style={{ fontFamily: MONO, fontSize: 19, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: serious ? "#B91C1C" : C.ink }}>{value}</span>
      <span style={{ fontSize: 11, color: C.muted }}>{context}</span>
    </div>
  );
}

const navLinks = [
  ["Features", "#features"],
  ["How it works", "#how"],
  ["Why Canja", "#why"],
  ["Pricing", "#pricing"],
  ["FAQ", "#faq"],
];

const proof = [
  { icon: <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>, text: "Invoice in minutes, not spreadsheets" },
  { icon: <><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M12 18h.01" /></>, text: "Get paid the M-Pesa way" },
  { icon: <path d="M20 6 9 17l-5-5" />, text: "Every shilling on record" },
];

const trust = [
  { icon: <><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>, title: "Immutable records", body: "Once issued, an invoice can't be quietly edited. Corrections happen through credit notes — on the record." },
  { icon: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />, title: "Full audit trail", body: "Every issue, view, payment, and reminder is logged. If a client disputes, you have the receipts." },
  { icon: <><circle cx="12" cy="8" r="5" /><path d="M20 21a8 8 0 0 0-16 0" /></>, title: "Your data is yours", body: "Export everything, any time. We handle your data in line with the Kenya Data Protection Act, 2019." },
  { icon: <><path d="m22 2-7 20-4-9-9-4z" /><path d="M22 2 11 13" /></>, title: "Reliable delivery", body: "Invoices arrive, links open fast on any phone, and you can see exactly when a client viewed them." },
];

const globalCons = [
  "Cards & Stripe first — M-Pesa is a clunky workaround",
  "USD-first defaults, KES an afterthought",
  "No KRA PIN, no Kenyan business context",
  "Desktop-first, heavy on stable connections",
];
const canjaPros = [
  <>
    <strong>M-Pesa native</strong> — the way your clients already pay
  </>,
  <>
    <strong>KES by default</strong>, multi-currency when you need it
  </>,
  <>
    <strong>KRA PIN on every invoice</strong>, built for Kenyan business
  </>,
  <>
    <strong>Fast and light on mobile</strong> — built for the phone in your pocket
  </>,
];

const freePlan = [
  "Unlimited branded invoices & quotes",
  "M-Pesa payment recording",
  "Cash-flow dashboard & who-owes-you view",
  "Full audit trail & credit notes",
  "One user, generous volume",
];
const proPlan = [
  "Everything in Free, plus:",
  "Team seats & roles",
  "Recurring invoices & automated reminders",
  "Multi-currency billing",
  "Custom branding, templates & client portal",
  "Advanced reports",
];

const faqs = [
  ["Is it really free?", "Yes. The core loop — create branded invoices and quotes, send them, record payments, see your dashboard, keep a full audit trail — is free forever for one user with generous volume. Pro exists for teams and automation, not to hold basics hostage."],
  ["How do M-Pesa payments work?", "Your client opens the invoice link and pays with M-Pesa right there. The payment is recorded against that exact invoice, the status flips to paid, and your dashboard updates — no more matching M-Pesa SMS to jobs by hand."],
  ["Can my clients pay online?", "Yes — every invoice and quote has a hosted link your client can open on any phone: view it, accept a quote, or pay. No app download, no account needed on their side."],
  ["Is my data safe?", "Issued documents are immutable, every action is on the audit trail, and your data is exportable any time. We handle it in line with the Kenya Data Protection Act, 2019."],
  ["Do I need to be tech-savvy?", "No. If you can send a WhatsApp message, you can send a Canja invoice. Your first one takes about five minutes, and it works on the phone you already have."],
];

const footerCols: Array<[string, Array<[string, string]>]> = [
  ["Product", [["Features", "#features"], ["Pricing", "#pricing"], ["How it works", "#how"], ["For freelancers", "#why"], ["For agencies", "#why"]]],
  ["Company", [["About", "#top"], ["Contact", "#top"], ["WhatsApp us", "#top"]]],
  ["Resources", [["Blog", "#top"], ["Help / FAQ", "#faq"], ["M-Pesa guide", "#top"], ["Compare", "#why"]]],
  ["Legal", [["Privacy", "#top"], ["Terms", "#top"], ["Data protection", "#top"]]],
];

export function LandingPage() {
  const rootRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const nav = navRef.current;
    if (!root) return;

    const onScroll = () => {
      if (!nav) return;
      const condensed = window.scrollY > 24;
      const inner = nav.firstElementChild as HTMLElement | null;
      if (inner) inner.style.padding = condensed ? "8px 32px" : "14px 32px";
      nav.style.boxShadow = condensed ? "0 4px 16px rgba(20,35,26,.08)" : "none";
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let observer: IntersectionObserver | undefined;
    if (!reduced) {
      root.classList.add(styles.motion);
      const items = Array.from(root.querySelectorAll<HTMLElement>(`.${styles.reveal}`));
      observer = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) {
              e.target.classList.add(styles.in);
              observer?.unobserve(e.target);
            }
          }
        },
        { rootMargin: "0px 0px -6% 0px" },
      );
      items.forEach((el) => observer!.observe(el));
    }

    return () => {
      window.removeEventListener("scroll", onScroll);
      observer?.disconnect();
    };
  }, []);

  return (
    <div ref={rootRef} className={styles.root} id="top">
      {/* NAV */}
      <nav ref={navRef} style={{ position: "sticky", top: 0, zIndex: 100, background: "rgba(251,250,247,.92)", backdropFilter: "blur(10px)", borderBottom: `1px solid ${C.border}`, transition: "padding .22s cubic-bezier(0.16,1,0.3,1)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "14px 32px", display: "flex", alignItems: "center", gap: 32 }}>
          <a href="#top" style={{ display: "flex", alignItems: "center" }}>
            <img src="/canja/logo/wordmark-color.png" alt="Canja" style={{ height: 26, display: "block" }} />
          </a>
          <div style={{ display: "flex", gap: 26, flex: 1, justifyContent: "center", fontSize: 14.5, fontWeight: 500 }}>
            {navLinks.map(([label, href]) => (
              <a key={label} href={href} className={styles.navLink}>{label}</a>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <a href={LOGIN} className={styles.navLink} style={{ fontSize: 14.5, fontWeight: 500 }}>Log in</a>
            <a href={SIGNUP} className={styles.cta} style={{ display: "inline-block", fontWeight: 600, fontSize: 14.5, padding: "10px 20px", borderRadius: 10 }}>Start free</a>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <header style={{ position: "relative", overflow: "hidden", padding: "88px 32px 0", textAlign: "center" }}>
        <div style={{ position: "absolute", left: "50%", top: 340, transform: "translateX(-50%)", width: 1100, height: 700, background: "radial-gradient(ellipse at center,rgba(143,208,126,.35) 0%,rgba(143,208,126,.12) 40%,rgba(143,208,126,0) 70%)", pointerEvents: "none" }} />
        <div style={{ position: "relative", maxWidth: 860, margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: C.green100, color: C.green800, border: "1px solid rgba(31,106,22,.18)", borderRadius: 999, padding: "7px 16px", fontSize: 13, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" /></svg>
            Built for how Kenya gets paid
          </div>
          <h1 style={{ margin: 0, fontFamily: HEADING, fontWeight: 700, fontSize: "clamp(44px,6.4vw,78px)", lineHeight: 1.04, letterSpacing: "-0.02em", textWrap: "balance" }}>
            Invoices that <span style={{ color: C.green600 }}>actually</span> get paid.
          </h1>
          <p style={{ margin: 0, maxWidth: 640, fontSize: 19, lineHeight: 1.6, color: C.muted, textWrap: "pretty" }}>
            Professional invoices, M-Pesa payments, and one clear record of every shilling — built for Kenyan freelancers and small teams.
          </p>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
            <a href={SIGNUP} className={`${styles.cta} ${styles.pulse}`} style={{ display: "inline-block", fontWeight: 700, fontSize: 17, padding: "16px 32px", borderRadius: 12 }}>Start free</a>
            <a href="#how" className={styles.ghost} style={{ display: "inline-block", background: C.surface, color: C.ink, fontWeight: 600, fontSize: 17, padding: "16px 32px", borderRadius: 12, border: `1px solid ${C.border}` }}>See how it works</a>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: C.muted }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.green600} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            Free forever core&nbsp;·&nbsp;No card required&nbsp;·&nbsp;Built for Kenya
          </div>
        </div>

        {/* Product visual */}
        <div style={{ position: "relative", maxWidth: 1080, margin: "64px auto 0", textAlign: "left" }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, boxShadow: "0 32px 80px rgba(20,35,26,.14)", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderBottom: `1px solid ${C.border}`, background: C.alt }}>
              {[0, 1, 2].map((i) => (
                <span key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: C.border, display: "block" }} />
              ))}
              <span style={{ marginLeft: 12, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 14px", fontSize: 11, color: C.muted, fontFamily: MONO }}>app.canja.co.ke/dashboard</span>
            </div>
            <div style={{ display: "flex", minHeight: 420 }}>
              <div style={{ width: 200, flexShrink: 0, borderRight: `1px solid ${C.border}`, background: C.canvas, padding: "16px 12px", display: "flex", flexDirection: "column", gap: 2 }}>
                <img src="/canja/logo/wordmark-color.png" alt="Canja" style={{ height: 18, width: "auto", alignSelf: "flex-start", margin: "2px 8px 14px" }} />
                {[
                  ["Overview", true],
                  ["Invoices", false],
                  ["Quotes", false],
                  ["Payments", false],
                  ["Reports", false],
                  ["Clients", false],
                ].map(([label, active]) => (
                  <div key={label as string} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", fontSize: 12, background: active ? C.green100 : "transparent", color: active ? C.green800 : C.muted, fontWeight: active ? 600 : 400 }}>
                    <span style={{ width: 14, height: 14, borderRadius: 3, background: active ? C.green300 : C.border, display: "block", opacity: active ? 1 : 0.7 }} />
                    {label}
                  </div>
                ))}
              </div>
              <div style={{ flex: 1, minWidth: 0, padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ fontFamily: HEADING, fontWeight: 600, fontSize: 16 }}>Overview</div>
                  <span style={{ background: C.green800, color: "#F3F9F0", fontSize: 11.5, fontWeight: 600, padding: "7px 12px", borderRadius: 6 }}>+ New invoice</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
                  <StatTile label="Outstanding" value="KSh 128,400" context="12 invoices awaiting payment" />
                  <StatTile label="Overdue" value="KSh 23,100" context="2 invoices past due" serious />
                  <StatTile label="Paid this month" value="KSh 214,750" context="9 payments · 7 via M-Pesa" />
                </div>
                <div style={{ background: C.surface, boxShadow: "0 0 0 1px rgba(20,35,26,.10)" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 110px 90px", gap: 12, padding: "9px 14px", borderBottom: `1px solid ${C.border}`, background: C.alt, fontSize: 10.5, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase", color: C.muted }}>
                    <span>Invoice</span><span>Client</span><span style={{ textAlign: "right" }}>Amount</span><span>Status</span>
                  </div>
                  {[
                    ["INV-0047", "Amara Studio", "36,500", "sent"],
                    ["INV-0046", "Tumaini Digital", "58,000", "paid"],
                    ["INV-0044", "Baraka Events", "23,100", "overdue"],
                    ["INV-0043", "Zawadi & Co", "14,750", "partial"],
                  ].map(([num, client, amt, status], i, arr) => (
                    <div key={num} style={{ display: "grid", gridTemplateColumns: "90px 1fr 110px 90px", gap: 12, padding: "10px 14px", borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none", fontSize: 12, alignItems: "center" }}>
                      <span style={{ fontFamily: MONO }}>{num}</span>
                      <span>{client}</span>
                      <span style={{ textAlign: "right", fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{amt}</span>
                      <StatusBadge status={status as keyof typeof BADGE} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          {/* Phone */}
          <div style={{ position: "absolute", right: -8, bottom: -56, width: 250, background: C.ink, borderRadius: 38, padding: 9, boxShadow: "0 32px 64px rgba(20,35,26,.28)" }}>
            <div style={{ background: C.surface, borderRadius: 30, overflow: "hidden", position: "relative" }}>
              <div style={{ display: "flex", justifyContent: "center", paddingTop: 8 }}><span style={{ width: 74, height: 16, background: C.ink, borderRadius: 999, display: "block" }} /></div>
              <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
                <img src="/canja/logo/wordmark-color.png" alt="Canja" style={{ height: 15, width: "auto", alignSelf: "flex-start" }} />
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 10.5, letterSpacing: ".05em", textTransform: "uppercase", color: C.muted, fontWeight: 600 }}>Invoice INV-0047</span>
                  <span style={{ fontFamily: MONO, fontSize: 22, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>KSh 36,500</span>
                  <span style={{ fontSize: 11, color: C.muted }}>Due 24 Jul · Amara Studio</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "10px 0", fontSize: 11, color: C.ink }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span>Brand identity design</span><span style={{ fontFamily: MONO }}>28,000</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span>Social templates ×5</span><span style={{ fontFamily: MONO }}>8,500</span></div>
                </div>
                <span style={{ background: C.gold, color: C.ink, fontWeight: 700, fontSize: 13, padding: "11px 0", textAlign: "center", borderRadius: 10 }}>Pay with M-Pesa</span>
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: "0 12px 32px rgba(20,35,26,.18)", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.green600, letterSpacing: ".06em" }}>M-PESA</span>
                  <span style={{ fontSize: 11.5, lineHeight: 1.45, color: C.ink }}>Pay <strong style={{ fontFamily: MONO }}>KSh 36,500</strong> to <strong>CANJA</strong> for INV-0047</span>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ fontSize: 10.5, color: C.muted }}>Enter PIN</span>
                    <span style={{ display: "flex", gap: 4 }}>{[0, 1, 2, 3].map((i) => <span key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: C.ink, display: "block" }} />)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* PROOF STRIP */}
      <section style={{ marginTop: 120, background: C.alt, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 32px", display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "16px 64px", fontSize: 15, fontWeight: 500, color: C.ink }}>
          {proof.map((p, i) => (
            <span key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={C.green600} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{p.icon}</svg>
              {p.text}
            </span>
          ))}
        </div>
      </section>

      {/* PROBLEM */}
      <section className={styles.reveal} style={{ padding: "112px 32px" }}>
        <div style={{ maxWidth: 860, margin: "0 auto", textAlign: "center", display: "flex", flexDirection: "column", gap: 28, alignItems: "center" }}>
          <span style={eyebrow}>Sound familiar?</span>
          <h2 style={h2}>Word templates. Screenshot receipts. <em style={{ fontStyle: "normal", color: C.muted }}>&ldquo;Have you paid yet?&rdquo;</em> on WhatsApp.</h2>
          <p style={{ margin: 0, maxWidth: 620, fontSize: 18, lineHeight: 1.65, color: C.muted, textWrap: "pretty" }}>
            You do good work — then spend evenings rebuilding invoices in Excel, matching M-Pesa messages to jobs, and guessing who still owes you. Your cash flow shouldn&apos;t be a mystery you solve every month.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 10 }}>
            {["No professional look", "Payments that never link to an invoice", "No idea who owes what", "Endless manual chasing"].map((t) => (
              <span key={t} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 999, padding: "9px 18px", fontSize: 14, color: C.muted }}>{t}</span>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className={styles.reveal} style={{ background: C.alt, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "112px 32px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 56 }}>
          <div style={{ maxWidth: 640, display: "flex", flexDirection: "column", gap: 16 }}>
            <span style={eyebrow}>How it works</span>
            <h2 style={h2}>Three steps. That&apos;s the whole job.</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 20 }}>
            <Step n="01" title="Create" body="A branded invoice or quote in minutes. Your logo, your terms, KES or any currency, KRA PIN included.">
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.muted }}><span style={{ fontFamily: MONO }}>INV-0048</span><span>Draft</span></div>
              <div style={{ height: 8, background: C.green100, width: "80%", transformOrigin: "left", animation: "drawIn 4.5s cubic-bezier(0.16,1,0.3,1) infinite" }} />
              <div style={{ height: 8, background: C.green100, width: "55%", transformOrigin: "left", animation: "drawIn 4.5s cubic-bezier(0.16,1,0.3,1) .35s infinite both" }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${C.border}`, paddingTop: 8, fontSize: 12 }}><span style={{ color: C.muted }}>Total</span><span style={{ fontFamily: MONO, fontWeight: 600 }}>KSh 42,000</span></div>
            </Step>
            <Step n="02" title="Send" body="Email it or share a link. Your client opens it on their phone, sees a clean branded invoice, and pays right there.">
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                <span style={{ display: "inline-flex", animation: "planeHop 5s ease-in-out infinite" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.green600} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4z" /><path d="M22 2 11 13" /></svg>
                </span>
                <span style={{ fontFamily: MONO, color: C.muted }}>canja.co.ke/i/inv-0048</span>
              </div>
              <div style={{ display: "flex", gap: 6, fontSize: 11 }}>
                <span style={{ background: C.green100, color: C.green800, padding: "4px 10px", fontWeight: 600, animation: "seqIn 6s ease-out infinite both" }}>Sent 09:14</span>
                <span style={{ background: C.green100, color: C.green800, padding: "4px 10px", fontWeight: 600, animation: "seqIn 6s ease-out .6s infinite both" }}>Viewed 09:31</span>
              </div>
            </Step>
            <Step n="03" title="Get paid & tracked" body="The M-Pesa payment lands, the invoice flips to paid, and your dashboard updates. No matching messages to jobs.">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, animation: "seqIn 6s ease-out infinite both" }}><span style={{ fontFamily: MONO }}>M-Pesa · SGH4K92XT</span><span style={{ fontFamily: MONO, fontWeight: 600, color: "#2E7D32" }}>+42,000</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${C.border}`, paddingTop: 8, fontSize: 12 }}><span style={{ color: C.muted }}>INV-0048</span><span style={{ background: C.green100, color: C.green800, padding: "3px 10px", fontWeight: 600, fontSize: 11, animation: "seqIn 6s ease-out .8s infinite both" }}>Paid</span></div>
            </Step>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className={styles.reveal} style={{ padding: "112px 32px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 56 }}>
          <div style={{ maxWidth: 640, display: "flex", flexDirection: "column", gap: 16 }}>
            <span style={eyebrow}>Features</span>
            <h2 style={h2}>Everything between the work and the money.</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 20 }}>
            <Feature icon={<><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><path d="m9 10 2 2 4-4" /></>} title="Quotes clients accept online" body="Send an estimate, the client accepts or declines with one tap — and an accepted quote becomes an invoice automatically.">
              <span style={{ background: C.green100, color: C.green800, padding: "6px 14px", fontSize: 12, fontWeight: 600, animation: "seqIn 6s ease-out infinite both" }}>Accepted ✓</span>
              <span style={{ background: C.alt, color: C.muted, padding: "6px 14px", fontSize: 12, animation: "seqIn 6s ease-out .7s infinite both" }}>→ INV-0049</span>
            </Feature>
            <Feature icon={<span style={{ display: "inline-flex", width: 22, transformOrigin: "50% 0", animation: "bellSwing 4s ease-in-out infinite" }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.green600} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg></span>} rawIcon title="Reminders on autopilot" body="Polite, automatic follow-ups before and after the due date. You stop being the person who chases.">
              <div style={{ background: C.canvas, border: `1px solid ${C.border}`, padding: "10px 14px", fontSize: 12, color: C.muted, display: "flex", justifyContent: "space-between", gap: 8, width: "100%" }}><span>Reminder · 3 days overdue</span><span style={{ color: "#D97706", fontWeight: 600 }}>Sent</span></div>
            </Feature>
            <Feature icon={<><path d="M3 3v18h18" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" /></>} title="Cash-flow & aging dashboard" body="Who owes you, what's overdue, what came in this month — one glance, always current.">
              <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 52, width: "100%" }}>
                {[["40%", C.green100, "0s"], ["65%", C.green300, ".12s"], ["50%", C.green100, ".24s"], ["85%", C.green600, ".36s"], ["70%", C.green300, ".48s"], ["100%", C.green800, ".6s"]].map(([h, bg, delay], i) => (
                  <span key={i} style={{ flex: 1, height: h, background: bg, display: "block", transformOrigin: "bottom", animation: `riseIn 5s cubic-bezier(0.16,1,0.3,1) ${delay} infinite both` }} />
                ))}
              </div>
            </Feature>
            <Feature icon={<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></>} title="Multiple PDF templates" body="Pick a look that fits your brand. Every PDF is crisp, consistent, and carries your logo.">
              {[[C.canvas, "0s"], [C.green100, ".5s"], [C.green800, "1s"]].map(([bg, delay], i) => (
                <span key={i} style={{ width: 44, height: 56, background: bg, border: `1px solid ${C.border}`, display: "block", animation: `floatCard 4s ease-in-out ${delay} infinite` }} />
              ))}
            </Feature>
            <Feature icon={<><circle cx="12" cy="12" r="10" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /><path d="M2 12h20" /></>} title="Multi-currency" body="KES first — but bill international clients in their currency without leaving Canja.">
              <div style={{ display: "flex", gap: 8, fontFamily: MONO, fontSize: 12 }}>
                <span style={{ background: C.green100, color: C.green800, padding: "6px 12px", fontWeight: 600, animation: "softPulse 3.5s ease-in-out infinite" }}>KES</span>
                {["USD", "EUR", "GBP"].map((c) => <span key={c} style={{ background: C.alt, color: C.muted, padding: "6px 12px" }}>{c}</span>)}
              </div>
            </Feature>
            <Feature icon={<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></>} title="Full audit trail" body="Issued documents are immutable. Every change, payment, and credit note is on the record — dispute-proof.">
              <div style={{ background: C.canvas, border: `1px solid ${C.border}`, padding: "10px 14px", display: "flex", flexDirection: "column", gap: 5, fontFamily: MONO, fontSize: 10.5, color: C.muted, width: "100%" }}>
                <span style={{ animation: "seqIn 7s ease-out infinite both" }}>09:14 · issued by you</span>
                <span style={{ animation: "seqIn 7s ease-out .6s infinite both" }}>09:31 · viewed by client</span>
                <span style={{ color: "#2E7D32", animation: "seqIn 7s ease-out 1.2s infinite both" }}>14:02 · paid via M-Pesa</span>
              </div>
            </Feature>
          </div>
        </div>
      </section>

      {/* WHY CANJA */}
      <section id="why" className={styles.reveal} style={{ background: C.alt, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "112px 32px" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", display: "flex", flexDirection: "column", gap: 56 }}>
          <div style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 16 }}>
            <span style={eyebrow}>Why Canja</span>
            <h2 style={h2}>Zoho and QuickBooks are built for cards. Canja is built for M-Pesa.</h2>
            <p style={{ margin: 0, fontSize: 17, lineHeight: 1.6, color: C.muted, textWrap: "pretty" }}>Global tools assume Stripe and card checkouts — not native for Kenyan merchants. Canja is local by design.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 20, alignItems: "stretch" }}>
            <div style={{ ...card, boxShadow: "none", padding: 32, display: "flex", flexDirection: "column", gap: 20 }}>
              <span style={{ fontFamily: HEADING, fontWeight: 600, fontSize: 19, color: C.muted }}>Global tools</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 14, fontSize: 15, color: C.muted }}>
                {globalCons.map((t, i) => (
                  <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}><Cross /><span>{t}</span></div>
                ))}
              </div>
            </div>
            <div style={{ background: C.surface, border: `2px solid ${C.green600}`, borderRadius: 16, padding: 32, display: "flex", flexDirection: "column", gap: 20, boxShadow: "0 12px 32px rgba(16,59,5,.10)" }}>
              <img src="/canja/logo/wordmark-color.png" alt="Canja" style={{ height: 20, width: "auto", alignSelf: "flex-start" }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 14, fontSize: 15, color: C.ink }}>
                {canjaPros.map((node, i) => (
                  <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}><Check mt={2} /><span>{node}</span></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TRUST */}
      <section className={styles.reveal} style={{ padding: "112px 32px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 48 }}>
          <div style={{ maxWidth: 640, display: "flex", flexDirection: "column", gap: 16 }}>
            <span style={eyebrow}>Trust &amp; security</span>
            <h2 style={h2}>This is your money. We treat it that way.</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 20 }}>
            {trust.map((t) => (
              <div key={t.title} style={{ display: "flex", flexDirection: "column", gap: 10, borderTop: `2px solid ${C.green800}`, paddingTop: 18 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.green800} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{t.icon}</svg>
                <h3 style={{ margin: 0, fontFamily: HEADING, fontWeight: 600, fontSize: 17 }}>{t.title}</h3>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: C.muted }}>{t.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className={styles.reveal} style={{ background: C.alt, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "112px 32px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", display: "flex", flexDirection: "column", gap: 56 }}>
          <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
            <span style={eyebrow}>Pricing</span>
            <h2 style={h2}>Free is a real home, not a trap.</h2>
            <p style={{ margin: 0, maxWidth: 560, fontSize: 17, lineHeight: 1.6, color: C.muted }}>The core invoicing loop is free forever. Upgrade when your business does.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 20, alignItems: "stretch" }}>
            {/* Free */}
            <div style={{ ...card, boxShadow: "none", padding: 36, display: "flex", flexDirection: "column", gap: 22 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontFamily: HEADING, fontWeight: 600, fontSize: 21 }}>Free</span>
                <span style={{ fontSize: 14, color: C.muted }}>Everything you need to bill and get paid.</span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}><span style={{ fontFamily: HEADING, fontWeight: 700, fontSize: 42, letterSpacing: "-0.02em" }}>KSh 0</span><span style={{ fontSize: 14, color: C.muted }}>forever</span></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 14.5, borderTop: `1px solid ${C.border}`, paddingTop: 22 }}>
                {freePlan.map((t) => (
                  <span key={t} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}><Check />{t}</span>
                ))}
              </div>
              <a href={SIGNUP} className={styles.ghost} style={{ marginTop: "auto", display: "block", textAlign: "center", background: C.surface, color: C.ink, fontWeight: 600, fontSize: 15, padding: "14px 0", borderRadius: 10, border: `1px solid ${C.ink}` }}>Start free</a>
            </div>
            {/* Pro */}
            <div style={{ background: C.surface, border: `2px solid ${C.green800}`, borderRadius: 16, padding: 36, display: "flex", flexDirection: "column", gap: 22, boxShadow: "0 16px 40px rgba(16,59,5,.12)", position: "relative" }}>
              <span style={{ position: "absolute", top: -13, left: 36, background: C.goldSoft, color: C.ink, border: `1px solid ${C.gold}`, fontSize: 12, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", padding: "4px 12px", borderRadius: 999 }}>Pro</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontFamily: HEADING, fontWeight: 600, fontSize: 21 }}>Pro</span>
                <span style={{ fontSize: 14, color: C.muted }}>For teams and freelancers going full-time.</span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}><span style={{ fontFamily: HEADING, fontWeight: 700, fontSize: 42, letterSpacing: "-0.02em" }}>KSh 1,500</span><span style={{ fontSize: 14, color: C.muted }}>/ month</span></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 14.5, borderTop: `1px solid ${C.border}`, paddingTop: 22 }}>
                {proPlan.map((t) => (
                  <span key={t} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}><Check />{t}</span>
                ))}
              </div>
              <a href={SIGNUP} className={styles.cta} style={{ marginTop: "auto", display: "block", textAlign: "center", fontWeight: 700, fontSize: 15, padding: "14px 0", borderRadius: 10 }}>Start free, upgrade later</a>
            </div>
          </div>
          <p style={{ margin: 0, textAlign: "center", fontSize: 14, color: C.muted }}>No card to start. Upgrade or downgrade any time — your data stays yours.</p>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className={styles.reveal} style={{ padding: "112px 32px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 40 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <span style={eyebrow}>FAQ</span>
            <h2 style={h2}>The last few questions.</h2>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {faqs.map(([q, a], i) => (
              <details key={q} className={styles.faqItem} style={{ borderTop: `1px solid ${C.border}`, borderBottom: i === faqs.length - 1 ? `1px solid ${C.border}` : undefined }}>
                <summary style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, padding: "22px 4px", fontSize: 17, fontWeight: 600 }}>
                  {q}
                  <svg style={{ flexShrink: 0 }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.green600} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                </summary>
                <p style={{ margin: 0, padding: "0 4px 22px", fontSize: 15.5, lineHeight: 1.65, color: C.muted }}>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA + FOOTER */}
      <section id="cta" style={{ background: C.green900, color: C.darkText }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "120px 32px 96px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 28 }}>
          <img src="/canja/logo/wordmark-white.png" alt="Canja" style={{ height: 32, width: "auto" }} />
          <h2 style={{ margin: 0, fontFamily: HEADING, fontWeight: 700, fontSize: "clamp(36px,5vw,64px)", lineHeight: 1.08, letterSpacing: "-0.02em", maxWidth: 820, textWrap: "balance" }}>Send your first invoice in the next five minutes.</h2>
          <p style={{ margin: 0, fontSize: 18, color: C.darkMuted, maxWidth: 520, lineHeight: 1.6 }}>Free forever core. No card required. Built for how Kenya gets paid.</p>
          <a href={SIGNUP} className={styles.cta} style={{ display: "inline-block", fontWeight: 700, fontSize: 18, padding: "18px 40px", borderRadius: 12, boxShadow: "0 8px 24px rgba(244,164,35,.35)" }}>Start free</a>
        </div>
        <footer style={{ borderTop: "1px solid rgba(243,249,240,.14)" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", padding: "64px 32px 40px", display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 40, fontSize: 14 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <img src="/canja/logo/wordmark-white.png" alt="Canja" style={{ height: 24, width: "auto", alignSelf: "flex-start" }} />
              <p style={{ margin: 0, color: C.darkMuted, lineHeight: 1.6, maxWidth: 260 }}>Invoicing and payments for Kenyan freelancers and small teams. From finished work to paid — the M-Pesa way.</p>
            </div>
            {footerCols.map(([heading, links]) => (
              <div key={heading} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <span style={{ fontWeight: 600, fontSize: 12.5, letterSpacing: ".07em", textTransform: "uppercase", color: C.darkText }}>{heading}</span>
                {links.map(([label, href], i) => (
                  <a key={`${label}-${i}`} href={href} className={styles.footLink}>{label}</a>
                ))}
              </div>
            ))}
          </div>
          <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 32px 40px" }}>
            <div style={{ borderTop: "1px solid rgba(243,249,240,.14)", paddingTop: 24, display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 16, fontSize: 13.5, color: C.darkMuted }}>
              <span>© 2026 Canja. All rights reserved.</span>
              <span>Made in Kenya 🇰🇪</span>
            </div>
          </div>
        </footer>
      </section>
    </div>
  );
}

function Step({ n, title, body, children }: { n: string; title: string; body: string; children: ReactNode }) {
  return (
    <div style={{ ...card, padding: 32, display: "flex", flexDirection: "column", gap: 16 }}>
      <span style={{ fontFamily: MONO, fontSize: 13, color: C.green600, fontWeight: 600 }}>{n}</span>
      <h3 style={{ margin: 0, fontFamily: HEADING, fontWeight: 600, fontSize: 22 }}>{title}</h3>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: C.muted }}>{body}</p>
      <div style={{ marginTop: "auto", background: C.canvas, border: `1px solid ${C.border}`, padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>
    </div>
  );
}

function Feature({ icon, title, body, children, rawIcon }: { icon: ReactNode; title: string; body: string; children: ReactNode; rawIcon?: boolean }) {
  return (
    <div style={{ ...card, padding: 28, display: "flex", flexDirection: "column", gap: 12 }}>
      {rawIcon ? icon : (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.green600} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
      )}
      <h3 style={{ margin: 0, fontFamily: HEADING, fontWeight: 600, fontSize: 19 }}>{title}</h3>
      <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: C.muted }}>{body}</p>
      <div style={{ marginTop: "auto", display: "flex", gap: 8 }}>{children}</div>
    </div>
  );
}
