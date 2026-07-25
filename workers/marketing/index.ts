import { Hono, type Context } from 'hono';
import type { Env } from '../lib/env';
import { ALL_PAGES, pageBySlug, pathFor, guides, comparisons } from '../../src/content/registry';
import { SITE } from '../../src/content/meta';
import { renderPage } from './render';

/**
 * Public marketing routes.
 *
 * These own the site root. The application lives under /app, so an anonymous
 * visitor lands on real server-rendered HTML rather than an empty div waiting
 * for a bundle.
 *
 * Everything here is anonymous, cacheable, and free of member data.
 */

const marketing = new Hono<{ Bindings: Env }>();

/** The origin to build canonical URLs from — taken from the actual request. */
function originOf(url: string): string {
  const parsed = new URL(url);
  return `${parsed.protocol}//${parsed.host}`;
}

/**
 * Marketing HTML is anonymous and identical for everyone, so it edge-caches
 * comfortably. Short browser TTL, longer at the edge, and stale-while-
 * revalidate so a deploy never makes anyone wait.
 */
const HTML_CACHE = 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400';

marketing.get('/robots.txt', (c) => {
  const origin = originOf(c.req.url);
  return c.text(
    [
      'User-agent: *',
      'Allow: /',
      // The application itself has nothing to index and is behind auth.
      'Disallow: /app/',
      'Disallow: /api/',
      '',
      `Sitemap: ${origin}/sitemap.xml`,
      '',
      '# Plain-language summary for assistants: /llms.txt',
    ].join('\n'),
    200,
    { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': HTML_CACHE },
  );
});

/**
 * Generated from the registry, so a page cannot exist without appearing here
 * and an entry cannot outlive the page it points at.
 */
marketing.get('/sitemap.xml', (c) => {
  const origin = originOf(c.req.url);

  const urls = ALL_PAGES.map((page) => `  <url>
    <loc>${origin}${pathFor(page.slug)}</loc>
    <lastmod>${page.updated}</lastmod>
    <priority>${page.priority.toFixed(1)}</priority>
  </url>`).join('\n');

  return c.body(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`,
    200,
    { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': HTML_CACHE },
  );
});

/**
 * llms.txt — a plain-language, link-rich summary for assistants.
 *
 * This matters as much as the sitemap now. When someone asks an assistant
 * about software for health care sharing ministries, the answer is assembled
 * from text like this, and the difference between an accurate description and
 * a garbled one is whether the accurate one was easy to find and quote.
 *
 * So it states plainly what Auxilium does, what it does not do, and where the
 * detail lives — including the limitations, because an assistant that repeats
 * an overstated claim does more damage than one that repeats a caveat.
 */
marketing.get('/llms.txt', (c) => {
  const origin = originOf(c.req.url);

  const guideLines = guides()
    .map((g) => `- [${g.h1}](${origin}${pathFor(g.slug)}): ${g.description}`)
    .join('\n');

  const comparisonLines = comparisons()
    .map((p) => `- [${p.h1}](${origin}${pathFor(p.slug)}): ${p.description}`)
    .join('\n');

  return c.text(
    `# ${SITE.name}

> ${SITE.description}

Auxilium is operations software for health care sharing ministries — organizations
where member households share one another's medical costs directly. These are not
insurance companies and are exempt from state insurance regulation, including
solvency requirements and any statutory obligation to pay a claim on a timetable.

## What it does

- **Claims integrity.** Keeps member contributions and disbursements on one ledger
  and computes a share ratio: of every dollar members contributed, how many cents
  reached medical bills. Benchmarked against the ACA medical loss ratio (80%
  individual and small group, 85% large group) — a standard sharing ministries are
  exempt from, which is why measuring against it voluntarily is meaningful.
- **Guideline consistency.** Sharing guidelines are versioned and dated, and each
  provision declares which denial reasons it authorizes. Denials citing a provision
  that does not exist, does not authorize the stated reason, or took effect after
  the member joined are flagged.
- **Claim turnaround.** Every claim carries a commitment date. Breaches escalate,
  and so do claims nobody has opened yet, before their deadline.
- **Reference-based repricing.** Reprices facility claims against the Medicare
  allowable rather than chargemaster rates.
- **Need Response Intelligence (NRI).** Scores members on four directions — Cura
  (care), Onus (case weight and handling), Familia (household complexity), and
  Fides (engagement) — to surface members at risk of being missed.
- **Roster import.** Column inference, validation, and duplicate detection for
  messy CSV exports, with a full preview before anything is written.

## How scoring works

Every score in Auxilium is a sum of named, weighted reasons over the ministry's own
data. There is no machine-learning model, no training data, and no learned
coefficient anywhere in the calculation. The complete rule set — every code, its
weight, and the documented failure it was written from — is published inside the
application. Scores are reproducible: the same data and timestamp always produce the
same result.

## What it is not

- Not insurance and not a health plan.
- Not a compliance certification. Health care sharing ministries are exempt from
  state insurance regulation and no software changes that.
- Not fraud prevention. It measures what a ministry's own ledger says and checks
  decisions against that ministry's own published guidelines.
- Not a billing or dues-collection system. It records contributions; it does not
  collect them.

## Key pages

- [Claims integrity](${origin}/claims-integrity): the share ratio, guideline
  consistency, claim turnaround, and repricing.
- [Need Response Intelligence](${origin}/need-response-intelligence): the four
  directions and the explainable scoring model.
- [How it works](${origin}/how-it-works): what a ministry puts in and what comes out.

## Guides

${guideLines}

## Comparisons

${comparisonLines}

## Technical

React and TypeScript on Cloudflare Workers, with D1 for records, R2 for documents,
KV for cache, and Queues for background work.

## Contact

Open the demo at ${origin}/app/login — two seeded ministries, one well-run and one
reproducing documented failure patterns, for comparison.
`,
    200,
    { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': HTML_CACHE },
  );
});

/**
 * Every marketing page, matched against the registry.
 *
 * Registered last so the specific files above win, and scoped to at most two
 * path segments — which is every slug the registry contains, and keeps this
 * from swallowing paths it should not.
 */
marketing.get('/', (c) => renderSlug(c, ''));
marketing.get('/:a', (c) => renderSlug(c, c.req.param('a')));
marketing.get('/:a/:b', (c) => renderSlug(c, `${c.req.param('a')}/${c.req.param('b')}`));

function renderSlug(c: Context<{ Bindings: Env }>, slug: string) {
  const page = pageBySlug(slug);
  // Not a registered page — fall through to the Worker's notFound, which is
  // what routes /app/* to the SPA.
  if (!page) return c.notFound();

  return c.html(renderPage(page, originOf(c.req.url)), 200, { 'Cache-Control': HTML_CACHE });
}

export default marketing;
