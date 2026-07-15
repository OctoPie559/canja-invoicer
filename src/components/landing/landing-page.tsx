"use client";

import { useEffect, useRef, useState } from "react";
import { LandingStyles } from "./landing-styles";
import { Nav } from "./sections/nav";
import { Hero } from "./sections/hero";
import { Problem } from "./sections/problem";
import { HowItWorks } from "./sections/how-it-works";
import { Features } from "./sections/features";
import { Trust } from "./sections/trust";
import { Pricing } from "./sections/pricing";
import { Faq } from "./sections/faq";
import { FinalCta } from "./sections/final-cta";

export function LandingPage() {
  const ref = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);


  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const nav = root.querySelector<HTMLElement>("nav");
    const hero = root.querySelector<HTMLElement>("#top");
    const bg = root.querySelector<HTMLElement>("[data-hero-bg]");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

    const fitHero = () => {
      if (nav && hero) hero.style.marginTop = `-${nav.offsetHeight}px`;
    };
    const onScroll = () => {
      const y = window.scrollY || 0;
      setScrolled(y > 24);
      if (bg && !reduce.matches) {
        bg.style.transform = `translate3d(0,${Math.min(y * 0.28, 160)}px,0)`;
      }
    };

    fitHero();
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", fitHero);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", fitHero);
    };
  }, []);

  // Reveal-on-scroll: hide only below-fold [data-reveal] sections, then fade
  // them up as they arrive. Respects prefers-reduced-motion; never leaves
  // content hidden on unmount.
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const els = Array.from(
      root.querySelectorAll<HTMLElement>("[data-reveal]"),
    );
    const hidden = els.filter(
      (el) => el.getBoundingClientRect().top >= window.innerHeight,
    );
    hidden.forEach((el) => {
      el.style.opacity = "0";
      el.style.transform = "translateY(10px)";
      el.style.transition =
        "opacity .42s cubic-bezier(0.16,1,0.3,1), transform .42s cubic-bezier(0.16,1,0.3,1)";
    });

    const reveal = (el: HTMLElement) => {
      el.style.opacity = "1";
      el.style.transform = "translateY(0)";
    };
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            reveal(e.target as HTMLElement);
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -6% 0px" },
    );
    hidden.forEach((el) => io.observe(el));

    return () => {
      io.disconnect();
      els.forEach(reveal); // safety: never leave content hidden
    };
  }, []);

  return (
    <>
      <LandingStyles />
      <div ref={ref} className="canjaLanding">
        <Nav scrolled={scrolled} />
        <Hero />
        <Problem />
        <HowItWorks />
        <Features />
        <Trust />
        <Pricing />
        <Faq />
        <FinalCta />
      </div>
    </>
  );
}
