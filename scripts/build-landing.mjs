// Converts a Claude Design "DC" landing export into a self-contained markup +
// CSS bundle the app injects at src/components/landing/landing-markup.ts.
//
// Why a transform and not hand-ported JSX: the design iterates, and the export
// is ~900 lines of inline-styled HTML with bespoke SVGs. Re-running this keeps
// the page faithful to the design tool without a manual rewrite each time.
//
// Usage: node scripts/build-landing.mjs <path-to/Canja Landing Page.dc.html>
//
// It resolves the DC-only constructs (sc-if variants, x-import components,
// style-hover/style-active, refs), rewrites asset paths and font stacks to the
// app's own, and points the CTAs at the real /signup and /login routes.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = process.argv[2];
if (!src) {
  console.error("usage: node scripts/build-landing.mjs <dc.html>");
  process.exit(1);
}

let html = readFileSync(src, "utf8");

// 1. Body between <x-dc> … </x-dc>, minus the <helmet> (we provide our own CSS)
html = html.slice(html.indexOf("<x-dc>") + 6, html.indexOf("</x-dc>"));
html = html.replace(/<helmet>[\s\S]*?<\/helmet>/g, "");

// 2. sc-if: keep the branch flagged true (unwrapped), drop the false ones
html = html.replace(
  /<sc-if\b[^>]*hint-placeholder-val="\{\{ (true|false) \}\}"[^>]*>([\s\S]*?)<\/sc-if>/g,
  (_m, flag, inner) => (flag === "true" ? inner : ""),
);

// 3. x-import components → static markup (only StatTile is used)
const MONO = "var(--font-geist-mono),'Geist Mono',monospace";
html = html.replace(/<x-import\b([^>]*)><\/x-import>/g, (_m, attrs) => {
  const get = (k) => (attrs.match(new RegExp(`${k}="([^"]*)"`)) || [])[1] || "";
  const label = get("label");
  const value = get("value");
  const context = get("context");
  const valueColor = get("emphasis") === "serious" ? "#B91C1C" : "#14231A";
  return (
    `<div style="background:#FFFFFF;box-shadow:inset 0 0 0 1px rgba(20,35,26,.10);padding:12px 14px;display:flex;flex-direction:column;gap:3px;min-height:88px">` +
    `<span style="font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;color:#6B7A70;font-weight:600">${label}</span>` +
    `<span style="font-family:${MONO};font-size:19px;font-weight:600;font-variant-numeric:tabular-nums;color:${valueColor}">${value}</span>` +
    `<span style="font-size:11px;color:#6B7A70">${context}</span>` +
    `</div>`
  );
});

// 4. style-hover / style-active → scoped classes (inline base colours mean the
//    hover declarations need !important to win, matching the tool's runtime)
const hoverRules = [];
let hoverN = 0;
const bang = (decls) =>
  decls
    .split(";")
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => `${d} !important`)
    .join(";");

html = html.replace(/<([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g, (m, tag, attrs) => {
  const hover = (attrs.match(/\sstyle-hover="([^"]*)"/) || [])[1];
  const active = (attrs.match(/\sstyle-active="([^"]*)"/) || [])[1];
  if (hover === undefined && active === undefined) return m;
  const cls = `lh${hoverN++}`;
  if (hover !== undefined) hoverRules.push(`.canjaLanding .${cls}:hover{${bang(hover)}}`);
  if (active !== undefined) hoverRules.push(`.canjaLanding .${cls}:active{${bang(active)}}`);
  let a = attrs
    .replace(/\sstyle-hover="[^"]*"/, "")
    .replace(/\sstyle-active="[^"]*"/, "");
  a = ` class="${cls}"${a}`;
  return `<${tag}${a}>`;
});

// 5. Refs & DC-only attributes
html = html
  .replace(/\sref="\{\{ heroBgRef \}\}"/g, " data-hero-bg")
  .replace(/\sref="\{\{ [a-zA-Z]+ \}\}"/g, "")
  .replace(/\sdata-screen-label="[^"]*"/g, "")
  .replace(/\shint-[a-z-]+="[^"]*"/g, "");

// 6. Font stacks → the app's next/font CSS variables (self-hosted; the literal
//    family names alone would not resolve)
html = html
  .replace(/'Bricolage Grotesque',sans-serif/g, "var(--font-heading),'Bricolage Grotesque',sans-serif")
  .replace(/'Geist Mono',monospace/g, "var(--font-geist-mono),'Geist Mono',monospace")
  .replace(/'Outfit',sans-serif/g, "var(--font-sans),'Outfit',sans-serif");

// 7. Asset paths → public/
html = html
  .replace(/assets\/logo\//g, "/logo_assets/")
  .replace(/uploads\/bg-image\.png/g, "/bg-image.png");

// 8. CTAs → real auth routes. The targeted rewrites match on the link's text
//    (not attribute position — a class= may precede href after step 4).
html = html
  .replace(/href="#cta"/g, 'href="/signup"')
  .replace(/(<a\b[^>]*?)href="#pricing"([^>]*>Log in<\/a>)/g, '$1href="/login"$2')
  .replace(/(<a\b[^>]*?)href="#top"([^>]*>Start free<\/a>)/g, '$1href="/signup"$2');

html = html.trim();

// Keyframes + base + reduced-motion + the generated hover rules, all scoped
const css = `
.canjaLanding{background:#FBFAF7;color:#14231A;font-family:var(--font-sans),'Outfit',sans-serif;-webkit-font-smoothing:antialiased}
.canjaLanding a{color:#1F6A16;text-decoration:none}
.canjaLanding a:hover{color:#103B05}
.canjaLanding ::selection{background:#E6F3E1}
.canjaLanding summary::-webkit-details-marker{display:none}
@keyframes goldPulse{0%{box-shadow:0 8px 24px rgba(244,164,35,.35),0 0 0 0 rgba(244,164,35,.45)}70%{box-shadow:0 8px 24px rgba(244,164,35,.35),0 0 0 14px rgba(244,164,35,0)}100%{box-shadow:0 8px 24px rgba(244,164,35,.35),0 0 0 0 rgba(244,164,35,0)}}
@keyframes drawIn{0%{transform:scaleX(0)}22%,100%{transform:scaleX(1)}}
@keyframes riseIn{0%{transform:scaleY(0)}30%,100%{transform:scaleY(1)}}
@keyframes seqIn{0%,6%{opacity:0;transform:translateY(5px)}16%,92%{opacity:1;transform:translateY(0)}100%{opacity:0}}
@keyframes bellSwing{0%,60%,100%{transform:rotate(0deg)}66%{transform:rotate(-14deg)}72%{transform:rotate(11deg)}78%{transform:rotate(-7deg)}84%{transform:rotate(4deg)}90%{transform:rotate(0deg)}}
@keyframes planeHop{0%,55%,100%{transform:translate(0,0)}70%{transform:translate(4px,-4px)}85%{transform:translate(0,0)}}
@keyframes floatCard{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@keyframes softPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
${hoverRules.join("\n")}
@media (prefers-reduced-motion: reduce){.canjaLanding *{animation:none !important;transition:none !important}}
`.trim();

const out = `// AUTO-GENERATED by scripts/build-landing.mjs — do not edit by hand.
// Regenerate from the Claude Design export when the landing design changes.
export const LANDING_HTML = ${JSON.stringify(html)};

export const LANDING_CSS = ${JSON.stringify(css)};
`;

const dest = resolve(__dirname, "../src/components/landing/landing-markup.ts");
writeFileSync(dest, out);
console.log(`wrote ${dest}`);
console.log(`  html ${html.length} bytes · ${hoverRules.length} hover rules`);
