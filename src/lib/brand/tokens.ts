/**
 * The brand system.
 *
 * A ministry picks a colour and a typeface once, and every surface follows —
 * the staff app, the member portal, the public application form, its own site,
 * the invitation a household opens. One source of truth rather than a settings
 * page per surface, because the version where a ministry has to restyle five
 * things is the version where four of them stay wrong.
 *
 * The hard part is not storing a hex code. It is that **a ministry can pick a
 * colour that makes its own product unreadable**, and will: pale yellow, or a
 * mid-grey that fails against both white and black. So this module does not
 * take colours and apply them. It takes an intent and derives a palette that is
 * guaranteed legible, then tells the ministry what it had to change and why.
 *
 * Refusing to render unreadable text is not a limitation on their brand. It is
 * the difference between a design system and a colour picker.
 *
 * Pure. Colour maths only — no DOM, no database, no clock.
 */

export interface BrandIntent {
  /** The ministry's primary colour, as they think of it. Hex. */
  primary: string;
  /** Optional accent for secondary actions. Derived from primary when absent. */
  accent?: string;
  /** Page background. Derived when absent. */
  surface?: string;
  /** Typeface family for headings and body. */
  font?: BrandFont;
  wordmark?: string;
  /** Logo, stored in R2. A wordmark is used when there is none. */
  logo_url?: string;
  /** Rounded corners, in pixels. A real part of how a brand feels. */
  radius?: number;
}

export type BrandFont = 'inter' | 'source-serif' | 'system' | 'literata' | 'ibm-plex';

export const BRAND_FONTS: { value: BrandFont; label: string; stack: string; note: string }[] = [
  {
    value: 'inter',
    label: 'Inter',
    stack: "'Inter', system-ui, -apple-system, sans-serif",
    note: 'Clear and neutral. The safe choice, and the one most software uses.',
  },
  {
    value: 'source-serif',
    label: 'Source Serif',
    stack: "'Source Serif 4', Georgia, serif",
    note: 'Warmer and more traditional. Reads as an institution rather than an app.',
  },
  {
    value: 'literata',
    label: 'Literata',
    stack: "'Literata', Georgia, serif",
    note: 'A reading serif. Good when members will read long explanations.',
  },
  {
    value: 'ibm-plex',
    label: 'IBM Plex Sans',
    stack: "'IBM Plex Sans', system-ui, sans-serif",
    note: 'Plain and slightly technical. Suits a ministry that wants to look precise.',
  },
  {
    value: 'system',
    label: 'System default',
    stack: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    note: 'Whatever the reader’s device uses. Loads instantly and never blocks a page.',
  },
];

// ── Colour ───────────────────────────────────────────────────────────────────

export interface Rgb { r: number; g: number; b: number }

