import { describe, it, expect } from 'vitest';
import { resolveBrand } from './tokens';
import {
  initials, markSvg, lockupSvg, socialCardSvg, faviconDataUri, generateAssets,
} from './assets';

const brand = resolveBrand({ primary: '#0f766e', radius: 8 });
const opts = { brand, name: 'Shelter Valley Health Share' };

describe('the monogram', () => {
  it('takes two letters from the significant words', () => {
    // Four letters in a 32px square is a grey smudge.
    expect(initials('Shelter Valley Health Share')).toBe('SV');
    expect(initials('Cedar Ridge Sharing Ministry')).toBe('CR');
  });

  it('skips the words every ministry in the category shares', () => {
    // "TheGoodShepherd" reading as "TG" is worse than "GS".
    expect(initials('The Good Shepherd')).toBe('GS');
    expect(initials('Ministry of Grace')).toBe('G');
  });

  it('falls back rather than producing nothing', () => {
    // "Health Share Ministry" is a real name made entirely of skip words.
    expect(initials('Health Share Ministry')).toBe('HS');
    expect(initials('')).toBe('M');
  });

  it('gives a one-word ministry one letter', () => {
    // A lopsided pair from a single word looks like a mistake.
    expect(initials('Samaritan')).toBe('S');
  });
});

describe('the generated marks', () => {
  it('use the resolved palette, not a raw colour', () => {
    // The whole argument for generating these is that they cannot disagree with
    // the site. A raw hex here would be a second source of truth.
    const svg = markSvg(opts);
    expect(svg).toContain(brand.palette.primary);
    expect(svg).toContain(brand.palette.onPrimary);
  });

  it('are legible by construction', () => {
    // onPrimary is derived to clear contrast against primary, so a ministry
    // cannot produce a mark whose letters are invisible.
    const pale = resolveBrand({ primary: '#fef9c3' });
    expect(markSvg({ brand: pale, name: 'Pale Ministry' })).toContain(pale.palette.onPrimary);
    expect(pale.palette.onPrimary).toBe('#000000');
  });

  it('follow the ministry’s corner radius at every size', () => {
    // A ministry that chose square corners should get a square mark; one that
    // chose pills should get a circle. That single number is most of what makes
    // two ministries' marks look like different organizations.
    const square = markSvg({ brand: resolveBrand({ primary: '#0f766e', radius: 0 }), name: 'A B' });
    const round = markSvg({ brand: resolveBrand({ primary: '#0f766e', radius: 24 }), name: 'A B' });
    expect(square).toContain('rx="0"');
    expect(round).not.toContain('rx="0"');
  });

  it('escape a name that would break the XML', () => {
    const svg = markSvg({ brand, name: 'Smith & Sons <Ministry>' });
    expect(svg).toContain('&amp;');
    expect(svg).not.toMatch(/aria-label="[^"]*<Ministry>/);
  });

  it('give the lockup a viewBox wide enough for its text', () => {
    // A viewBox that does not fit its text looks right in a browser, which
    // scales it, and clips in everything that does not.
    const long = lockupSvg({ brand, name: 'A Very Long Ministry Name Indeed Here' });
    const width = Number(long.match(/viewBox="0 0 (\d+)/)![1]);
    expect(width).toBeGreaterThan(37 * 15);
  });
});

describe('the social card', () => {
  it('is the size every platform crops to', () => {
    expect(socialCardSvg(opts)).toContain('viewBox="0 0 1200 630"');
  });

  it('says the thing a visitor most needs to know', () => {
    // The disclaimer belongs on the image too. A link preview is often the only
    // thing somebody reads before deciding what this is.
    expect(socialCardSvg(opts)).toContain('Not insurance');
  });

  it('truncates a tagline rather than overflowing it', () => {
    // An overflowing line is invisible until somebody shares the link, at which
    // point it is on Facebook.
    const svg = socialCardSvg({ ...opts, tagline: 'x'.repeat(300) });
    expect(svg).not.toContain('x'.repeat(100));
  });
});

describe('the favicon', () => {
  it('is a data URI that needs no route', () => {
    const uri = faviconDataUri(opts);
    expect(uri.startsWith('data:image/svg+xml,')).toBe(true);
    // Unencoded '#' terminates a data URI at the fragment, which silently
    // truncates every colour in the file.
    expect(uri).not.toContain('#');
  });
});

describe('the asset set', () => {
  const assets = generateAssets(opts);

  it('covers what a ministry gets asked for in its first fortnight', () => {
    expect(assets.map((a) => a.key)).toEqual(['mark', 'lockup', 'favicon', 'social', 'email']);
  });

  it('states the SVG limitation where it actually bites', () => {
    // Facebook and most email clients will not render an SVG. Saying so at the
    // download rather than in documentation is the difference between a
    // ministry succeeding and a ministry filing a bug.
    expect(assets.find((a) => a.key === 'social')!.caveat).toMatch(/PNG/);
    expect(assets.find((a) => a.key === 'email')!.caveat).toMatch(/PNG/);
    // The ones that work fine as SVG must not carry a warning nobody needs.
    expect(assets.find((a) => a.key === 'mark')!.caveat).toBeUndefined();
  });

  it('names files after the ministry, not after the tool', () => {
    expect(assets[0].filename).toBe('shelter-valley-health-share-mark.svg');
  });

  it('produces parseable XML for every asset', () => {
    for (const asset of assets) {
      expect(asset.svg.startsWith('<svg xmlns='), asset.key).toBe(true);
      // An unescaped bare & is the one thing that makes an SVG fail to parse.
      expect(/&(?!amp;|lt;|gt;|quot;|apos;|#)/.test(asset.svg), asset.key).toBe(false);
    }
  });
});
