import type { Env } from './env';
import { all, first, json } from './db';
import { combineLedgers, shareRatioBps } from '../../src/lib/integrity/mlr';
import { gatherIntegrityFacts } from './integrity-service';
import type { PeriodLedger } from '../../src/lib/integrity/types';
import { resolveBrand, type BrandIntent, type ResolvedBrand } from '../../src/lib/brand/tokens';
import type { SiteContext, SitePage } from '../../src/lib/cms/blocks';

/**
 * D1 → the ministry site.
 *
 * The same split as everywhere else: this file knows what a table is, and
 * `src/lib/cms` knows what a page is. The renderer and the editor both read the
 * output of this module, which is what stops the preview and the published page
 * from disagreeing.
 */

export interface SiteRecord {
  org: {
    id: string; name: string; slug: string; published_at: string | null;
    /** Set only when the domain has been verified — a claim is not an address. */
    custom_domain: string | null;
    /**
     * True for the seeded demonstration ministries.
     *
     * Carried all the way to the renderer because these sites are publicly
     * reachable by design — a live thing to show a prospect is worth more than
     * a screenshot — and one of them deliberately reproduces documented
     * misconduct at a 16% share ratio. A visitor who cannot tell that from a
     * real customer has been misled by us, not by the ministry.
     */
    demo: boolean;
  };
  brand: ResolvedBrand;
  pages: SitePage[];
  ctx: SiteContext;
}

/**
 * How long "there is no published site at this slug" is remembered.
 *
 * The same negative-caching argument as the host lookup: `/{slug}` is reached
 * only after the content registry misses, so any slug-shaped path an attacker
 * invents costs one database read. Shape-guarding stops `/x` and `/../..`; it
 * does not stop `/aaaa`, and the whole attack is misses.
 *
 * A minute, because this is on the path to a ministry's site going live and a
 * longer memory of "not found" is a support ticket.
 */
const MISS_CACHE_SECONDS = 60;

/** Slugs known to have no published site. Cleared when a site is published. */
async function knownMiss(env: Env, slug: string): Promise<boolean> {
  try {
    return (await env.CACHE.get(`site-miss:${slug}`)) === '1';
  } catch {
    return false;
  }
}

async function rememberMiss(env: Env, slug: string): Promise<void> {
  try {
    await env.CACHE.put(`site-miss:${slug}`, '1', { expirationTtl: MISS_CACHE_SECONDS });
  } catch {
    // Not caching is slow, not wrong.
  }
}

/**
 * Forget a cached miss.
 *
 * Called when a site is published or its address changes, so a ministry that has
 * just clicked publish does not spend a minute looking at Auxilium's 404 on its
 * own address — which reads as the publish button not having worked.
 */
export async function forgetSiteMiss(env: Env, slug: string): Promise<void> {
  try {
    await env.CACHE.delete(`site-miss:${slug}`);
  } catch {
    // The TTL clears it shortly regardless.
  }
}

/**
 * Everything needed to draw a ministry's site.
 *
 * `published` narrows to pages the public may see. Passing false is the editor
 * preview — the *only* difference between the two, so a ministry previewing a
 * page sees exactly what a visitor will.
 */
export async function loadSite(
  env: Env,
  orgSlugOrId: { slug: string } | { id: string },
  opts: { published: boolean },
): Promise<SiteRecord | null> {
  // Only the public path benefits, and only it may be served stale. The editor
  // always reads through, because a ministry looking at its own draft must never
  // be told it has no site.
  if (opts.published && 'slug' in orgSlugOrId && (await knownMiss(env, orgSlugOrId.slug))) {
    return null;
  }

  const org = 'slug' in orgSlugOrId
    ? await first<OrgRow>(
        env.DB,
        `SELECT id, name, slug, brand, kind, site_published_at, governing_version_rule,
                custom_domain, custom_domain_verified_at
           FROM organizations WHERE slug = ? AND deleted_at IS NULL`,
        orgSlugOrId.slug,
      )
    : await first<OrgRow>(
        env.DB,
        `SELECT id, name, slug, brand, kind, site_published_at, governing_version_rule,
                custom_domain, custom_domain_verified_at
           FROM organizations WHERE id = ? AND deleted_at IS NULL`,
        orgSlugOrId.id,
      );
  if (!org) {
    if (opts.published && 'slug' in orgSlugOrId) await rememberMiss(env, orgSlugOrId.slug);
    return null;
  }

  // A site is published as a whole. Without this the moment a ministry's first
  // page reached 'published' its public address started answering — with one
  // page and no navigation. Nobody decided to launch; the schema did.
  if (opts.published && !org.site_published_at) {
    await rememberMiss(env, org.slug);
    return null;
  }

  const rows = await all<PageRow>(
    env.DB,
    `SELECT slug, title, nav, blocks FROM cms_pages
      WHERE org_id = ? AND deleted_at IS NULL ${opts.published ? "AND status = 'published'" : ''}
      ORDER BY position, title`,
    org.id,
  );

  const pages: SitePage[] = rows.map((r) => ({
    slug: r.slug,
    title: r.title,
    nav: r.nav === 1,
    blocks: json(r.blocks, []),
  }));

  return {
    org: {
      id: org.id, name: org.name, slug: org.slug, published_at: org.site_published_at,
      // Verified, never merely claimed. Everything downstream — canonical URLs,
      // the sitemap, routing — treats this as the ministry's real address, and
      // an unverified claim must not be able to reach any of them.
      custom_domain: org.custom_domain_verified_at ? org.custom_domain : null,
      demo: org.kind === 'demo',
    },
    brand: resolveBrand(json<Partial<BrandIntent>>(org.brand, {})),
    pages,
    ctx: await siteContext(env, org),
  };
}

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  brand: string;
  kind: string;
  site_published_at: string | null;
  governing_version_rule: string;
  custom_domain: string | null;
  custom_domain_verified_at: string | null;
}

