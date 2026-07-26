import { describe, it, expect } from 'vitest';
import {
  resolveBrand, contrast, parseHex, toHex, luminance, ensureContrast, readableOn,
  brandCss, AA_TEXT, AA_LARGE, DEFAULT_BRAND, BRAND_FONTS,
} from './tokens';

/**
 * The promise this module makes is narrow and absolute: whatever a ministry
 * picks, the result is readable. These tests are that promise.
 */

const hex = (h: string) => parseHex(h)!;

describe('colour maths', () => {
  it('parses both hex forms', () => {
    expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHex('0f766e')).toEqual({ r: 15, g: 118, b: 110 });
    expect(parseHex('nope')).toBeNull();
    expect(parseHex('#12345')).toBeNull();
  });

  it('round-trips', () => {
    expect(toHex(hex('#0f766e'))).toBe('#0f766e');
  });

  it('gamma-expands before weighting', () => {
    // Done on raw channels, mid-grey reads far lighter than it is — which is
    // exactly where a contrast check has to be right.
    const naive = (128 * 0.2126 + 128 * 0.7152 + 128 * 0.0722) / 255;
    expect(luminance(hex('#808080'))).toBeLessThan(naive - 0.2);
  });

  it('agrees with the known WCAG extremes', () => {
    expect(contrast(hex('#000'), hex('#fff'))).toBeCloseTo(21, 1);
    expect(contrast(hex('#fff'), hex('#fff'))).toBeCloseTo(1, 5);
  });
});

describe('keeping things readable', () => {
  it('leaves an already-legible colour alone', () => {
    const dark = hex('#0f766e');
    expect(toHex(ensureContrast(dark, hex('#fff'), AA_TEXT))).toBe('#0f766e');
  });

  it('darkens a pale colour on white until it passes', () => {
    const pale = hex('#ffe14d');
    const fixed = ensureContrast(pale, hex('#fff'), AA_TEXT);
    expect(contrast(fixed, hex('#fff'))).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('lightens rather than darkens on a dark background', () => {
    const fixed = ensureContrast(hex('#333'), hex('#111'), AA_TEXT);
    expect(luminance(fixed)).toBeGreaterThan(luminance(hex('#333')));
    expect(contrast(fixed, hex('#111'))).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('stays close to what was asked for', () => {
    // A bright teal should become a deeper teal, not navy. Walking in small
    // steps is what keeps a ministry's brand recognisably theirs.
    const asked = hex('#14b8a6');
    const got = ensureContrast(asked, hex('#fff'), AA_TEXT);
    expect(got.g).toBeGreaterThan(got.r);   // still green-dominant
    expect(got.b).toBeGreaterThan(got.r);   // still teal, not olive
  });

  it('picks whichever of black or white actually reads', () => {
    expect(toHex(readableOn(hex('#0f766e')))).toBe('#ffffff');
    expect(toHex(readableOn(hex('#ffe14d')))).toBe('#000000');
  });
});

describe('resolving a ministry brand', () => {
  it('accepts a sensible brand without changing anything', () => {
    const b = resolveBrand({ primary: '#0f766e' });
    expect(b.clean).toBe(true);
    expect(b.adjustments).toEqual([]);
  });

  it('never produces unreadable body text, whatever is chosen', () => {
    // The whole promise, over the colours a ministry actually picks — including
    // the ones that would make the product unusable.
    for (const colour of ['#ffe14d', '#ffffff', '#e5e5e5', '#00ff00', '#000000', '#7c3aed', '#f43f5e']) {
      const { palette } = resolveBrand({ primary: colour });
      const surface = hex(palette.surface);

      expect(contrast(hex(palette.primary), surface), `${colour} primary as text`)
        .toBeGreaterThanOrEqual(AA_TEXT);
      expect(contrast(hex(palette.onSurface), surface), `${colour} body text`)
        .toBeGreaterThanOrEqual(AA_TEXT);
      // Secondary text is held to the same bar. "Less important" is not the
      // same as "optional to read", and this is where accessibility quietly
      // fails in most products.
      expect(contrast(hex(palette.onSurfaceMuted), surface), `${colour} muted text`)
        .toBeGreaterThanOrEqual(AA_TEXT);
      expect(contrast(hex(palette.accent), surface), `${colour} accent`)
        .toBeGreaterThanOrEqual(AA_LARGE);
    }
  });

  it('always puts a legible colour on the brand colour itself', () => {
    for (const colour of ['#ffe14d', '#0f172a', '#0f766e', '#ffffff']) {
      const { palette } = resolveBrand({ primary: colour });
      expect(contrast(hex(palette.onPrimary), hex(colour)), `on ${colour}`)
        .toBeGreaterThanOrEqual(AA_LARGE);
    }
  });

  it('explains every change rather than making it silently', () => {
    // A system that quietly overrides your brand feels broken; one that says
    // what it did and why feels careful.
    const b = resolveBrand({ primary: '#ffe14d' });
    expect(b.clean).toBe(false);
    for (const a of b.adjustments) {
      expect(a.reason.length).toBeGreaterThan(25);
      expect(a.requested).not.toBe(a.applied);
    }
  });

  it('falls back rather than failing on nonsense', () => {
    // A brand editor that can break the app is worse than one that is
    // occasionally opinionated.
    const b = resolveBrand({ primary: 'octarine' });
    expect(b.palette.primary).toBeTruthy();
    expect(b.adjustments[0].reason).toMatch(/did not look like a colour/i);
  });

  it('derives an accent instead of inventing a second colour', () => {
    // Two unrelated colours from a ministry with no designer is how a brand
    // ends up looking accidental.
    const { palette } = resolveBrand({ primary: '#0f766e' });
    const accent = hex(palette.accent);
    expect(accent.g).toBeGreaterThan(accent.r);
  });

  it('clamps a silly radius instead of breaking the layout', () => {
    expect(resolveBrand({ radius: 400 }).palette.radius).toBe(24);
    expect(resolveBrand({ radius: -8 }).palette.radius).toBe(0);
  });

  it('handles an empty brand', () => {
    const b = resolveBrand();
    expect(b.clean).toBe(true);
    expect(b.palette.primary).toBe(DEFAULT_BRAND.primary);
  });
});

describe('emitting CSS', () => {
  it('produces custom properties for every token', () => {
    const css = brandCss(resolveBrand({ primary: '#0f766e' }));
    for (const token of ['--brand-primary', '--brand-on-primary', '--brand-surface',
                         '--brand-muted', '--brand-border', '--brand-font', '--brand-radius']) {
      expect(css).toContain(token);
    }
  });

  it('scopes to whatever selector is asked for', () => {
    expect(brandCss(resolveBrand(), '.ministry')).toMatch(/^\.ministry\{/);
  });

  it('never emits a font stack that ends in nothing', () => {
    // A stack with no generic family renders in whatever the browser defaults
    // to, which on a member's phone is often not what anyone chose.
    for (const font of BRAND_FONTS) {
      expect(font.stack, font.label).toMatch(/(sans-serif|serif|system-ui)\s*$/);
    }
  });
});
