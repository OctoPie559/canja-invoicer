/**
 * Scoped CSS for the landing page: the design's keyframes, base link colours,
 * and the hover/active states for buttons and nav links. Everything is namespaced
 * under `.canjaLanding` so it can't leak into the app. Per-element hover lives
 * here (not inline) because inline styles can't express `:hover`.
 */
export function LandingStyles() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
.canjaLanding{background:#FBFAF7;color:#14231A;font-family:var(--font-sans),'Outfit',sans-serif;-webkit-font-smoothing:antialiased}
.canjaLanding a{color:#1F6A16;text-decoration:none}
.canjaLanding ::selection{background:#E6F3E1}
.canjaLanding summary::-webkit-details-marker{display:none}

/* interactive states */
.canjaLanding .cj-navlink{color:#14231A;transition:color .12s}
.canjaLanding .cj-navlink:hover{color:#1F6A16}
.canjaLanding .cj-cta:hover{background:#DB9016 !important;color:#14231A}
.canjaLanding .cj-cta:active{transform:translateY(1px)}
.canjaLanding .cj-ghost:hover{background:#F4F5F1 !important;color:#14231A}
.canjaLanding .cj-outline{transition:background .12s}
.canjaLanding .cj-outline:hover{background:#F4F5F1}
.canjaLanding .cj-foot-link{color:#A9C4A0;transition:color .12s}
.canjaLanding .cj-foot-link:hover{color:#F3F9F0}

/* responsive — inline styles carry the desktop design; these breakpoints
   override the handful of values that must change on smaller screens
   (!important is required to beat the inline declarations) */
.canjaLanding .cj-burger{display:none;background:none;border:0;padding:6px;cursor:pointer;color:#14231A}
@media (max-width:900px){
  .canjaLanding .cj-nav-desktop{display:none !important}
  .canjaLanding .cj-nav-login{display:none !important}
  .canjaLanding .cj-burger{display:inline-flex}
  .canjaLanding .cj-foot-grid{grid-template-columns:1fr 1fr !important}
}
@media (min-width:901px){
  .canjaLanding .cj-mobile-menu{display:none !important}
}
@media (max-width:1024px){
  .canjaLanding .cj-trust{grid-template-columns:1fr 1fr !important}
  .canjaLanding .cj-trust > div{grid-column:span 1 !important}
}
@media (max-width:640px){
  .canjaLanding .cj-trust{grid-template-columns:1fr !important}
  .canjaLanding .cj-pad{padding:72px 20px !important}
  .canjaLanding .cj-hero{padding-left:20px !important;padding-right:20px !important}
  .canjaLanding .cj-cta-pad{padding:88px 20px 72px !important}
  .canjaLanding .cj-nav-inner{padding-left:16px !important;padding-right:16px !important}
  .canjaLanding .cj-foot-pad{padding-left:20px !important;padding-right:20px !important}
}
@media (max-width:520px){
  .canjaLanding .cj-foot-grid{grid-template-columns:1fr !important}
}
/* sticky scroll stage: svh keeps it fully visible around mobile URL bars */
.canjaLanding .cj-stage{height:100vh;height:100svh}

/* motion */
@keyframes goldPulse{0%{box-shadow:0 8px 24px rgba(244,164,35,.35),0 0 0 0 rgba(244,164,35,.45)}70%{box-shadow:0 8px 24px rgba(244,164,35,.35),0 0 0 14px rgba(244,164,35,0)}100%{box-shadow:0 8px 24px rgba(244,164,35,.35),0 0 0 0 rgba(244,164,35,0)}}
@keyframes drawIn{0%{transform:scaleX(0)}22%,100%{transform:scaleX(1)}}
@keyframes riseIn{0%{transform:scaleY(0)}30%,100%{transform:scaleY(1)}}
@keyframes seqIn{0%,6%{opacity:0;transform:translateY(5px)}16%,92%{opacity:1;transform:translateY(0)}100%{opacity:0}}
@keyframes bellSwing{0%,60%,100%{transform:rotate(0deg)}66%{transform:rotate(-14deg)}72%{transform:rotate(11deg)}78%{transform:rotate(-7deg)}84%{transform:rotate(4deg)}90%{transform:rotate(0deg)}}
@keyframes planeHop{0%,55%,100%{transform:translate(0,0)}70%{transform:translate(4px,-4px)}85%{transform:translate(0,0)}}
@keyframes floatCard{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@keyframes softPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
@media (prefers-reduced-motion: reduce){.canjaLanding *{animation:none !important;transition:none !important}}
`.trim(),
      }}
    />
  );
}