export function parseHex(hex: string): Rgb | null {
  const clean = hex.trim().replace(/^#/, '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

export function toHex({ r, g, b }: Rgb): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[r, g, b].map((n) => clamp(n).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Relative luminance, per WCAG 2.
 *
 * The gamma-expansion step is not decorative: doing this on raw channel values
 * makes mid-tones look far lighter than they are, which is exactly where a
 * contrast check has to be right.
 */
export function luminance({ r, g, b }: Rgb): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio, 1 to 21. */
export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG AA for body text. Anything below this is not a style choice. */
export const AA_TEXT = 4.5;
/** AA for large text and interface elements. */
export const AA_LARGE = 3;

function mix(a: Rgb, b: Rgb, amount: number): Rgb {
  return {
    r: a.r + (b.r - a.r) * amount,
    g: a.g + (b.g - a.g) * amount,
    b: a.b + (b.b - a.b) * amount,
  };
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const BLACK: Rgb = { r: 0, g: 0, b: 0 };

/**
 * Darken or lighten until a colour is legible against a background.
 *
 * Walks toward black or white in small steps rather than jumping, so the result
 * is the *closest* legible version of what the ministry chose. A ministry whose
 * brand is a bright teal should get a slightly deeper teal, not navy.
 */
export function ensureContrast(colour: Rgb, against: Rgb, target: number): Rgb {
  // Every check is against the *rounded* colour, because that is the one that
  // ships. Checking in float space and rounding afterwards lets a value that
  // passed at 3.0001 round down to 2.99 — passing the test and failing the
  // user, which is the worst of both.
  const quantize = (c: Rgb): Rgb => parseHex(toHex(c))!;

  const start = quantize(colour);
  if (contrast(start, against) >= target) return start;

  // Move away from the background: darken on light, lighten on dark.
  const toward = luminance(against) > 0.5 ? BLACK : WHITE;

  for (let step = 0.02; step < 1; step += 0.02) {
    const candidate = quantize(mix(colour, toward, step));
    if (contrast(candidate, against) >= target) return candidate;
  }

  // Exhausted. Return the endpoint itself rather than the last step short of
  // it: floating-point accumulation leaves the final mix a fraction under, and
  // a function that promises legibility must not return "very nearly legible".
  // If pure black or white still fails, the background is the problem and
  // nothing this function returns can fix it.
  return toward;
}

/** Whichever of black or white is actually readable on this colour. */
export function readableOn(colour: Rgb): Rgb {
  return contrast(colour, WHITE) >= contrast(colour, BLACK) ? WHITE : BLACK;
}

// ── The derived palette ──────────────────────────────────────────────────────

export interface BrandPalette {
  primary: string;
  /** Text or icon placed on top of `primary`. Always legible. */
  onPrimary: string;
  /** A tinted background — the brand at low strength, for panels and chips. */
  primarySoft: string;
  accent: string;
  onAccent: string;
  surface: string;
  /** Body text on `surface`. */
  onSurface: string;
  /** Secondary text. Still meets AA. */
  onSurfaceMuted: string;
  border: string;
  font: string;
  radius: number;
}

export interface BrandAdjustment {
  token: string;
  /** What the ministry asked for. */
  requested: string;
  /** What was actually used. */
  applied: string;
  reason: string;
}

export interface ResolvedBrand {
  palette: BrandPalette;
  /**
   * Every change made to keep things readable, in plain words.
   *
   * Shown to the ministry rather than applied silently. Somebody who picks a
   * colour and gets a different one back deserves to know it happened and why —
   * and a system that quietly overrides your brand feels broken, while one that
   * explains itself feels careful.
   */
  adjustments: BrandAdjustment[];
  /** True when nothing had to be changed. */
  clean: boolean;
}

export const DEFAULT_BRAND: BrandIntent = {
  primary: '#0f766e',
  font: 'inter',
  radius: 8,
};

/**
 * Turn what a ministry asked for into a palette that works.
 *
 * Nothing here fails. An unparseable colour falls back to the default rather
 * than erroring, because the alternative is a ministry locking itself out of
 * its own branding by pasting something odd — and a brand editor that can break
 * the app is worse than one that is occasionally opinionated.
 */
export function resolveBrand(intent: Partial<BrandIntent> = {}): ResolvedBrand {
  const adjustments: BrandAdjustment[] = [];

  const requestedPrimary = intent.primary ?? DEFAULT_BRAND.primary;
  let primary = parseHex(requestedPrimary);
  if (!primary) {
    primary = parseHex(DEFAULT_BRAND.primary)!;
    adjustments.push({
      token: 'primary',
      requested: requestedPrimary,
      applied: DEFAULT_BRAND.primary,
      reason: 'That did not look like a colour, so we kept the default.',
    });
  }

  const surface = parseHex(intent.surface ?? '#ffffff') ?? WHITE;

  // The brand colour as *text* has to clear AA against the page, which is a
  // much harder bar than as a background. A ministry with a bright brand keeps
  // it on buttons and gets a deeper version for links.
  const primaryOnSurface = ensureContrast(primary, surface, AA_TEXT);
  if (toHex(primaryOnSurface) !== toHex(primary)) {
    adjustments.push({
      token: 'primary',
      requested: toHex(primary),
      applied: toHex(primaryOnSurface),
      reason:
        'Your colour was not readable enough as text on the page, so links and labels use a ' +
        'slightly deeper version. Buttons still use the colour you chose.',
    });
  }

  const accentRequested = intent.accent ? parseHex(intent.accent) : null;
  // No accent given: a shifted version of the primary rather than a second
  // arbitrary colour. Two unrelated colours from a ministry with no designer is
  // how a brand ends up looking accidental.
  const accent = accentRequested ?? mix(primary, readableOn(primary), 0.25);
  const accentSafe = ensureContrast(accent, surface, AA_LARGE);

  const onSurface = ensureContrast({ r: 23, g: 23, b: 23 }, surface, AA_TEXT);

  // Secondary text is where accessibility quietly fails in most products. It is
  // held to the same bar as body text on purpose: "less important" is not the
  // same as "optional to read".
  //
  // No adjustment is reported for this. It is our derivation being kept legible,
  // not the ministry's choice being overridden — and a list of "changes" full of
  // things nobody asked for is a list nobody reads, which would bury the one
  // entry that actually matters.
  const muted = ensureContrast(mix(onSurface, surface, 0.45), surface, AA_TEXT);

  const font = BRAND_FONTS.find((f) => f.value === (intent.font ?? 'inter')) ?? BRAND_FONTS[0];

  return {
    palette: {
      primary: toHex(primaryOnSurface),
      onPrimary: toHex(readableOn(primary)),
      primarySoft: toHex(mix(primary, surface, 0.88)),
      accent: toHex(accentSafe),
      onAccent: toHex(readableOn(accentSafe)),
      surface: toHex(surface),
      onSurface: toHex(onSurface),
      onSurfaceMuted: toHex(muted),
      border: toHex(mix(onSurface, surface, 0.85)),
      font: font.stack,
      // Clamped rather than validated away. A ministry that types 400 gets
      // pills, not a broken layout.
      radius: Math.max(0, Math.min(24, intent.radius ?? DEFAULT_BRAND.radius!)),
    },
    adjustments,
    clean: adjustments.length === 0,
  };
}

/**
 * The palette as CSS custom properties.
 *
 * Emitted as a string rather than a style object so the same function serves
 * the React app and the server-rendered ministry site. Two implementations of
 * "what colour is this ministry" would drift, and the drift would be visible to
 * a member moving between the portal and the public site.
 */
export function brandCss(brand: ResolvedBrand, selector = ':root'): string {
  const p = brand.palette;
  return `${selector}{--brand-primary:${p.primary};--brand-on-primary:${p.onPrimary};` +
    `--brand-primary-soft:${p.primarySoft};--brand-accent:${p.accent};--brand-on-accent:${p.onAccent};` +
    `--brand-surface:${p.surface};--brand-on-surface:${p.onSurface};--brand-muted:${p.onSurfaceMuted};` +
    `--brand-border:${p.border};--brand-font:${p.font};--brand-radius:${p.radius}px}`;
}
