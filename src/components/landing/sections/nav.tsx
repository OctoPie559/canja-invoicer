import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { C } from "../tokens";
import { CtaButton, Wordmark } from "../parts";
import { LOGIN_HREF } from "../tokens";

const NAV_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#how", label: "How it works" },
  { href: "#why", label: "Why Canja" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

/**
 * Sticky slim nav. Transparent over the bright hero (black wordmark), then on
 * scroll it condenses onto the warm canvas — solid blur background, shadow, and
 * a swap to the full-colour wordmark. Below 900px the centre links collapse
 * into a hamburger menu (the Start-free CTA stays put, thumb-reachable).
 */
export function Nav({ scrolled }: { scrolled: boolean }) {
  const [open, setOpen] = useState(false);
  // With the menu open the bar must read as a solid surface even over the hero.
  const solid = scrolled || open;

  return (
    <nav
      style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        background: solid ? "rgba(251,250,247,.92)" : "transparent",
        backdropFilter: solid ? "blur(10px)" : "none",
        WebkitBackdropFilter: solid ? "blur(10px)" : "none",
        borderBottom: `1px solid ${solid ? C.border : "transparent"}`,
        boxShadow: scrolled ? "0 4px 16px rgba(20,35,26,.08)" : "none",
        transition:
          "background .25s ease,border-color .25s ease,box-shadow .25s ease",
      }}
    >
      <div
        className="cj-nav-inner"
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: scrolled ? "8px 32px" : "14px 32px",
          display: "flex",
          alignItems: "center",
          gap: 32,
          transition: "padding .22s cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        <a
          href="#top"
          style={{ display: "flex", alignItems: "center", position: "relative" }}
        >
          <Wordmark
            variant="black"
            height={32}
            style={{
              opacity: solid ? 0 : 1,
              transition: "opacity .25s ease",
            }}
          />
          <Wordmark
            variant="color"
            height={32}
            alt=""
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              opacity: solid ? 1 : 0,
              transition: "opacity .25s ease",
            }}
          />
        </a>
        <div
          className="cj-nav-desktop"
          style={{
            display: "flex",
            gap: 26,
            flex: 1,
            justifyContent: "center",
            fontSize: 14.5,
            fontWeight: 500,
          }}
        >
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} className="cj-navlink">
              {l.label}
            </a>
          ))}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            marginLeft: "auto",
          }}
        >
          <Link
            href={LOGIN_HREF}
            className="cj-navlink cj-nav-login"
            style={{ fontSize: 14.5, fontWeight: 500 }}
          >
            Log in
          </Link>
          <CtaButton size="sm">Start free</CtaButton>
          <button
            type="button"
            className="cj-burger"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {open && (
        <div
          className="cj-mobile-menu"
          style={{
            borderTop: `1px solid ${C.border}`,
            background: "rgba(251,250,247,.98)",
            padding: "8px 20px 20px",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="cj-navlink"
              onClick={() => setOpen(false)}
              style={{
                padding: "13px 4px",
                fontSize: 16,
                fontWeight: 500,
                borderBottom: `1px solid ${C.border}`,
              }}
            >
              {l.label}
            </a>
          ))}
          <Link
            href={LOGIN_HREF}
            className="cj-navlink"
            onClick={() => setOpen(false)}
            style={{ padding: "13px 4px", fontSize: 16, fontWeight: 500 }}
          >
            Log in
          </Link>
        </div>
      )}
    </nav>
  );
}
