import { Hono, type Context } from 'hono';
import type { Env } from '../lib/env';
import type { AppEnv } from '../lib/auth';
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

/**
 * The same context type as the rest of the Worker.
 *
 * Marketing needs none of the auth variables, but a narrower type here would
 * make this router structurally incompatible with the entry module that calls
 * into it — and the fix for that would be a cast, which is a worse thing to
 * have than one unused field. `ministryDomain` is the one it does read: set by
 * the host check in workers/index.ts when a request arrived on a ministry's own
 * verified domain, and read to decide whether links carry a `/slug` prefix.
 */
type MarketingEnv = AppEnv;

const marketing = new Hono<MarketingEnv>();

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
    // A ministry with its own verified domain is listed at that domain, not at
    // /{slug}. Both addresses answer — taking the path away the moment a TXT
    // record appears would break it while their routing record propagates — but
    // only one of them belongs in a sitemap, and it is the one with their name
    // on it. This matches the canonical the pages themselves declare.
    const loc = row.custom_domain
      ? `https://${row.custom_domain}${row.slug === 'home' ? '/' : `/${row.slug}`}`
      : `${origin}/${row.org_slug}${row.slug === 'home' ? '' : `/${row.slug}`}`;

    urls.push(`  <url>
    <loc>${loc}</loc>
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
  return all<{ org_slug: string; slug: string; updated_at: string; custom_domain: string | null }>(
    env.DB,
    `SELECT o.slug AS org_slug, p.slug, p.updated_at,
            CASE WHEN o.custom_domain_verified_at IS NOT NULL THEN o.custom_domain END AS custom_domain
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

async function renderSlug(c: Context<MarketingEnv>, slug: string) {
  const clean = slug.replace(/^\/+|\/+$/g, '');

  const moved = MOVED[clean];
  if (moved) return c.redirect(moved, 301);

  const page = pageBySlug(slug);
  if (page) {
    return c.html(renderPage(page, originOf(c.req.url)), 200, { 'Cache-Control': HTML_CACHE });
  }

  // Not ours. It may be a ministry's, at /{slug}.
  const [orgSlug, pageSlug = 'home', ...rest] = clean.split('/');
  if (rest.length === 0 && orgSlug && !RESERVED_SLUGS.has(orgSlug)) {
    const ministry = await renderMinistrySite(c, orgSlug, pageSlug);
    if (ministry) return ministry;
  }

  // Neither — fall through to the Worker's notFound, which is what routes
  // /app/* to the SPA and answers everything else with a real 404.
  return c.notFound();
}

/**
 * A ministry's site, by slug and page.
 *
 * On the shared origin this is reached only after the content registry misses,
 * so Auxilium's own pages always win a collision, and the caller checks
 * `RESERVED_SLUGS` first. That check exists in two places on purpose: the guard
 * at rename stops a ministry taking `/security` today, and the guard at request
 * stops a ministry that took a slug before the marketing site had a page there
 * from shadowing it tomorrow.
 *
 * On a custom domain there is no registry to miss, so `serveMinistryDomain`
 * calls straight in.
 */
async function renderMinistrySite(
  c: Context<MarketingEnv>,
  orgSlug: string,
  pageSlug: string,
) {
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
    return c.html(renderMinistryNotFound(toMinistrySite(c, site)), 404, { 'Cache-Control': 'no-store' });
  }

  return c.html(
    renderMinistryPage(toMinistrySite(c, site), page, originOf(c.req.url)),
    200,
    // Shorter than the marketing TTL. These pages carry a live share ratio, and
    // a stale number on a ministry's own site is the one thing this product
    // cannot be relaxed about.
    { 'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600' },
  );
}

function toMinistrySite(
  c: Context<MarketingEnv>,
  site: NonNullable<Awaited<ReturnType<typeof loadSite>>>,
) {
  const onOwnDomain = Boolean(c.get('ministryDomain'));
  const platform = platformOrigin(c);

  return {
    org: { name: site.org.name, slug: site.org.slug },
    // Empty on a ministry's own domain, `/slug` on the shared origin. See the
    // note on MinistrySite: the renderer must not guess which it is drawing.
    base: onOwnDomain ? '' : `/${site.org.slug}`,
    brand: site.brand,
    pages: site.pages,
    ctx: {
      ...site.ctx,
      // The application form is served by the app, which lives on the platform
      // host. Left relative, this would take a 302 through the ministry's own
      // domain — an extra round trip on the most important link on the site,
      // and a moment where the address bar shows a path that is not theirs.
      applyHref: site.ctx.applyHref && onOwnDomain
        ? `${platform}${site.ctx.applyHref}`
        : site.ctx.applyHref,
    },
    portalUrl: `${platform}/app/portal`,
    canonicalOrigin: site.org.custom_domain ? `https://${site.org.custom_domain}` : platform,
  };
}

/** Where the application actually lives, whatever host this request arrived on. */
function platformOrigin(c: Context<MarketingEnv>): string {
  const host = c.env.APP_HOST;
  if (!host) return originOf(c.req.url);
  return host.startsWith('localhost') || host.startsWith('127.') ? `http://${host}` : `https://${host}`;
}

/**
 * A request that arrived on a ministry's own domain.
 *
 * Handled as a whole rather than by letting it fall through the marketing
 * router, because on a custom domain the precedence inverts: `/` is the
 * ministry's home page, not Auxilium's, and `/pricing` is the ministry's page
 * called pricing. Falling through would serve Auxilium's marketing site under
 * somebody else's brand.
 *
 * Two things it deliberately does not serve:
 *
 * **The application.** `/app/*` redirects to the platform host. Sessions are
 * opaque cookies scoped to that host; serving the app on a second hostname
 * would give a member two origins and a session on only one of them, which
 * presents as being randomly logged out.
 *
 * **The API.** A redirect would silently drop the body of a POST, so this
 * answers with a 404 that names the right host rather than a redirect that
 * looks like it worked.
 */
export async function serveMinistryDomain(c: Context<MarketingEnv>, orgSlug: string) {
  const path = new URL(c.req.url).pathname.replace(/^\/+|\/+$/g, '');

  if (path === 'api' || path.startsWith('api/')) {
    return c.json({ error: `The API is served from ${c.env.APP_HOST ?? 'the platform host'}.` }, 404);
  }
  if (path === 'app' || path.startsWith('app/')) {
    // 302 rather than 301: a permanent redirect is cached by browsers
    // indefinitely and is very hard to take back if this ever changes.
    return c.redirect(`${platformOrigin(c)}/${path}`, 302);
  }

  if (path === 'robots.txt') {
    return c.text(
      ['User-agent: *', 'Allow: /', '', `Sitemap: ${originOf(c.req.url)}/sitemap.xml`, ''].join('\n'),
      200,
      { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': HTML_CACHE },
    );
  }

  if (path === 'sitemap.xml') {
    const site = await loadSite(c.env, { slug: orgSlug }, { published: true });
    if (!site) return c.notFound();
    const origin = originOf(c.req.url);
    // This ministry's pages only. The platform sitemap lists every published
    // ministry, and serving it here would publish the customer list of a
    // product whose customers are not necessarily public about using it.
    const urls = site.pages.map((p) => `  <url><loc>${origin}${p.slug === 'home' ? '/' : `/${p.slug}`}</loc></url>`);
    return c.body(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`,
      200,
      { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': HTML_CACHE },
    );
  }

  const rendered = await renderMinistrySite(c, orgSlug, path === '' ? 'home' : path);
  return rendered ?? c.notFound();
}

export default marketing;
