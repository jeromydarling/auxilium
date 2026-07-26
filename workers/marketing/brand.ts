/**
 * The brand layer: mark, palette, type, and motion.
 *
 * Kept separate from the renderer so the visual language is one file to change
 * rather than a search-and-replace through markup. Everything here is inlined
 * into the document head — no external stylesheet, no font request, no CDN.
 * The site must paint immediately on a bad connection in a hospital car park,
 * which for this audience is not a hypothetical.
 */

/**
 * The mark: a four-point compass.
 *
 * NRI's compass is the product's actual idea — four directions, and a member
 * can carry several at once — so the logo is that object rather than a generic
 * abstract shape. The north point is warm and the other three are cool, which
 * encodes the one rule worth knowing about the engine: ties break toward Cura,
 * the hurting person, not the expensive case.
 *
 * Drawn on a 32×32 grid so it stays legible as a 16px favicon.
 */
export function logoMark(size = 32, className = ''): string {
  return `<svg class="${className}" width="${size}" height="${size}" viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false">
    <path class="lm-n" d="M16 2.5 19.4 12.6 16 16 12.6 12.6Z" fill="url(#lm-warm)"/>
    <path class="lm-e" d="M29.5 16 19.4 19.4 16 16 19.4 12.6Z" fill="currentColor" opacity=".92"/>
    <path class="lm-s" d="M16 29.5 12.6 19.4 16 16 19.4 19.4Z" fill="currentColor" opacity=".74"/>
    <path class="lm-w" d="M2.5 16 12.6 12.6 16 16 12.6 19.4Z" fill="currentColor" opacity=".58"/>
    <defs>
      <linearGradient id="lm-warm" x1="16" y1="2.5" x2="16" y2="16" gradientUnits="userSpaceOnUse">
        <stop stop-color="#f7b267"/><stop offset="1" stop-color="#e8823c"/>
      </linearGradient>
    </defs>
  </svg>`;
}

/** The lockup used in the header and footer. */
export function logoLockup(href = '/'): string {
  return `<a class="lockup" href="${href}" aria-label="Auxilium — home">
    ${logoMark(30, 'lockup-mark')}
    <span class="lockup-text">Auxilium</span>
  </a>`;
}