interface PageRow {
  slug: string;
  title: string;
  nav: number;
  blocks: string;
}

/**
 * What the live blocks render from.
 *
 * Every field here is genuinely absent on a ministry's first day, and each one
 * being absent means the corresponding block does not appear at all — see
 * `resolveBlock`. So this function's job is only to answer honestly; deciding
 * what to do about a gap belongs in the pure layer.
 */
async function siteContext(env: Env, org: OrgRow): Promise<SiteContext> {
  const [facts, guidelines, form] = await Promise.all([
    // The published ratio is the *same computation* the integrity report runs,
    // not a second query that means roughly the same thing. Two numbers for one
    // fact is the failure this whole product argues against, and a ministry
    // whose website and whose own dashboard disagree about where the money went
    // has been handed the exact problem it bought the software to avoid.
    gatherIntegrityFacts(env, org.id),
    all<{ version: string; effective_from: string; published_url: string | null; provisions: string }>(
      env.DB,
      `SELECT version, effective_from, published_url, provisions FROM sharing_guidelines
        WHERE org_id = ? ORDER BY effective_from DESC LIMIT 5`,
      org.id,
    ),
    first<{ published_at: string | null }>(
      env.DB,
      `SELECT published_at FROM application_forms WHERE org_id = ? ORDER BY created_at DESC LIMIT 1`,
      org.id,
    ),
  ]);

  // Publishing where a ministry's money went is its decision, and the same
  // decision the public transparency endpoint reads. One flag, both surfaces:
  // a product that argues for consent-based disclosure cannot have one surface
  // asking and the other assuming.
  const publishes = json<{ publish_share_ratio?: boolean }>(org.brand, {}).publish_share_ratio === true;
  const ratio = publishedRatio(facts.ledger);

  return {
    ministryName: org.name,
    shareRatio: publishes ? ratio : undefined,
    shareRatioGap: ratio && !publishes ? 'not_published' : ratio ? undefined : 'no_ledger',
    guidelines: guidelines.length
      ? guidelines.map((g) => ({
          version: g.version,
          effective_from: g.effective_from,
          provisionCount: json<unknown[]>(g.provisions, []).length,
          url: g.published_url ?? undefined,
        }))
      : undefined,
    governingRule: org.governing_version_rule as SiteContext['governingRule'],
    // The application form lives on the app, not on the ministry site: it is a
    // real form with validation and spam scoring, and reimplementing it as a
    // block would give a ministry two forms that drift.
    applyHref: form?.published_at ? `/app/apply/${org.slug}` : undefined,
  };
}

/**
 * The ratio a ministry publishes, or nothing.
 *
 * Undefined rather than zero when there is nothing to measure. A ministry with
 * an empty ledger has not achieved a 0% share ratio — it has not reported one,
 * and printing 0.0% on its own front page would be a false accusation this
 * product generated against its own customer.
 */
function publishedRatio(ledger: PeriodLedger[]): SiteContext['shareRatio'] {
  if (ledger.length === 0) return undefined;

  const total = combineLedgers(ledger);
  if (total.contributions_cents <= 0) return undefined;

  // `combineLedgers` does not reorder, and the ledger arrives newest first.
  const newest = ledger[0].period;
  const oldest = ledger[ledger.length - 1].period;

  return {
    bps: shareRatioBps(total.shared_cents, total.contributions_cents),
    periodLabel: oldest === newest ? label(newest) : `${label(oldest)} to ${label(newest)}`,
  };
}

/** 'YYYY-MM' → 'January 2026'. Periods are stored as months everywhere. */
function label(period: string): string {
  const [year, month] = period.split('-');
  const names = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const name = names[Number(month) - 1];
  return name ? `${name} ${year}` : period;
}
