import { Hono, type Context } from 'hono';
import type { Env } from '../lib/env';
import { ALL_PAGES, pageBySlug, pathFor, guides, comparisons } from '../../src/content/registry';
import { SITE } from '../../src/content/meta';
import { renderPage } from './render';
import { renderMinistryPage, renderMinistryNotFound } from './ministry';
import { loadSite } from '../lib/site-service';
import { all } from '../lib/db';
import { RESERVED_SLUGS } from '../../src/lib/cms/blocks';

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
marketing.get('/sitemap.xml', async (c) => {
  const origin = originOf(c.req.url);

  const urls = ALL_PAGES.map((page) => `  <url>
    <loc>${origin}${pathFor(page.slug)}</loc>
    <lastmod>${page.updated}</lastmod>
    <priority>${page.priority.toFixed(1)}</priority>
  </url>`);

  // Ministry sites share this origin, so they belong in this sitemap rather
  // than in one nothing links to. A ministry that builds a site here and then
  // finds it is not indexed has been sold a website that does not work as a
  // website — and the first thing most of them will check is whether Google
  // can find it.
  for (const row of await publishedMinistryPages(c.env)) {
    urls.push(`  <url>
    <loc>${origin}/${row.org_slug}${row.slug === 'home' ? '' : `/${row.slug}`}</loc>
    <lastmod>${row.updated_at.slice(0, 10)}</lastmod>
    <priority>0.6</priority>
  </url>`);
  }

  return c.body(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`,
    200,
    { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': HTML_CACHE },
  );
});

/**
 * Published pages of published sites, across every ministry.
 *
 * Both halves of that matter: a page marked published on a site nobody has
 * launched must not appear, and neither must a draft on a launched site.
 * Failing open here would index a ministry's half-written page.
 */
async function publishedMinistryPages(env: Env) {
  return all<{ org_slug: string; slug: string; updated_at: string }>(
    env.DB,
    `SELECT o.slug AS org_slug, p.slug, p.updated_at
       FROM cms_pages p JOIN organizations o ON o.id = p.org_id
      WHERE p.status = 'published' AND p.deleted_at IS NULL
        AND o.site_published_at IS NOT NULL AND o.deleted_at IS NULL
      ORDER BY o.slug, p.position`,
  );
}

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
- **Narrative Relational Intelligence (NRI).** Scores members on four directions — Cura
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
- [Narrative Relational Intelligence](${origin}/narrative-relational-intelligence): the four
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
/**
 * Permanent redirects for slugs that have moved.
 *
 * A renamed page is still a page someone bookmarked, linked, or indexed.
 * Answering those with a 404 throws away the link and tells a crawler the
 * content is gone rather than moved, so every rename lands here on the way out.
 */
const MOVED: Record<string, string> = {
  // NRI was published briefly as "Need Response Intelligence" before the name
  // was settled as Narrative Relational Intelligence.
  'need-response-intelligence': '/narrative-relational-intelligence',
};

marketing.get('/', (c) => renderSlug(c, ''));
marketing.get('/:a', (c) => renderSlug(c, c.req.param('a')));
marketing.get('/:a/:b', (c) => renderSlug(c, `${c.req.param('a')}/${c.req.param('b')}`));

async function renderSlug(c: Context<{ Bindings: Env }>, slug: string) {
  const clean = slug.replace(/^\/+|\/+$/g, '');

  const moved = MOVED[clean];
  if (moved) return c.redirect(moved, 301);

  const page = pageBySlug(slug);
  if (page) {
    return c.html(renderPage(page, originOf(c.req.url)), 200, { 'Cache-Control': HTML_CACHE });
  }

  // Not ours. It may be a ministry's.
  const ministry = await renderMinistry(c, clean);
  if (ministry) return ministry;

  // Neither — fall through to the Worker's notFound, which is what routes
  // /app/* to the SPA and answers everything else with a real 404.
  return c.notFound();
}

/**
 * The ministry site at /{slug}.
 *
 * Tried only after the registry misses, so Auxilium's own pages always win a
 * collision. `RESERVED_SLUGS` is checked here as well as at rename, because the
 * two guards protect against different things: the rename guard stops a
 * ministry taking `/security` today, and this stops a ministry that took a slug
 * before the marketing site had a page there from shadowing it tomorrow. The
 * cost of the extra check is one Set lookup; the cost of missing it is
 * Auxilium's own page becoming unreachable with nothing in the logs.
 */
async function renderMinistry(c: Context<{ Bindings: Env }>, path: string) {
  const [orgSlug, pageSlug = 'home', ...rest] = path.split('/');
  if (!orgSlug || rest.length > 0 || RESERVED_SLUGS.has(orgSlug)) return null;
  // Shape-checked before the query so a flood of junk paths cannot turn a 404
  // into a database round trip each.
  if (!/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(orgSlug)) return null;
  if (!/^[a-z0-9][a-z0-9-]{0,60}$/.test(pageSlug)) return null;

  const site = await loadSite(c.env, { slug: orgSlug }, { published: true });
  if (!site) return null;

  const page = site.pages.find((p) => p.slug === pageSlug);

  // The ministry exists but this address does not. Answering in the ministry's
  // own brand with its own navigation is worth the extra render: a visitor who
  // followed a stale link is one click from what they were looking for, rather
  // than staring at Auxilium's 404 wondering whether the ministry is real.
  if (!page) {
    return c.html(renderMinistryNotFound(toMinistrySite(site)), 404, { 'Cache-Control': 'no-store' });
  }

  return c.html(
    renderMinistryPage(toMinistrySite(site), page, originOf(c.req.url)),
    200,
    // Shorter than the marketing TTL. These pages carry a live share ratio, and
    // a stale number on a ministry's own site is the one thing this product
    // cannot be relaxed about.
    { 'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600' },
  );
}

function toMinistrySite(site: NonNullable<Awaited<ReturnType<typeof loadSite>>>) {
  return { org: { name: site.org.name, slug: site.org.slug }, brand: site.brand, pages: site.pages, ctx: site.ctx };
}

export default marketing;
