import type { MarketingPage } from './types';
import { CORE_PAGES } from './pages';
import { MORE_PAGES } from './pages-more';
import { GUIDES } from './guides';
import { COMPARISONS } from './comparisons';

/**
 * The single registry every public surface reads.
 *
 * The renderer, the sitemap, llms.txt, and the guide index all derive from
 * this one array. That is deliberate: a sitemap maintained by hand goes stale
 * within a month, and a page nothing links to may as well not exist.
 */

/** The guides index — generated, so it can never omit a guide. */
const guidesIndex: MarketingPage = {
  slug: 'guides',
  kind: 'landing',
  title: 'Guides — Auxilium',
  h1: 'Guides for running a health care sharing ministry',
  description:
    'Practical guidance on running a health care sharing ministry: share ratios, claims that ' +
    'stall, roster migration, and explainable scoring.',
  priority: 0.6,
  updated: '2026-07-25',
  blocks: [
    {
      type: 'prose',
      paragraphs: [
        'Written to be useful whether or not you ever use Auxilium. Most of what is in here is ' +
        'process advice that costs nothing to adopt.',
      ],
    },
  ],
  related: GUIDES.map((g) => g.slug),
};

export const ALL_PAGES: MarketingPage[] = [
  ...CORE_PAGES,
  ...MORE_PAGES,
  guidesIndex,
  ...GUIDES,
  ...COMPARISONS,
];

export function pageBySlug(slug: string): MarketingPage | undefined {
  const normalized = slug.replace(/^\/+|\/+$/g, '');
  return ALL_PAGES.find((p) => p.slug === normalized);
}

export function guides(): MarketingPage[] {
  return ALL_PAGES.filter((p) => p.kind === 'guide');
}

export function comparisons(): MarketingPage[] {
  return ALL_PAGES.filter((p) => p.kind === 'comparison');
}

/** Absolute path for a slug. '' → '/'. */
export function pathFor(slug: string): string {
  return slug === '' ? '/' : `/${slug}`;
}

/**
 * Every internal link in the content, for link-integrity testing.
 * Application links (/app/...) are excluded — they are served by the SPA and
 * are not part of the marketing route table.
 */
export function internalLinks(page: MarketingPage): string[] {
  const links: string[] = [];

  for (const block of page.blocks) {
    if (block.type === 'hero' || block.type === 'cta' || block.type === 'split') {
      if (block.cta) links.push(block.cta.href);
      if ('secondaryCta' in block && block.secondaryCta) links.push(block.secondaryCta.href);
    }
    // Pricing tiers each carry their own call to action, and a dead link on the
    // pricing page is the most expensive dead link on the site.
    if (block.type === 'pricing') {
      for (const tier of block.tiers) links.push(tier.cta.href);
    }
  }

  for (const slug of page.related ?? []) {
    links.push(pathFor(slug));
  }

  return links.filter((href) => href.startsWith('/') && !href.startsWith('/app'));
}

export { guidesIndex };
