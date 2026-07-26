import type { ResolvedBrand } from './tokens';

/**
 * Brand assets, generated.
 *
 * A ministry that has picked a colour and a typeface has already specified
 * everything an identity needs. What it does not have is the six files somebody
 * will ask it for in the first fortnight: a favicon, a square avatar for a
 * social account, a wide image for when a link is shared, a header for the
 * emails it sends, and a logo it can put on a letter. Most ministries answer
 * those by asking a volunteer with Canva, and the results do not match the site
 * they just built.
 *
 * So these are derived from the same `ResolvedBrand` the site and the app run
 * on. Not a separate design — the same palette, the same radius, the same
 * typeface. That is the whole argument for generating them rather than offering
 * an upload: an uploaded logo is a second source of truth that drifts the first
 * time somebody changes the colour.
 *
 * **Everything here is SVG.** It is text, so it costs nothing to store and
 * nothing to serve, it is sharp at every size including a 16px favicon and a
 * 3x retina header, and it is a format a ministry can hand to a printer. The
 * one place SVG is not enough is a social preview image — Facebook, LinkedIn,
 * and iMessage will not render one — and rather than pretend otherwise, that is
 * stated plainly at the point of download. Rasterizing needs a renderer this
 * Worker does not have.
 *
 * Pure. Strings in, strings out — no DOM, no canvas, no network.
 */

/** SVG is XML: five characters have to be escaped or the file will not parse. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * The letters inside the mark.
 *
 * Up to two, from the first two significant words. "Shelter Valley Health
 * Share" becomes SV rather than SVHS — four letters in a 32px square is a grey
 * smudge — and one-word ministries get a single letter rather than a lopsided
 * pair. Words like "of" and "the" are skipped because "TheGoodShepherd" reading
 * as "TG" is worse than "GS".
 */
export function initials(name: string): string {
  const skip = new Set(['the', 'of', 'a', 'an', 'and', 'for', 'health', 'share', 'sharing', 'ministry', 'ministries']);
  const words = name
    .split(/[\s—–-]+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);

  const significant = words.filter((w) => !skip.has(w.toLowerCase()));
  // Everything was a skip word — "Health Share Ministry" is a real name.
  const source = significant.length ? significant : words;

  return source.slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || 'M';
}

export interface AssetOptions {
  brand: ResolvedBrand;
  name: string;
  /** Overrides the derived initials. A ministry that wants one letter gets one. */
  monogram?: string;
}

/**
 * The mark: initials in a rounded square of the brand colour.
 *
 * Deliberately not a symbol. A generated symbol — a cross, a heart, clasped
 * hands — is a claim about what a ministry is that we are not in a position to
 * make, and the generic ones are worse than a monogram at every size. A
 * monogram is honest about being a placeholder while still looking deliberate.
 *
 * The corner radius is the ministry's own `--brand-radius`, scaled: a ministry
 * that chose square corners gets a square mark, and one that chose pills gets a
 * circle. That single number is most of what makes two ministries' marks look
 * like different organizations.
 */
export function markSvg({ brand, name, monogram }: AssetOptions, size = 512): string {
  const text = monogram?.trim() || initials(name);
  const p = brand.palette;
  // The radius is authored against a 512 canvas and scaled, so a 16px favicon
  // and a 512px avatar have the same silhouette rather than the same absolute
  // corner — which at 16px would be imperceptible and at 512px a hairline.
  const r = Math.round((p.radius / 8) * 96 * (size / 512));
  const fontSize = text.length > 1 ? size * 0.4 : size * 0.52;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${esc(name)}">
  <rect width="${size}" height="${size}" rx="${r}" fill="${p.primary}"/>
  <text x="50%" y="50%" dy="0.35em" text-anchor="middle" fill="${p.onPrimary}"
        font-family="${esc(p.font)}" font-size="${fontSize}" font-weight="700"
        letter-spacing="${size * -0.01}">${esc(text)}</text>
</svg>`;
}

/** The mark plus the ministry's name, for a letterhead or an email signature. */
export function lockupSvg({ brand, name, monogram }: AssetOptions): string {
  const text = monogram?.trim() || initials(name);
  const p = brand.palette;
  const markSize = 64;
  const r = Math.round((p.radius / 8) * 12);
  // Sized from the name's length rather than fixed, because a viewBox that does
  // not fit its text is the one SVG bug that survives every export: it looks
  // right in a browser, which scales, and clips in everything that does not.
  const width = markSize + 20 + Math.ceil(name.length * 15.5);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${markSize}" width="${width}" height="${markSize}" role="img" aria-label="${esc(name)}">
  <rect width="${markSize}" height="${markSize}" rx="${r}" fill="${p.primary}"/>
  <text x="${markSize / 2}" y="50%" dy="0.35em" text-anchor="middle" fill="${p.onPrimary}"
        font-family="${esc(p.font)}" font-size="${text.length > 1 ? 26 : 34}" font-weight="700">${esc(text)}</text>
  <text x="${markSize + 20}" y="50%" dy="0.35em" fill="${p.onSurface}"
        font-family="${esc(p.font)}" font-size="27" font-weight="650">${esc(name)}</text>
</svg>`;
}

/**
 * The favicon, as a data URI.
 *
 * A data URI rather than a file because it needs no route, no cache header, and
 * no round trip — and because the alternative on a custom domain is a request
 * for `/favicon.ico` arriving before anything else has resolved.
 *
 * Rendered at 64 so the monogram has room, then displayed at 16. SVG favicons
 * are supported everywhere that matters; browsers that are not simply show
 * nothing, which is what they showed before.
 */
