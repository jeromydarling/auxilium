import type { MarketingPage } from './types';
import { pathFor } from './registry';

/**
 * Page metadata — canonical URL, Open Graph, Twitter cards, and JSON-LD.
 *
 * One helper produces all of it from a page, so a new page cannot ship with
 * half its tags missing. Two audiences are being served here and they want
 * slightly different things: search engines want canonical URLs and structured
 * data, and assistants summarizing the category want prose they can quote
 * without garbling.
 */

export const SITE = {
  name: 'Auxilium',
  tagline: 'Health care sharing ministry operations',
  description:
    'Operations software for health care sharing ministries. Prove what share of member ' +
    'contributions reaches medical bills, keep every denial tied to a published guideline, and ' +
    'make sure no member is quietly missed.',
  locale: 'en_US',
} as const;

export interface MetaTag {
  /** Rendered as <meta name=…> or <meta property=…>. */
  attr: 'name' | 'property';
  key: string;
  value: string;
}

export interface PageMeta {
  title: string;
  description: string;
  canonical: string;
  tags: MetaTag[];
}

export function marketingMeta(page: MarketingPage, origin: string): PageMeta {
  const canonical = `${origin}${pathFor(page.slug)}`;
  const image = `${origin}/og.svg`;

  const tags: MetaTag[] = [
    { attr: 'name', key: 'description', value: page.description },
    // Public marketing is indexable. The application itself is not — the SPA
    // shell carries its own noindex.
    { attr: 'name', key: 'robots', value: 'index, follow' },

    { attr: 'property', key: 'og:type', value: page.kind === 'guide' ? 'article' : 'website' },
    { attr: 'property', key: 'og:site_name', value: SITE.name },
    { attr: 'property', key: 'og:title', value: page.title },
    { attr: 'property', key: 'og:description', value: page.description },
    { attr: 'property', key: 'og:url', value: canonical },
    { attr: 'property', key: 'og:locale', value: SITE.locale },
    { attr: 'property', key: 'og:image', value: image },

    { attr: 'name', key: 'twitter:card', value: 'summary_large_image' },
    { attr: 'name', key: 'twitter:title', value: page.title },
    { attr: 'name', key: 'twitter:description', value: page.description },
    { attr: 'name', key: 'twitter:image', value: image },
  ];

  if (page.kind === 'guide') {
    tags.push(
      { attr: 'property', key: 'article:published_time', value: page.updated },
      { attr: 'property', key: 'article:modified_time', value: page.updated },
    );
    if (page.category) {
      tags.push({ attr: 'property', key: 'article:section', value: page.category });
    }
  }

  return { title: page.title, description: page.description, canonical, tags };
}

// ── JSON-LD ──────────────────────────────────────────────────────────────────

type Json = Record<string, unknown>;

/**
 * Structured data for a page. Returns an array because most pages carry
 * several graphs — an Article plus its breadcrumbs plus its FAQ.
 */
export function structuredData(page: MarketingPage, origin: string): Json[] {
  const canonical = `${origin}${pathFor(page.slug)}`;
  const graphs: Json[] = [];

  // Organization and WebSite go on the home page only. Repeating them on every
  // page is noise that search engines discount.
  if (page.slug === '') {
    graphs.push({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: SITE.name,
      url: origin,
      description: SITE.description,
    });

    graphs.push({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SITE.name,
      url: origin,
      description: SITE.description,
    });

    graphs.push({
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: SITE.name,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description: SITE.description,
      url: origin,
      featureList: [
        'Share ratio measurement against the ACA medical loss ratio benchmark',
        'Sharing guideline consistency checking on every denial',
        'Claim turnaround commitments with automatic escalation',
        'Reference-based repricing against Medicare rates',
        'Member needs triage with published, explainable scoring rules',
        'Roster import with validation and duplicate detection',
      ],
    });
  }

  if (page.kind === 'guide') {
    graphs.push({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: page.h1,
      description: page.description,
      datePublished: page.updated,
      dateModified: page.updated,
      articleSection: page.category,
      author: { '@type': 'Organization', name: SITE.name },
      publisher: { '@type': 'Organization', name: SITE.name },
      mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
    });
  }

  // Breadcrumbs for anything below the root.
  if (page.slug !== '') {
    const segments = page.slug.split('/');
    const items = [{ name: 'Home', item: origin }];
    let accumulated = '';
    for (const segment of segments) {
      accumulated = accumulated ? `${accumulated}/${segment}` : segment;
      items.push({ name: humanize(segment), item: `${origin}/${accumulated}` });
    }

    graphs.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: items.map((entry, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: entry.name,
        item: entry.item,
      })),
    });
  }

  // FAQPage wherever the page actually has Q&A.
  const faq = page.blocks.find((b) => b.type === 'faq');
  if (faq && faq.type === 'faq') {
    graphs.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faq.items.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: { '@type': 'Answer', text: item.answer },
      })),
    });
  }

  return graphs;
}

function humanize(segment: string): string {
  return segment
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
