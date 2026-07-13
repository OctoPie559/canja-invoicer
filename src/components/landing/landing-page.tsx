"use client";

import { useEffect, useRef } from "react";
import { LANDING_CSS, LANDING_HTML } from "./landing-markup";

/**
 * Canja marketing landing page. The markup + scoped CSS are generated from the
 * Claude Design export by scripts/build-landing.mjs and injected here; this
 * component only runs the scroll behaviours the design relies on (nav condense
 * + wordmark swap over the hero, hero parallax, and reveal-on-scroll). SSR'd
 * for SEO — a client component still renders its HTML on the server.
 */
export function LandingPage() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const nav = root.querySelector<HTMLElement>("nav");
    const hero = root.querySelector<HTMLElement>("#top");
    const bg = root.querySelector<HTMLElement>("[data-hero-bg]");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    const onScroll = () => {
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      const condensed = y > 24;
      if (nav) {
        const inner = nav.firstElementChild as HTMLElement | null;
        if (inner) {
          inner.style.transition = "padding .22s cubic-bezier(0.16,1,0.3,1)";
          inner.style.padding = condensed ? "8px 32px" : "14px 32px";
        }
        // transparent over the hero image; solid canvas once scrolled
        nav.style.background = condensed ? "rgba(251,250,247,.92)" : "transparent";
        nav.style.setProperty("backdrop-filter", condensed ? "blur(10px)" : "none");
        nav.style.setProperty("-webkit-backdrop-filter", condensed ? "blur(10px)" : "none");
        nav.style.borderBottomColor = condensed ? "#E7E5DE" : "transparent";
        nav.style.boxShadow = condensed ? "0 4px 16px rgba(20,35,26,.08)" : "none";
        // black wordmark over the bright hero green; colour on solid canvas
        const dark = nav.querySelector<HTMLElement>('[data-nav-logo="dark"]');
        const color = nav.querySelector<HTMLElement>('[data-nav-logo="color"]');
        if (dark && color) {
          dark.style.opacity = condensed ? "0" : "1";
          color.style.opacity = condensed ? "1" : "0";
        }
        // keep the hero flush under the nav regardless of its actual height
        if (hero && nav.offsetHeight) {
          const m = `${-nav.offsetHeight}px`;
          if (hero.style.marginTop !== m) hero.style.marginTop = m;
        }
      }
      // hero parallax — background drifts slower than the page
      if (bg && !reduced.matches) {
        const py = Math.min(y * 0.28, 160);
        bg.style.transform = `translate3d(0,${py}px,0)`;
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    // reveal-on-scroll: hide below-fold sections, then reveal as they arrive.
    // Polls geometry (robust to layout shifts); everything shows after 15s.
    let timer: ReturnType<typeof setInterval> | undefined;
    if (!reduced.matches) {
      let pending = Array.from(
        root.querySelectorAll<HTMLElement>("[data-reveal]"),
      ).filter((el) => el.getBoundingClientRect().top >= window.innerHeight);
      pending.forEach((el) => {
        el.style.opacity = "0";
        el.style.transform = "translateY(10px)";
        el.style.transition =
          "opacity .42s cubic-bezier(0.16,1,0.3,1), transform .42s cubic-bezier(0.16,1,0.3,1)";
      });
      const start = Date.now();
      timer = setInterval(() => {
        const expired = Date.now() - start > 15000;
        pending = pending.filter((el) => {
          if (!el.isConnected) return false;
          if (expired || el.getBoundingClientRect().top < window.innerHeight * 0.94) {
            el.style.opacity = "1";
            el.style.transform = "translateY(0)";
            return false;
          }
          return true;
        });
        if (pending.length === 0 && timer) clearInterval(timer);
      }, 150);
    }

    return () => {
      window.removeEventListener("scroll", onScroll);
      if (timer) clearInterval(timer);
      // never leave content hidden
      root.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => {
        el.style.opacity = "1";
        el.style.transform = "none";
      });
    };
  }, []);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: LANDING_CSS }} />
      <div
        ref={ref}
        className="canjaLanding"
        dangerouslySetInnerHTML={{ __html: LANDING_HTML }}
      />
    </>
  );
}
