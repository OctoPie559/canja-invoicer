"use client";

import { Fragment, useRef } from "react";
import {
  motion,
  useMotionTemplate,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { C, F } from "../tokens";
import { Eyebrow } from "../parts";

/** The gut-punch line, tokenised so each word can light up on its own. */
const WORDS: { text: string; quote?: boolean }[] = [
  { text: "Word" },
  { text: "templates." },
  { text: "Screenshot" },
  { text: "receipts." },
  { text: "“Have", quote: true },
  { text: "you", quote: true },
  { text: "paid", quote: true },
  { text: "yet?”", quote: true },
  { text: "on" },
  { text: "WhatsApp." },
];

/**
 * Each pain pill flies in from its own direction around the words —
 * right, left, top-right, top-left — so the group converges on the
 * headline from all sides. `from` is the starting offset; `rotate` adds
 * a small tilt that settles to 0 as the pill lands.
 */
const PAINS: {
  label: string;
  from: { x: number; y: number };
  rotate: number;
}[] = [
  { label: "No professional look", from: { x: 140, y: 0 }, rotate: 8 },
  {
    label: "Payments that never link to an invoice",
    from: { x: -140, y: 0 },
    rotate: -8,
  },
  { label: "No idea who owes what", from: { x: 90, y: -80 }, rotate: 6 },
  { label: "Endless manual chasing", from: { x: -90, y: -80 }, rotate: -6 },
];

// Scroll-progress budget: words light up over the first stretch, the pills pop
// in after the sentence is fully revealed. The section is pinned for the whole
// 0→1 range (sticky child height == viewport), so everything lands while fixed.
const WORDS_END = 0.6;
const PILLS_START = 0.7;

const headlineStyle: React.CSSProperties = {
  margin: 0,
  maxWidth: 960,
  fontFamily: F.heading,
  fontWeight: 600,
  fontSize: "clamp(30px,4.6vw,58px)",
  lineHeight: 1.16,
  letterSpacing: "-0.02em",
  textWrap: "balance",
};

const pillBase: React.CSSProperties = {
  display: "inline-block",
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: 999,
  padding: "9px 18px",
  fontSize: 14,
  color: C.muted,
  fontFamily: F.sans,
};

/** One word: fades and un-blurs as the scroll passes its slice of progress. */
function Word({
  progress,
  start,
  end,
  quote,
  children,
}: {
  progress: MotionValue<number>;
  start: number;
  end: number;
  quote?: boolean;
  children: React.ReactNode;
}) {
  const opacity = useTransform(progress, [start, end], [0.12, 1]);
  const blurPx = useTransform(progress, [start, end], [5, 0]);
  const filter = useMotionTemplate`blur(${blurPx}px)`;
  return (
    <motion.span
      style={{ opacity, filter, color: quote ? C.muted : C.ink }}
    >
      {children}
    </motion.span>
  );
}

/**
 * One pain pill: flies in from its own direction around the words (right,
 * left, top-right, top-left…), untilting and settling into place once the
 * sentence is fully lit.
 */
function Pill({
  progress,
  start,
  from,
  rotate,
  label,
}: {
  progress: MotionValue<number>;
  start: number;
  from: { x: number; y: number };
  rotate: number;
  label: string;
}) {
  const end = start + 0.13;
  const opacity = useTransform(progress, [start, end], [0, 1]);
  const x = useTransform(progress, [start, end], [from.x, 0]);
  const y = useTransform(progress, [start, end], [from.y, 0]);
  const r = useTransform(progress, [start, end], [rotate, 0]);
  const scale = useTransform(progress, [start, end], [0.85, 1]);
  return (
    <motion.span style={{ opacity, x, y, rotate: r, scale, ...pillBase }}>
      {label}
    </motion.span>
  );
}

/**
 * Problem → agitation. A sticky scroll stage: the eyebrow stays fixed while the
 * pain sentence is revealed word-by-word on scroll, then the pills pop in once
 * it's fully lit. Falls back to a static, fully-legible layout when the visitor
 * prefers reduced motion (or JS is off — the copy is always in the DOM).
 */
export function Problem() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });

  if (reduce) return <StaticProblem />;

  const n = WORDS.length;
  return (
    <section ref={ref} style={{ position: "relative", height: "260vh" }}>
      <div
        style={{
          position: "sticky",
          top: 0,
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 48,
          padding: "0 32px",
          textAlign: "center",
          // pills fly in from outside the group — clip so they never cause a
          // horizontal scrollbar mid-flight
          overflow: "hidden",
        }}
      >
        <Eyebrow>Sound familiar?</Eyebrow>

        <p style={headlineStyle}>
          {WORDS.map((w, i) => {
            const start = (i / n) * WORDS_END;
            const end = start + WORDS_END / n + 0.08;
            return (
              <Fragment key={i}>
                <Word
                  progress={scrollYProgress}
                  start={start}
                  end={end}
                  quote={w.quote}
                >
                  {w.text}
                </Word>{" "}
              </Fragment>
            );
          })}
        </p>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: 10,
          }}
        >
          {PAINS.map((p, j) => (
            <Pill
              key={p.label}
              progress={scrollYProgress}
              start={PILLS_START + j * 0.05}
              from={p.from}
              rotate={p.rotate}
              label={p.label}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

/** Reduced-motion / no-JS fallback: the same content, no scroll choreography. */
function StaticProblem() {
  return (
    <section style={{ padding: "112px 32px" }}>
      <div
        style={{
          maxWidth: 900,
          margin: "0 auto",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          gap: 40,
          alignItems: "center",
        }}
      >
        <Eyebrow>Sound familiar?</Eyebrow>
        <h2 style={{ ...headlineStyle, color: C.ink }}>
          {WORDS.map((w, i) => (
            <Fragment key={i}>
              <span style={{ color: w.quote ? C.muted : C.ink }}>{w.text}</span>{" "}
            </Fragment>
          ))}
        </h2>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: 10,
          }}
        >
          {PAINS.map((p) => (
            <span key={p.label} style={pillBase}>
              {p.label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
