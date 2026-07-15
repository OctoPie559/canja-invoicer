/**
 * The five Trust-card illustrations, kept verbatim from the Claude Design
 * export. They're intricate decorative SVGs (gradients, filters, and CSS
 * keyframe animations wired to the shared landing keyframes) — not something to
 * hand-edit glyph by glyph — so they're rendered as-is rather than transcribed
 * to JSX. Swap the whole string if the design changes. The keyframes they
 * reference (seqIn, floatCard) live in landing-styles.tsx.
 */

function Illo({ svg, height }: { svg: string; height: number }) {
  return (
    <div
      style={{
        height,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

const IMMUTABLE = `
<svg width="100%" height="180" viewBox="0 0 340 180" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <radialGradient id="imGlow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#8FD07E" stop-opacity="0.55"></stop><stop offset="1" stop-color="#8FD07E" stop-opacity="0"></stop></radialGradient>
    <linearGradient id="imCore" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2FA018"></stop><stop offset="1" stop-color="#103B05"></stop></linearGradient>
    <linearGradient id="imShine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.35"></stop><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"></stop></linearGradient>
    <linearGradient id="imFadeL" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FFFFFF"></stop><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"></stop></linearGradient>
    <linearGradient id="imFadeR" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#FFFFFF"></stop><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"></stop></linearGradient>
    <filter id="imDrop" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="#103B05" flood-opacity="0.35"></feDropShadow></filter>
  </defs>
  <ellipse cx="170" cy="92" rx="130" ry="82" fill="url(#imGlow)"></ellipse>
  <g opacity="0.85">
    <rect x="14" y="64" width="52" height="52" rx="16" fill="#FFFFFF" stroke="#E7E5DE"></rect>
    <rect x="26" y="80" width="28" height="4" rx="2" fill="#E7E5DE"></rect><rect x="26" y="90" width="20" height="4" rx="2" fill="#E7E5DE"></rect><rect x="26" y="100" width="24" height="4" rx="2" fill="#EFEEE8"></rect>
    <rect x="79" y="60" width="60" height="60" rx="18" fill="#FFFFFF" stroke="#E7E5DE"></rect>
    <rect x="92" y="76" width="34" height="5" rx="2.5" fill="#E7E5DE"></rect><rect x="92" y="87" width="24" height="5" rx="2.5" fill="#E7E5DE"></rect><rect x="92" y="98" width="29" height="5" rx="2.5" fill="#EFEEE8"></rect>
    <rect x="201" y="60" width="60" height="60" rx="18" fill="#FFFFFF" stroke="#E7E5DE"></rect>
    <rect x="214" y="76" width="34" height="5" rx="2.5" fill="#E7E5DE"></rect><rect x="214" y="87" width="24" height="5" rx="2.5" fill="#E7E5DE"></rect><rect x="214" y="98" width="29" height="5" rx="2.5" fill="#EFEEE8"></rect>
    <rect x="274" y="64" width="52" height="52" rx="16" fill="#FFFFFF" stroke="#E7E5DE"></rect>
    <rect x="286" y="80" width="28" height="4" rx="2" fill="#E7E5DE"></rect><rect x="286" y="90" width="20" height="4" rx="2" fill="#E7E5DE"></rect><rect x="286" y="100" width="24" height="4" rx="2" fill="#EFEEE8"></rect>
  </g>
  <rect x="122" y="42" width="96" height="96" rx="30" stroke="#8FD07E" stroke-opacity="0.7" stroke-width="1.5"></rect>
  <rect x="114" y="34" width="112" height="112" rx="34" stroke="#8FD07E" stroke-opacity="0.3" stroke-width="1.5"></rect>
  <g filter="url(#imDrop)">
    <rect x="130" y="50" width="80" height="80" rx="24" fill="url(#imCore)"></rect>
    <rect x="130" y="50" width="80" height="40" rx="24" fill="url(#imShine)"></rect>
  </g>
  <path d="M158 87v-9a12 12 0 0 1 24 0v9" stroke="#FFFFFF" stroke-width="4" fill="none" stroke-linecap="round"></path>
  <rect x="152" y="87" width="36" height="27" rx="7" fill="#FFFFFF"></rect>
  <circle cx="170" cy="98" r="3.5" fill="#103B05"></circle>
  <rect x="168" y="100" width="4" height="8" rx="2" fill="#103B05"></rect>
  <rect x="0" y="0" width="42" height="180" fill="url(#imFadeL)"></rect>
  <rect x="298" y="0" width="42" height="180" fill="url(#imFadeR)"></rect>
</svg>`;

const AUDIT = `
<svg width="100%" height="180" viewBox="0 0 340 180" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <radialGradient id="atGlow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#8FD07E" stop-opacity="0.4"></stop><stop offset="1" stop-color="#8FD07E" stop-opacity="0"></stop></radialGradient>
    <linearGradient id="atCore" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2FA018"></stop><stop offset="1" stop-color="#103B05"></stop></linearGradient>
    <linearGradient id="atShine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.35"></stop><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"></stop></linearGradient>
    <filter id="atDrop" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="9" stdDeviation="9" flood-color="#103B05" flood-opacity="0.32"></feDropShadow></filter>
    <filter id="atChip" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#14231A" flood-opacity="0.14"></feDropShadow></filter>
  </defs>
  <ellipse cx="170" cy="90" rx="120" ry="72" fill="url(#atGlow)"></ellipse>
  <path d="M138 90H100q-8 0-8-8V48q0-8-8-8H72" stroke="#D9DED4" stroke-width="1.5" fill="none"></path>
  <path d="M138 90H100q-8 0-8 8v32q0 8-8 8H72" stroke="#D9DED4" stroke-width="1.5" fill="none"></path>
  <path d="M202 90h38q8 0 8-8V54q0-8 8-8h6" stroke="#D9DED4" stroke-width="1.5" fill="none"></path>
  <path d="M202 90h38q8 0 8 8v26q0 8 8 8h6" stroke="#D9DED4" stroke-width="1.5" fill="none"></path>
  <circle cx="72" cy="40" r="3" fill="#8FD07E"></circle>
  <circle cx="72" cy="138" r="3" fill="#8FD07E"></circle>
  <circle cx="262" cy="46" r="3" fill="#8FD07E"></circle>
  <circle cx="262" cy="132" r="3" fill="#F4A423"></circle>
  <g filter="url(#atDrop)">
    <rect x="138" y="58" width="64" height="64" rx="20" fill="url(#atCore)"></rect>
    <rect x="138" y="58" width="64" height="32" rx="20" fill="url(#atShine)"></rect>
  </g>
  <path d="M160 76h14l6 6v20a2 2 0 0 1-2 2h-18a2 2 0 0 1-2-2V78a2 2 0 0 1 2-2z" fill="none" stroke="#FFFFFF" stroke-width="2.4" stroke-linejoin="round"></path>
  <path d="M164 92l4 4 8-8" stroke="#FFFFFF" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>
  <g filter="url(#atChip)" style="animation:seqIn 8s ease-out infinite both">
    <rect x="10" y="26" width="62" height="28" rx="14" fill="#E6F3E1"></rect>
    <text x="41" y="44" text-anchor="middle" font-family="Outfit, sans-serif" font-size="12" font-weight="600" fill="#103B05">Issued</text>
  </g>
  <g filter="url(#atChip)" style="animation:seqIn 8s ease-out .6s infinite both">
    <rect x="6" y="124" width="66" height="28" rx="14" fill="#FDEFD4"></rect>
    <text x="39" y="142" text-anchor="middle" font-family="Outfit, sans-serif" font-size="12" font-weight="600" fill="#8A5B00">Viewed</text>
  </g>
  <g filter="url(#atChip)" style="animation:seqIn 8s ease-out 1.2s infinite both">
    <rect x="262" y="32" width="76" height="28" rx="14" fill="#FFFFFF" stroke="#E7E5DE"></rect>
    <text x="300" y="50" text-anchor="middle" font-family="Outfit, sans-serif" font-size="12" font-weight="600" fill="#1F6A16">Reminded</text>
  </g>
  <g filter="url(#atChip)" style="animation:seqIn 8s ease-out 1.8s infinite both">
    <rect x="262" y="118" width="64" height="28" rx="14" fill="url(#atCore)"></rect>
    <text x="294" y="136" text-anchor="middle" font-family="Outfit, sans-serif" font-size="12" font-weight="600" fill="#F3F9F0">Paid ✓</text>
  </g>
</svg>`;

const DELIVERY = `
<svg width="100%" height="180" viewBox="0 0 340 180" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <radialGradient id="rdBeam" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#8FD07E" stop-opacity="0.6"></stop><stop offset="1" stop-color="#8FD07E" stop-opacity="0"></stop></radialGradient>
    <linearGradient id="rdPill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFC65B"></stop><stop offset="1" stop-color="#F4A423"></stop></linearGradient>
    <linearGradient id="rdShine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.5"></stop><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"></stop></linearGradient>
    <filter id="rdDrop" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="12" stdDeviation="12" flood-color="#DB9016" flood-opacity="0.45"></feDropShadow></filter>
    <filter id="rdCur" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#14231A" flood-opacity="0.3"></feDropShadow></filter>
    <filter id="rdChip" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#14231A" flood-opacity="0.14"></feDropShadow></filter>
  </defs>
  <ellipse cx="240" cy="86" rx="120" ry="48" fill="url(#rdBeam)"></ellipse>
  <path d="M112 118 C 138 116, 144 76, 170 74" stroke="#8FD07E" stroke-width="2" stroke-dasharray="1.5 7" stroke-linecap="round" fill="none"></path>
  <g filter="url(#rdChip)">
    <rect x="26" y="102" width="84" height="34" rx="17" fill="#FFFFFF" stroke="#E7E5DE"></rect>
    <g transform="translate(41 112) scale(0.58)" fill="none" stroke="#1F6A16" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4z"></path><path d="M22 2 11 13"></path></g>
    <text x="72" y="124" text-anchor="start" font-family="Outfit, sans-serif" font-size="13" font-weight="600" fill="#14231A">Sent</text>
  </g>
  <g filter="url(#rdDrop)">
    <rect x="176" y="50" width="140" height="46" rx="23" fill="url(#rdPill)"></rect>
    <rect x="176" y="50" width="140" height="23" rx="11.5" fill="url(#rdShine)"></rect>
  </g>
  <path d="m197 73 6 6 11-12" stroke="#14231A" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>
  <text x="226" y="78" text-anchor="start" font-family="Outfit, sans-serif" font-size="15" font-weight="700" fill="#14231A">Delivered</text>
  <g filter="url(#rdCur)">
    <path d="M298 100 l0 26 6-6 5 11 6-3-5-11 9-1z" fill="#14231A" stroke="#FFFFFF" stroke-width="2" stroke-linejoin="round"></path>
  </g>
  <g style="animation:seqIn 5s ease-out .8s infinite both">
    <rect x="176" y="128" width="106" height="26" rx="13" fill="#FFFFFF" stroke="#E7E5DE"></rect>
    <circle cx="190" cy="141" r="3.5" fill="#2E7D32"></circle>
    <text x="202" y="145" text-anchor="start" font-family="Outfit, sans-serif" font-size="11.5" font-weight="600" fill="#103B05">Viewed 09:31</text>
  </g>
</svg>`;

const EXPORT = `
<svg width="100%" height="190" viewBox="0 0 520 190" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <radialGradient id="exArch" cx="0.5" cy="1" r="0.9"><stop offset="0" stop-color="#8FD07E" stop-opacity="0.55"></stop><stop offset="0.7" stop-color="#8FD07E" stop-opacity="0"></stop></radialGradient>
    <linearGradient id="exFront" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"></stop><stop offset="1" stop-color="#EEF0EA"></stop></linearGradient>
    <linearGradient id="exGreen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2FA018"></stop><stop offset="1" stop-color="#103B05"></stop></linearGradient>
    <linearGradient id="exGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFC65B"></stop><stop offset="1" stop-color="#F4A423"></stop></linearGradient>
    <filter id="exDrop" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#14231A" flood-opacity="0.18"></feDropShadow></filter>
    <filter id="exSoft" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="5" stdDeviation="6" flood-color="#14231A" flood-opacity="0.12"></feDropShadow></filter>
  </defs>
  <circle cx="260" cy="252" r="200" fill="url(#exArch)"></circle>
  <path d="M120 190a140 140 0 0 1 280 0" stroke="#8FD07E" stroke-opacity="0.3" stroke-width="1.5" fill="none"></path>
  <circle cx="140" cy="70" r="3" fill="#8FD07E"></circle>
  <circle cx="396" cy="52" r="4" fill="#F4A423" opacity="0.7"></circle>
  <circle cx="430" cy="112" r="2.5" fill="#8FD07E"></circle>
  <circle cx="92" cy="118" r="2.5" fill="#8FD07E"></circle>
  <path d="M188 144 L146 130 L156 108 L194 124 Z" fill="#FBFCFA" stroke="#E7E5DE" stroke-linejoin="round"></path>
  <path d="M332 144 L374 130 L364 108 L326 124 Z" fill="#F5F7F2" stroke="#E7E5DE" stroke-linejoin="round"></path>
  <rect x="198" y="120" width="124" height="34" fill="#D5DECF"></rect>
  <rect x="198" y="120" width="124" height="9" fill="#C3CEBB"></rect>
  <g transform="rotate(-12 170 100)"><g filter="url(#exSoft)" style="animation:floatCard 4.5s ease-in-out .5s infinite">
    <path d="M150 70h30l14 14v50a4 4 0 0 1-4 4h-40a4 4 0 0 1-4-4V74a4 4 0 0 1 4-4z" fill="#FFFFFF" stroke="#E7E5DE"></path>
    <path d="M180 70v14h14z" fill="#E6F3E1" stroke="#E7E5DE" stroke-linejoin="round"></path>
    <rect x="154" y="94" width="26" height="4" rx="2" fill="#E7E5DE"></rect>
    <rect x="154" y="102" width="20" height="4" rx="2" fill="#EFEEE8"></rect>
    <rect x="154" y="114" width="32" height="16" rx="5" fill="#8FD07E"></rect>
    <text x="170" y="126" text-anchor="middle" font-family="'Geist Mono', monospace" font-size="9.5" font-weight="600" fill="#103B05">CSV</text>
  </g></g>
  <g transform="rotate(12 350 100)"><g filter="url(#exSoft)" style="animation:floatCard 4.5s ease-in-out 1s infinite">
    <path d="M330 70h30l14 14v50a4 4 0 0 1-4 4h-40a4 4 0 0 1-4-4V74a4 4 0 0 1 4-4z" fill="#FFFFFF" stroke="#E7E5DE"></path>
    <path d="M360 70v14h14z" fill="#FDEFD4" stroke="#E7E5DE" stroke-linejoin="round"></path>
    <rect x="334" y="94" width="26" height="4" rx="2" fill="#E7E5DE"></rect>
    <rect x="334" y="102" width="20" height="4" rx="2" fill="#EFEEE8"></rect>
    <rect x="334" y="114" width="38" height="16" rx="5" fill="url(#exGold)"></rect>
    <text x="353" y="126" text-anchor="middle" font-family="'Geist Mono', monospace" font-size="9" font-weight="600" fill="#14231A">XLSX</text>
  </g></g>
  <g filter="url(#exDrop)" style="animation:floatCard 4.5s ease-in-out infinite">
    <path d="M232 40h40l18 18v66a5 5 0 0 1-5 5h-50a5 5 0 0 1-5-5V45a5 5 0 0 1 5-5z" fill="#FFFFFF" stroke="#E7E5DE"></path>
    <path d="M272 40v18h18z" fill="#E6F3E1" stroke="#E7E5DE" stroke-linejoin="round"></path>
    <rect x="238" y="70" width="34" height="5" rx="2.5" fill="#E7E5DE"></rect>
    <rect x="238" y="80" width="26" height="5" rx="2.5" fill="#EFEEE8"></rect>
    <rect x="238" y="90" width="30" height="5" rx="2.5" fill="#EFEEE8"></rect>
    <rect x="238" y="103" width="36" height="18" rx="5" fill="url(#exGreen)"></rect>
    <text x="256" y="116" text-anchor="middle" font-family="'Geist Mono', monospace" font-size="10.5" font-weight="600" fill="#F3F9F0">PDF</text>
  </g>
  <g filter="url(#exDrop)"><path d="M184 142 h152 v36 a8 8 0 0 1-8 8 H192 a8 8 0 0 1-8-8z" fill="url(#exFront)" stroke="#E7E5DE"></path></g>
  <path d="M184 142h152" stroke="#D5DECF" stroke-width="2"></path>
</svg>`;

const LAWFUL = `
<svg width="100%" height="190" viewBox="0 0 520 190" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="shCore" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2FA018"></stop><stop offset="1" stop-color="#0B2A03"></stop></linearGradient>
    <linearGradient id="shShine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.4"></stop><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"></stop></linearGradient>
    <radialGradient id="shGlow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#8FD07E" stop-opacity="0.5"></stop><stop offset="1" stop-color="#8FD07E" stop-opacity="0"></stop></radialGradient>
    <filter id="shDrop" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="12" stdDeviation="12" flood-color="#0B2A03" flood-opacity="0.38"></feDropShadow></filter>
    <filter id="shChip" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#14231A" flood-opacity="0.14"></feDropShadow></filter>
  </defs>
  <path d="M144 190a116 116 0 0 1 232 0" stroke="#E6F3E1" stroke-width="20" fill="none"></path>
  <path d="M170 190a90 90 0 0 1 180 0" stroke="#CDE8C4" stroke-width="13" fill="none"></path>
  <path d="M192 190a68 68 0 0 1 136 0" stroke="#A9D89A" stroke-width="7" fill="none" opacity="0.7"></path>
  <ellipse cx="260" cy="88" rx="110" ry="70" fill="url(#shGlow)"></ellipse>
  <g filter="url(#shDrop)">
    <path d="M260 24l50 18v37c0 33-21 53-50 66-29-13-50-33-50-66V42z" fill="url(#shCore)"></path>
    <path d="M260 24l50 18v14H210V42z" fill="url(#shShine)"></path>
  </g>
  <path d="M260 32l42 15v32c0 28-17.5 45-42 56.5C235.5 124 218 107 218 79V47z" stroke="#8FD07E" stroke-opacity="0.5" stroke-width="1.5" fill="none"></path>
  <path d="M241 84l14 14 25-27" stroke="#FFFFFF" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>
  <path d="M312 54q26-4 38 10" stroke="#D9DED4" stroke-width="1.5" fill="none"></path>
  <circle cx="350" cy="64" r="3" fill="#8FD07E"></circle>
  <g filter="url(#shChip)" style="animation:seqIn 7s ease-out infinite both">
    <rect x="358" y="50" width="88" height="28" rx="14" fill="#E6F3E1"></rect>
    <text x="402" y="68" text-anchor="middle" font-family="Outfit, sans-serif" font-size="12" font-weight="600" fill="#103B05">Encrypted</text>
  </g>
  <path d="M212 106q-30 0-42 14" stroke="#D9DED4" stroke-width="1.5" fill="none"></path>
  <circle cx="170" cy="120" r="3" fill="#F4A423"></circle>
  <g filter="url(#shChip)" style="animation:seqIn 7s ease-out .7s infinite both">
    <rect x="42" y="106" width="122" height="28" rx="14" fill="#FFFFFF" stroke="#E7E5DE"></rect>
    <text x="103" y="124" text-anchor="middle" font-family="Outfit, sans-serif" font-size="12" font-weight="600" fill="#1F6A16">DPA 2019 aligned</text>
  </g>
</svg>`;

export const TrustIllos = {
  immutable: () => <Illo svg={IMMUTABLE} height={180} />,
  audit: () => <Illo svg={AUDIT} height={180} />,
  delivery: () => <Illo svg={DELIVERY} height={180} />,
  export: () => <Illo svg={EXPORT} height={190} />,
  lawful: () => <Illo svg={LAWFUL} height={190} />,
};
