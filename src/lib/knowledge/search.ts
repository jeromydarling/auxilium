/**
 * Retrieval.
 *
 * Deliberately a scoring function over terms rather than an embedding model,
 * and the reasons are the same ones that govern NRI scoring:
 *
 *   • It is explainable. A staff member who gets a wrong answer can be shown
 *     exactly which words matched and where, and can add a synonym to fix it.
 *     "The model thought they were similar" is not an answer anyone can act on.
 *   • It is deterministic. The same question returns the same articles today
 *     and in eighteen months, which matters when the answer concerns whether a
 *     member's bill gets paid.
 *   • It runs with no network call and no key. The knowledge base has to work
 *     on the day the ministry most needs it, not the day the vendor is up.
 *
 * Pure. No database, no clock.
 */

import type { KbArticle, Audience } from './types';

/**
 * Words carrying no retrieval signal.
 *
 * Kept small on purpose. Aggressive stop-word lists strip the words that make
 * short questions specific — "how do I appeal" is mostly stop words, and the
 * one that survives is the one that matters.
 */
const STOP = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'of', 'to', 'in', 'on', 'at', 'by',
  'for', 'with', 'is', 'are', 'was', 'were', 'be', 'been', 'do', 'does', 'did', 'can',
  'could', 'should', 'would', 'will', 'shall', 'i', 'me', 'my', 'we', 'our', 'you', 'your',
  'it', 'its', 'this', 'that', 'these', 'those', 'as', 'from', 'about', 'what', 'when',
  'where', 'who', 'how', 'why', 'get', 'got',
]);

/**
 * Reduce a word to something that matches its relatives.
 *
 * A hand-rolled suffix stripper rather than a real stemmer: it needs to make
 * "denied", "denial", and "denies" collide, and it needs to be short enough
 * that anyone can read it and predict what it does.
 */
export function stem(word: string): string {
  let w = word.toLowerCase();
  if (w.length <= 3) return w;
  for (const suffix of ['iness', 'ingly', 'ments', 'ation', 'ional', 'ing', 'ers', 'ies', 'ied', 'ial', 'ment', 'ness', 'ed', 'es', 's', 'ly', 'al']) {
    if (w.length - suffix.length >= 3 && w.endsWith(suffix)) {
      w = w.slice(0, -suffix.length);
      break;
    }
  }
  // "denia" from "denial" and "deni" from "denied" should still meet.
  if (w.endsWith('i')) w = w.slice(0, -1);
  if (w.endsWith('y')) w = w.slice(0, -1);
  return w;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    // Apostrophes are removed rather than treated as separators: "claim's"
    // should become "claims" and then stem to "claim", while splitting on the
    // apostrophe would leave a stray "s" and lose the match entirely.
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(stem);
}

interface IndexedArticle {
  article: KbArticle;
  /** Term → weighted count, summed across fields. */
  terms: Map<string, number>;
  haystack: string;
}

/**
 * Field weights.
 *
 * A term in the title is worth far more than the same term buried in a
 * paragraph, and a synonym is worth nearly as much as a title because it was
 * added precisely to catch the phrasing a real person uses.
 */
const WEIGHTS = { title: 8, summary: 4, synonyms: 7, category: 3, steps: 2, body: 1 };

function indexArticle(article: KbArticle): IndexedArticle {
  const terms = new Map<string, number>();

  const add = (text: string, weight: number) => {
    for (const term of tokenize(text)) {
      terms.set(term, (terms.get(term) ?? 0) + weight);
    }
  };

  add(article.title, WEIGHTS.title);
  add(article.summary, WEIGHTS.summary);
  add(article.category, WEIGHTS.category);
  for (const s of article.synonyms ?? []) add(s, WEIGHTS.synonyms);
  for (const step of article.steps ?? []) {
    add(step.title, WEIGHTS.steps);
    add(step.body, WEIGHTS.body);
    if (step.because) add(step.because, WEIGHTS.body);
  }
  for (const section of article.body) {
    if (section.heading) add(section.heading, WEIGHTS.steps);
    for (const p of section.paragraphs) add(p, WEIGHTS.body);
  }

  const haystack = [
    article.title,
    article.summary,
    ...(article.synonyms ?? []),
    ...article.body.flatMap((s) => [s.heading ?? '', ...s.paragraphs]),
    ...(article.steps ?? []).flatMap((s) => [s.title, s.body]),
  ]
    .join(' ')
    .toLowerCase();

  return { article, terms, haystack };
}

export interface SearchHit {
  article: KbArticle;
  score: number;
  /** Which query terms actually matched — this is what makes a result explainable. */
  matched: string[];
}

export interface SearchOptions {
  audience?: Audience;
  limit?: number;
  category?: string;
}

/**
 * Find the articles that answer a question.
 *
 * Scoring is term overlap weighted by field, divided by the log of the
 * article's total weight so a long article does not win simply by being long,
 * plus a bonus when the query appears as a literal phrase. That last part
 * matters more than it looks: "annual unshared amount" should beat three
 * articles that each mention one of those words.
 */
export function search(
  articles: KbArticle[],
  query: string,
  options: SearchOptions = {},
): SearchHit[] {
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) return [];

  const phrase = query.toLowerCase().trim();
  const audience = options.audience;

  const candidates = articles.filter((a) => {
    if (options.category && a.category !== options.category) return false;
    if (!audience) return true;
    return readableBy(a.audience, audience);
  });

  const hits: SearchHit[] = [];

  for (const indexed of candidates.map(indexArticle)) {
    let score = 0;
    const matched: string[] = [];

    for (const term of new Set(queryTerms)) {
      const weight = indexed.terms.get(term);
      if (weight) {
        score += weight;
        matched.push(term);
      }
    }

    if (score === 0) continue;

    // Proportion of the question that was understood. An article matching one
    // word of a six-word question is usually the wrong article.
    const coverage = matched.length / new Set(queryTerms).size;
    score *= 0.4 + 0.6 * coverage;

    // Length normalization, gently — enough to stop a long article dominating,
    // not enough to punish a thorough one.
    const total = [...indexed.terms.values()].reduce((a, b) => a + b, 0);
    score /= Math.log2(total + 4);

    if (phrase.length > 8 && indexed.haystack.includes(phrase)) score *= 1.8;

    hits.push({ article: indexed.article, score, matched });
  }

  return hits
    .sort((a, b) => b.score - a.score || a.article.slug.localeCompare(b.article.slug))
    .slice(0, options.limit ?? 8);
}

/**
 * Who may read what, and why it is not symmetric.
 *
 * A member must never see staff operations material — that is a permission,
 * not a preference. Staff reading member articles is the opposite: someone on
 * the phone with a frightened member needs to see exactly what that member is
 * being told about appeals, deadlines, and their rights against the hospital.
 * Hiding it would mean the people answering the questions cannot read the
 * answers.
 */
export function readableBy(articleAudience: Audience, reader: Audience): boolean {
  if (articleAudience === 'both' || articleAudience === reader) return true;
  return reader === 'staff' && articleAudience === 'member';
}

/** Articles in a category, for browsing rather than searching. */
export function byCategory(articles: KbArticle[], audience: Audience): Map<string, KbArticle[]> {
  const map = new Map<string, KbArticle[]>();
  for (const a of articles) {
    if (!readableBy(a.audience, audience)) continue;
    map.set(a.category, [...(map.get(a.category) ?? []), a]);
  }
  return map;
}

export function articleBySlug(articles: KbArticle[], slug: string): KbArticle | undefined {
  return articles.find((a) => a.slug === slug);
}
