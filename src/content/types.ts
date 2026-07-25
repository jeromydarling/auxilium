/**
 * The marketing content registry.
 *
 * Everything public about Auxilium is data in this directory, not markup: one
 * typed registry that the renderer, the sitemap, and llms.txt all read. That
 * is what stops the sitemap going stale and stops a page existing that nothing
 * links to.
 *
 * Two rules govern every word written here, and both are enforced by tests:
 *
 *   1. Numbers in the copy must match numbers in the engine. If a page says
 *      "80%", it reads the same constant the scoring code does. Marketing that
 *      drifts from the product is how a company ends up making a claim its own
 *      software contradicts.
 *
 *   2. Nothing is asserted about a named ministry. Auxilium's buyers *are*
 *      health sharing ministries — the documented failures in this category
 *      are described as patterns, with public sources, never as accusations
 *      against a prospective customer.
 */

export type Block =
  | { type: 'hero'; heading: string; subheading: string; cta?: Cta; secondaryCta?: Cta; kicker?: string }
  | { type: 'stat'; value: string; label: string; source?: Source }
  | { type: 'statRow'; stats: { value: string; label: string; source?: Source }[] }
  | { type: 'prose'; heading?: string; paragraphs: string[] }
  | { type: 'featureList'; heading: string; intro?: string; features: Feature[] }
  | { type: 'comparison'; heading: string; intro?: string; rows: ComparisonRow[] }
  | { type: 'faq'; heading: string; items: FaqItem[] }
  | { type: 'callout'; tone: 'plain' | 'caution'; heading?: string; body: string }
  | { type: 'quote'; body: string; attribution: string; source?: Source }
  | { type: 'cta'; heading: string; body?: string; cta: Cta; secondaryCta?: Cta };

export interface Cta {
  label: string;
  href: string;
}

/** A citation. Every factual claim about the category carries one. */
export interface Source {
  label: string;
  url: string;
}

export interface Feature {
  title: string;
  body: string;
  /** The failure this feature exists to prevent, stated as a pattern. */
  prevents?: string;
}

export interface ComparisonRow {
  capability: string;
  /** Deliberately honest: "no" and "partial" appear, including for Auxilium. */
  auxilium: 'yes' | 'partial' | 'no';
  alternative: 'yes' | 'partial' | 'no';
  note?: string;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export type PageKind = 'landing' | 'feature' | 'guide' | 'comparison' | 'legal';

export interface MarketingPage {
  /** Path without a leading slash. '' is the home page. */
  slug: string;
  kind: PageKind;
  title: string;
  /** The <h1>. Often differs from the <title>, which carries the brand. */
  h1: string;
  description: string;
  /** Sitemap priority, 0–1. */
  priority: number;
  /** Guides only — used for Article structured data and the guide index. */
  category?: string;
  updated: string;
  blocks: Block[];
  /** Pages this one links to. Tested: every entry must resolve to a real page. */
  related?: string[];
}
