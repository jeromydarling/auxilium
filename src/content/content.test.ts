import { describe, it, expect } from 'vitest';
import { ALL_PAGES, pageBySlug, pathFor, guides, comparisons, internalLinks } from './registry';
import { marketingMeta, structuredData, SITE } from './meta';
import { ACA_MLR_INDIVIDUAL_BPS, ACA_MLR_LARGE_GROUP_BPS } from '../lib/integrity/types';
import { formatBps } from '../lib/integrity/mlr';

/**
 * Content integrity tests.
 *
 * Marketing copy rots differently from code: nothing crashes when a page makes
 * a claim the product no longer supports, or links somewhere that stopped
 * existing. These tests are the only thing that notices.
 *
 * The most important group is the last one. It pins prose to the constants the
 * scoring engine actually uses, so a benchmark change cannot leave the website
 * asserting something the software contradicts.
 */

const ORIGIN = 'https://auxilium.example';

describe('the registry is coherent', () => {
  it('has unique slugs', () => {
    const slugs = ALL_PAGES.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('has exactly one home page', () => {
    expect(ALL_PAGES.filter((p) => p.slug === '')).toHaveLength(1);
  });

  it('uses clean slugs with no leading or trailing slashes', () => {
    for (const page of ALL_PAGES) {
      expect(page.slug).not.toMatch(/^\/|\/$/);
      expect(page.slug).toMatch(/^$|^[a-z0-9-]+(\/[a-z0-9-]+)?$/);
    }
  });

  it('resolves a page by slug with or without slashes', () => {
    expect(pageBySlug('claims-integrity')?.h1).toBeTruthy();
    expect(pageBySlug('/claims-integrity/')?.slug).toBe('claims-integrity');
    expect(pageBySlug('does-not-exist')).toBeUndefined();
  });

  it('maps the home slug to /', () => {
    expect(pathFor('')).toBe('/');
    expect(pathFor('guides')).toBe('/guides');
  });
});

describe('every page carries what it needs to be found', () => {
  it('has a title, an h1, and a description', () => {
    for (const page of ALL_PAGES) {
      expect(page.title.length).toBeGreaterThan(10);
      expect(page.h1.length).toBeGreaterThan(10);
      expect(page.description.length).toBeGreaterThan(50);
    }
  });

  it('keeps descriptions inside a sensible meta length', () => {
    for (const page of ALL_PAGES) {
      // Search engines truncate well before this; overlong ones are a smell.
      expect(page.description.length).toBeLessThan(320);
    }
  });

  it('brands the title without repeating it in the h1', () => {
    for (const page of ALL_PAGES) {
      if (page.slug === '') continue;
      expect(page.title).toContain(SITE.name);
    }
  });

  it('has a valid last-updated date', () => {
    for (const page of ALL_PAGES) {
      expect(page.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(page.updated))).toBe(false);
    }
  });

  it('has a sitemap priority in range', () => {
    for (const page of ALL_PAGES) {
      expect(page.priority).toBeGreaterThan(0);
      expect(page.priority).toBeLessThanOrEqual(1);
    }
  });
});

describe('every internal link resolves', () => {
  it('points only at pages that exist', () => {
    for (const page of ALL_PAGES) {
      for (const href of internalLinks(page)) {
        const slug = href === '/' ? '' : href.slice(1);
        expect(
          pageBySlug(slug),
          `"${page.slug || 'home'}" links to ${href}, which is not a registered page`,
        ).toBeDefined();
      }
    }
  });

  it('sends application links to /app', () => {
    // The SPA is mounted at /app. A CTA pointing at bare /login would 404.
    const appLinks: string[] = [];
    for (const page of ALL_PAGES) {
      for (const block of page.blocks) {
        if (block.type === 'hero' || block.type === 'cta') {
          if (block.cta) appLinks.push(block.cta.href);
          if ('secondaryCta' in block && block.secondaryCta) appLinks.push(block.secondaryCta.href);
        }
      }
    }
    for (const href of appLinks) {
      const isMarketing = pageBySlug(href === '/' ? '' : href.slice(1)) !== undefined;
      if (!isMarketing) {
        expect(href, `"${href}" is neither a marketing page nor an /app link`).toMatch(/^\/app\//);
      }
    }
  });
});

describe('guides earn their place', () => {
  it('has a meaningful number of them', () => {
    expect(guides().length).toBeGreaterThanOrEqual(4);
  });

  it('gives every guide a category so the index can group it', () => {
    for (const guide of guides()) {
      expect(guide.category, `${guide.slug} has no category`).toBeTruthy();
    }
  });

  it('nests every guide under /guides/', () => {
    for (const guide of guides()) {
      expect(guide.slug.startsWith('guides/')).toBe(true);
    }
  });

  it('has real depth rather than a stub', () => {
    for (const guide of guides()) {
      const words = guide.blocks
        .flatMap((b) => (b.type === 'prose' ? b.paragraphs : []))
        .join(' ')
        .split(/\s+/).length;
      expect(words, `${guide.slug} is too thin to be worth publishing`).toBeGreaterThan(300);
    }
  });

  it('is reachable from the guides index', () => {
    const index = pageBySlug('guides')!;
    for (const guide of guides()) {
      expect(index.related).toContain(guide.slug);
    }
  });
});

describe('comparisons stay honest', () => {
  it('admits somewhere that the alternative wins', () => {
    // A comparison table where we win every row is marketing, not a comparison.
    for (const page of comparisons()) {
      const rows = page.blocks.flatMap((b) => (b.type === 'comparison' ? b.rows : []));
      const alternativeWins = rows.filter(
        (r) => r.alternative === 'yes' && r.auxilium !== 'yes',
      );
      expect(
        alternativeWins.length,
        `${page.slug} never concedes a single point to the alternative`,
      ).toBeGreaterThan(0);
    }
  });

  it('compares against software categories, never a named ministry', () => {
    // Ministries are the buyers here. Attack pages about prospective customers
    // would be both strategically self-defeating and unfair.
    const MINISTRY_NAMES = [
      'medi-share', 'medishare', 'samaritan', 'christian healthcare ministries',
      'liberty healthshare', 'solidarity healthshare', 'altrua', 'sedera',
      'aliera', 'sharity', 'medical cost sharing',
    ];
    for (const page of comparisons()) {
      const text = JSON.stringify(page).toLowerCase();
      for (const name of MINISTRY_NAMES) {
        expect(text, `${page.slug} names "${name}"`).not.toContain(name);
      }
    }
  });

  it('never names a ministry anywhere on the site', () => {
    const NAMED = ['aliera', 'sharity', 'medi-share', 'liberty healthshare', 'samaritan ministries'];
    const text = JSON.stringify(ALL_PAGES).toLowerCase();
    for (const name of NAMED) {
      expect(text, `content names "${name}"`).not.toContain(name);
    }
  });
});

describe('factual claims about the category are sourced', () => {
  it('cites a source for every statistic on the home page', () => {
    const home = pageBySlug('')!;
    const stats = home.blocks.flatMap((b) =>
      b.type === 'statRow' ? b.stats : b.type === 'stat' ? [b] : [],
    );
    expect(stats.length).toBeGreaterThan(0);
    for (const stat of stats) {
      expect(stat.source, `stat "${stat.label}" has no source`).toBeDefined();
      expect(stat.source!.url).toMatch(/^https:\/\//);
    }
  });
});

describe('copy cannot drift from the engine', () => {
  // The important one. If someone changes the benchmark in the scoring code,
  // these fail until the website is updated to match.
  const text = JSON.stringify(ALL_PAGES);

  it('quotes the same ACA individual floor the engine scores against', () => {
    expect(formatBps(ACA_MLR_INDIVIDUAL_BPS)).toBe('80.0%');
    expect(text).toContain('80.0%');
  });

  it('quotes the same ACA large-group floor', () => {
    expect(formatBps(ACA_MLR_LARGE_GROUP_BPS)).toBe('85.0%');
    expect(text).toContain('85.0%');
  });

  it('never promises compliance or fraud prevention', () => {
    const lower = text.toLowerCase();
    // Both are claims the product cannot support and that would be actively
    // dangerous for a ministry to rely on.
    expect(lower).not.toContain('guarantees compliance');
    expect(lower).not.toContain('prevents fraud');
    expect(lower).not.toContain('fraud-proof');
    expect(lower).not.toContain('fully compliant');
  });

  it('says plainly what it is not', () => {
    const home = pageBySlug('')!;
    const disclaimers = home.blocks.filter((b) => b.type === 'callout');
    expect(disclaimers.length).toBeGreaterThan(0);
    expect(JSON.stringify(disclaimers).toLowerCase()).toContain('does not');
  });
});

describe('metadata and structured data', () => {
  const home = pageBySlug('')!;
  const guide = guides()[0];

  it('builds a canonical URL per page', () => {
    expect(marketingMeta(home, ORIGIN).canonical).toBe(`${ORIGIN}/`);
    expect(marketingMeta(guide, ORIGIN).canonical).toBe(`${ORIGIN}/${guide.slug}`);
  });

  it('emits Open Graph and Twitter tags on every page', () => {
    for (const page of ALL_PAGES) {
      const keys = marketingMeta(page, ORIGIN).tags.map((t) => t.key);
      for (const required of ['og:title', 'og:description', 'og:url', 'og:type', 'twitter:card']) {
        expect(keys, `${page.slug || 'home'} is missing ${required}`).toContain(required);
      }
    }
  });

  it('marks marketing pages indexable', () => {
    const robots = marketingMeta(home, ORIGIN).tags.find((t) => t.key === 'robots');
    expect(robots?.value).toBe('index, follow');
  });

  it('puts Organization, WebSite, and SoftwareApplication on the home page only', () => {
    const types = structuredData(home, ORIGIN).map((g) => g['@type']);
    expect(types).toContain('Organization');
    expect(types).toContain('WebSite');
    expect(types).toContain('SoftwareApplication');

    expect(structuredData(guide, ORIGIN).map((g) => g['@type'])).not.toContain('Organization');
  });

  it('marks guides as Articles with breadcrumbs', () => {
    const types = structuredData(guide, ORIGIN).map((g) => g['@type']);
    expect(types).toContain('Article');
    expect(types).toContain('BreadcrumbList');
  });

  it('emits FAQPage exactly where there is a FAQ', () => {
    for (const page of ALL_PAGES) {
      const hasFaqBlock = page.blocks.some((b) => b.type === 'faq');
      const hasFaqSchema = structuredData(page, ORIGIN).some((g) => g['@type'] === 'FAQPage');
      expect(hasFaqSchema, `${page.slug || 'home'} FAQ schema mismatch`).toBe(hasFaqBlock);
    }
  });

  it('builds breadcrumbs that walk the full path', () => {
    const crumbs = structuredData(guide, ORIGIN).find((g) => g['@type'] === 'BreadcrumbList');
    const items = crumbs!.itemListElement as { position: number; item: string }[];
    expect(items[0].item).toBe(ORIGIN);
    expect(items[items.length - 1].item).toBe(`${ORIGIN}/${guide.slug}`);
  });
});
