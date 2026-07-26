/**
 * The knowledge base.
 *
 * Two audiences with genuinely different needs. Staff need to know how to
 * operate the software and how to make a defensible decision. Members need to
 * know what is happening to their bill, what they are entitled to ask for, and
 * what to do when the answer is no.
 *
 * Articles live in code rather than in the database, for the same reason the
 * marketing content does: they are versioned, reviewable in a diff, and tested.
 * A knowledge base that drifts from the product is worse than none, because
 * someone acts on it. Ministries can add their own articles on top (see
 * `kb_articles`), and those are clearly marked as theirs.
 *
 * **The rule for member-facing content.** Anything asserting what the law is,
 * or what a member is entitled to, carries a source. Anything uncertain says so
 * in the text rather than in a caveat nobody reads. And nothing here promises
 * an outcome — the strongest available claim about a future decision is that
 * something is *likely*, which is the same discipline the eligibility check
 * follows and for the same reason.
 */

export type Audience = 'staff' | 'member' | 'both';

export interface KbSource {
  label: string;
  url: string;
  /** Set when the source is authoritative rather than explanatory. */
  authority?: 'law' | 'regulator' | 'court' | 'research' | 'industry' | 'reporting';
}

export interface KbSection {
  heading?: string;
  paragraphs: string[];
}

export interface KbStep {
  title: string;
  body: string;
  /** Why this step matters. Steps without a reason get skipped. */
  because?: string;
}

export interface KbArticle {
  slug: string;
  audience: Audience;
  category: string;
  title: string;
  /**
   * One or two sentences that answer the question on their own.
   *
   * This is what a search result shows and what an answer leads with, so it has
   * to stand alone — a summary that requires reading the article defeats the
   * purpose.
   */
  summary: string;
  body: KbSection[];
  /** Procedures get numbered steps rather than prose. */
  steps?: KbStep[];
  /**
   * Words a person would actually use that do not appear in the text.
   *
   * The single highest-leverage field in the whole structure. A member types
   * "they won't pay my bill", not "sharing decision appeal", and the gap
   * between those two vocabularies is where a knowledge base fails.
   */
  synonyms?: string[];
  sources?: KbSource[];
  related?: string[];
  /** Where in the app this is about, so an answer can link somewhere useful. */
  appPath?: string;
  updated: string;
}