/** Favicon as a data URI, so it costs no extra request and never 404s. */
export function faviconDataUri(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
<rect width="32" height="32" rx="7" fill="#0d1117"/>
<path d="M16 5 18.9 13.4 16 16 13.1 13.4Z" fill="#f0a057"/>
<path d="M27 16 18.9 18.6 16 16 18.9 13.4Z" fill="#2aa19a"/>
<path d="M16 27 13.1 18.6 16 16 18.9 18.6Z" fill="#2aa19a" opacity=".65"/>
<path d="M5 16 13.1 13.4 16 16 13.1 18.6Z" fill="#2aa19a" opacity=".45"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Tokens and base styles.
 *
 * The palette keeps the application's slate-and-teal ground — the marketing
 * site should not promise a warmer product than the one a user actually opens
 * — and adds a single warm accent used sparingly, for the Cura direction and
 * for moments that are about a person rather than a number.
 */
export const TOKENS = `
:root{
  --bg:#0b0f14; --bg-2:#0f151c; --fg:#e8eff6; --muted:#93a1b1; --faint:#5e6e7f;
  --line:#1d2733; --line-2:#26323f; --card:#111820; --card-2:#151d27;
  --primary:#2fb3aa; --primary-2:#1d8a83; --primary-fg:#04191c;
  --warm:#f0a057; --warm-2:#e8823c;
  --good:#3fb950; --warn:#d9a441; --bad:#f0685f;
  --r:10px; --r-lg:16px; --r-xl:24px;
  --shadow:0 1px 2px rgba(0,0,0,.3),0 8px 24px -8px rgba(0,0,0,.5);
  --shadow-lg:0 2px 4px rgba(0,0,0,.2),0 24px 64px -16px rgba(0,0,0,.65);
  --ease:cubic-bezier(.22,1,.36,1);
  --ease-soft:cubic-bezier(.4,0,.2,1);
  --maxw:1140px;
}
@media(prefers-color-scheme:light){
  :root{
    --bg:#fcfdfe; --bg-2:#f4f7fa; --fg:#111a24; --muted:#55636f; --faint:#8494a3;
    --line:#e2e8ee; --line-2:#d3dce4; --card:#fff; --card-2:#f7fafc;
    --primary:#0f7d76; --primary-2:#0b615c; --primary-fg:#fff;
    --warm:#c96a1e; --warm-2:#a9540f;
    --good:#1a7f37; --warn:#9a6700; --bad:#c9372c;
    --shadow:0 1px 2px rgba(16,32,48,.06),0 8px 24px -10px rgba(16,32,48,.14);
    --shadow-lg:0 2px 6px rgba(16,32,48,.06),0 28px 64px -20px rgba(16,32,48,.22);
  }
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--fg);
  font:16px/1.65 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;overflow-x:hidden}
img{max-width:100%;height:auto;display:block}
a{color:var(--primary);text-underline-offset:3px}
:focus-visible{outline:2px solid var(--primary);outline-offset:3px;border-radius:4px}
.wrap{max-width:var(--maxw);margin:0 auto;padding:0 22px}
/* Narrow measure without re-centring: a prose column centred inside an
   already-centred wrapper starts further right than every other section on the
   page, and the mismatched left edge reads as a mistake. Constrain the children
   instead, so everything shares one left rail. */
.wrap.narrow>*{max-width:74ch}
.skip{position:absolute;left:-9999px;top:0;background:var(--primary);color:var(--primary-fg);
  padding:10px 16px;border-radius:0 0 var(--r) 0;z-index:100}
.skip:focus{left:0}
`;

/**
 * Motion.
 *
 * Two rules, both non-negotiable:
 *
 *   1. Everything is visible without JavaScript. Reveal animations start at
 *      full opacity and are *hidden* by a class the script adds, so a crawler,
 *      a reader-mode parser, or a failed script all get the whole page.
 *   2. prefers-reduced-motion turns all of it off. Vestibular disorders are
 *      common, and this is software people open on a bad day.
 */
export const MOTION = `
@keyframes float-in{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
@keyframes fade-in{from{opacity:0}to{opacity:1}}
@keyframes scale-in{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:none}}
@keyframes drift{0%{transform:translate(0,0) scale(1)}
  33%{transform:translate(3%,-4%) scale(1.06)}
  66%{transform:translate(-3%,3%) scale(.97)}
  100%{transform:translate(0,0) scale(1)}}
@keyframes sweep{to{background-position:200% center}}
@keyframes pulse-ring{0%{transform:scale(.85);opacity:.55}
  70%{transform:scale(1.35);opacity:0}100%{opacity:0}}
@keyframes spin-slow{to{transform:rotate(360deg)}}
@keyframes bar-grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}

/* JS adds .js to <html>, which is what arms the reveal. Without it every
   element below stays exactly as authored: visible. */
.js .reveal{opacity:0;transform:translateY(18px)}
.js .reveal.in{animation:float-in .7s var(--ease) forwards}
.js .reveal-1.in{animation-delay:.06s}
.js .reveal-2.in{animation-delay:.12s}
.js .reveal-3.in{animation-delay:.18s}
.js .reveal-4.in{animation-delay:.24s}
.js .reveal-5.in{animation-delay:.3s}

@media(prefers-reduced-motion:reduce){
  html{scroll-behavior:auto}
  .js .reveal{opacity:1!important;transform:none!important;animation:none!important}
  *,*::before,*::after{animation-duration:.001ms!important;animation-iteration-count:1!important;
    transition-duration:.001ms!important}
}
`;