export function faviconDataUri(options: AssetOptions): string {
  return `data:image/svg+xml,${encodeURIComponent(markSvg(options, 64))}`;
}

/**
 * The image shown when somebody shares a link to the ministry.
 *
 * 1200×630, the size every platform crops to. It carries the ministry's name
 * and one line, on the brand colour — not a photograph, because a stock
 * photograph of a smiling family is the visual cliché this entire category is
 * judged by, and a ministry that looks like a stock photograph looks like the
 * ones in the lawsuits.
 *
 * **The tagline is truncated rather than wrapped.** A wrapped line that
 * overflows 630px is invisible until somebody shares the link, at which point
 * it is on Facebook.
 */
export function socialCardSvg(options: AssetOptions & { tagline?: string }): string {
  const { brand, name, tagline } = options;
  const p = brand.palette;
  const text = options.monogram?.trim() || initials(name);
  const line = (tagline ?? 'A health care sharing ministry').slice(0, 78);
  const titleSize = name.length > 26 ? 62 : 82;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630" role="img" aria-label="${esc(name)}">
  <rect width="1200" height="630" fill="${p.primary}"/>
  <rect x="0" y="574" width="1200" height="56" fill="${p.accent}"/>
  <rect x="88" y="80" width="104" height="104" rx="${Math.round((p.radius / 8) * 20)}"
        fill="${p.onPrimary}" opacity="0.15"/>
  <text x="140" y="132" dy="0.35em" text-anchor="middle" fill="${p.onPrimary}"
        font-family="${esc(p.font)}" font-size="${text.length > 1 ? 42 : 54}" font-weight="700">${esc(text)}</text>
  <text x="88" y="330" fill="${p.onPrimary}" font-family="${esc(p.font)}"
        font-size="${titleSize}" font-weight="700">${esc(name)}</text>
  <text x="88" y="404" fill="${p.onPrimary}" font-family="${esc(p.font)}"
        font-size="34" opacity="0.85">${esc(line)}</text>
  <text x="88" y="516" fill="${p.onPrimary}" font-family="${esc(p.font)}"
        font-size="26" opacity="0.7">Not insurance. Sharing is not guaranteed.</text>
</svg>`;
}

/**
 * A banner for the top of the ministry's own emails.
 *
 * 1200×200 so it survives a retina display at 600px, which is the width every
 * email client lays out to.
 *
 * This exists because of one specific thing: the invitation to the member
 * portal is sent by the ministry from its own address, and a household that has
 * never heard of Auxilium will treat an unbranded message about their medical
 * bills as phishing — which is the correct instinct. A banner that matches the
 * ministry's website is the cheapest thing that makes it not look like one.
 */
export function emailHeaderSvg({ brand, name, monogram }: AssetOptions): string {
  const p = brand.palette;
  const text = monogram?.trim() || initials(name);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 200" width="1200" height="200" role="img" aria-label="${esc(name)}">
  <rect width="1200" height="200" fill="${p.primary}"/>
  <rect x="56" y="60" width="80" height="80" rx="${Math.round((p.radius / 8) * 15)}"
        fill="${p.onPrimary}" opacity="0.15"/>
  <text x="96" y="100" dy="0.35em" text-anchor="middle" fill="${p.onPrimary}"
        font-family="${esc(p.font)}" font-size="${text.length > 1 ? 34 : 44}" font-weight="700">${esc(text)}</text>
  <text x="168" y="100" dy="0.35em" fill="${p.onPrimary}" font-family="${esc(p.font)}"
        font-size="44" font-weight="650">${esc(name)}</text>
</svg>`;
}

export interface GeneratedAsset {
  key: string;
  label: string;
  filename: string;
  svg: string;
  /** What it is for, in the words of the person who will be asked for it. */
  note: string;
  /** Stated where it matters, not buried in documentation. */
  caveat?: string;
}

/** Everything, ready to preview and download. */
export function generateAssets(options: AssetOptions & { tagline?: string }): GeneratedAsset[] {
  const slug = options.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'ministry';

  return [
    {
      key: 'mark',
      label: 'Square mark',
      filename: `${slug}-mark.svg`,
      svg: markSvg(options),
      note: 'Profile pictures, app icons, anywhere square.',
    },
    {
      key: 'lockup',
      label: 'Logo with name',
      filename: `${slug}-logo.svg`,
      svg: lockupSvg(options),
      note: 'Letterhead, documents, an email signature.',
    },
    {
      key: 'favicon',
      label: 'Favicon',
      filename: `${slug}-favicon.svg`,
      svg: markSvg(options, 64),
      note: 'The little icon in a browser tab. Already applied to your site.',
    },
    {
      key: 'social',
      label: 'Link preview',
      filename: `${slug}-social.svg`,
      svg: socialCardSvg(options),
      note: 'The image shown when somebody shares a link to you.',
      caveat:
        'Facebook and LinkedIn will not display an SVG. Convert this one to PNG before ' +
        'uploading it anywhere — any design tool will export it.',
    },
    {
      key: 'email',
      label: 'Email header',
      filename: `${slug}-email-header.svg`,
      svg: emailHeaderSvg(options),
      note:
        'The top of emails you send members. Worth using on portal invitations — a household ' +
        'that has never heard of us treats an unbranded email about medical bills as phishing.',
      caveat: 'Most email clients will not render an SVG either. Export this to PNG too.',
    },
  ];
}
