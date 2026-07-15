import { Logo } from "@/components/app-shell/logo";
import { C, F } from "@/components/landing/tokens";

/**
 * Split-screen auth shell: the form column on the left (wordmark top-left,
 * centered form, quiet footer) and a Canja brand panel on the right — the
 * deep-green moment from the landing page with the product promise and a
 * dashboard vignette. The panel is decorative and disappears below `lg`.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-svh bg-background">
      {/* form column */}
      <div className="flex min-h-svh flex-1 flex-col px-6 py-6 sm:px-10">
        <Logo href="/" />
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>© 2026 Canja. All rights reserved.</span>
        </footer>
      </div>

      {/* brand panel */}
      <aside
        aria-hidden
        className="relative m-4 hidden w-[46%] shrink-0 overflow-hidden rounded-3xl lg:flex lg:flex-col lg:justify-center"
        style={{ background: C.green900, padding: "64px 56px" }}
      >
        {/* faint decorative geometry, echoing the hero glow */}
        <div
          className="pointer-events-none absolute -right-40 -top-40 size-[480px] rounded-full"
          style={{ border: "1.5px solid rgba(143,208,126,.14)" }}
        />
        <div
          className="pointer-events-none absolute -bottom-56 -left-24 size-[560px] rounded-full"
          style={{ border: "1.5px solid rgba(143,208,126,.10)" }}
        />
        <div
          className="pointer-events-none absolute left-1/2 top-1/3 h-[560px] w-[760px] -translate-x-1/2"
          style={{
            background:
              "radial-gradient(ellipse at center,rgba(143,208,126,.16) 0%,rgba(143,208,126,0) 65%)",
          }}
        />

        <div className="relative flex flex-col gap-5">
          <h2
            style={{
              margin: 0,
              fontFamily: F.heading,
              fontWeight: 700,
              fontSize: "clamp(30px,2.6vw,42px)",
              lineHeight: 1.12,
              letterSpacing: "-0.02em",
              color: C.darkText,
              textWrap: "balance",
            }}
          >
            From finished work to paid — the M-Pesa way.
          </h2>
          <p
            style={{
              margin: 0,
              maxWidth: 460,
              fontSize: 16.5,
              lineHeight: 1.6,
              color: C.darkMuted,
            }}
          >
            One clear record of every shilling: who owes you, what&apos;s
            overdue, and what came in this month.
          </p>

          {/* dashboard vignette */}
          <div className="relative mt-8 max-w-[460px]">
            <div
              style={{
                background: C.surface,
                borderRadius: 16,
                boxShadow:
                  "0 0 0 1px rgba(20,35,26,.10),0 24px 56px rgba(0,0,0,.32)",
                padding: 20,
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                }}
              >
                {[
                  {
                    label: "Outstanding",
                    value: "KSh 128,400",
                    context: "12 invoices awaiting payment",
                  },
                  {
                    label: "Paid this month",
                    value: "KSh 214,750",
                    context: "9 payments · 7 via M-Pesa",
                  },
                ].map((t) => (
                  <div
                    key={t.label}
                    style={{
                      background: C.surface,
                      boxShadow: "inset 0 0 0 1px rgba(20,35,26,.10)",
                      borderRadius: 10,
                      padding: "12px 14px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 3,
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
                      {t.label}
                    </span>
                    <span
                      style={{
                        fontFamily: F.mono,
                        fontSize: 19,
                        fontWeight: 600,
                        fontVariantNumeric: "tabular-nums",
                        color: C.ink,
                      }}
                    >
                      {t.value}
                    </span>
                    <span style={{ fontSize: 11, color: C.muted }}>
                      {t.context}
                    </span>
                  </div>
                ))}
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
                    gap: 7,
                    height: 72,
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
                        borderRadius: 3,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* floating M-Pesa payment card */}
            <div
              style={{
                position: "absolute",
                right: -20,
                bottom: -28,
                background: C.surface,
                borderRadius: 12,
                boxShadow:
                  "0 0 0 1px rgba(20,35,26,.10),0 16px 40px rgba(0,0,0,.30)",
                padding: "12px 16px",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div
                style={{ display: "flex", flexDirection: "column", gap: 2 }}
              >
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: C.green600,
                    letterSpacing: ".06em",
                  }}
                >
                  M-PESA
                </span>
                <span
                  style={{
                    fontFamily: F.mono,
                    fontSize: 14,
                    fontWeight: 600,
                    fontVariantNumeric: "tabular-nums",
                    color: C.ink,
                  }}
                >
                  +KSh 36,500 · INV-0047
                </span>
              </div>
              <span
                style={{
                  background: C.green100,
                  color: C.green800,
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "4px 10px",
                  borderRadius: 6,
                }}
              >
                Paid
              </span>
            </div>
          </div>
        </div>
      </aside>
    </main>
  );
}
