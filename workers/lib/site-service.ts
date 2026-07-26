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
  };
  brand: ResolvedBrand;
  pages: SitePage[];
  ctx: SiteContext;
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
  const org = 'slug' in orgSlugOrId
    ? await first<OrgRow>(
        env.DB,
        `SELECT id, name, slug, brand, site_published_at, governing_version_rule,
                custom_domain, custom_domain_verified_at
           FROM organizations WHERE slug = ? AND deleted_at IS NULL`,
        orgSlugOrId.slug,
      )
    : await first<OrgRow>(
        env.DB,
        `SELECT id, name, slug, brand, site_published_at, governing_version_rule,
                custom_domain, custom_domain_verified_at
           FROM organizations WHERE id = ? AND deleted_at IS NULL`,
        orgSlugOrId.id,
      );
  if (!org) return null;

  // A site is published as a whole. Without this the moment a ministry's first
  // page reached 'published' its public address started answering — with one
  // page and no navigation. Nobody decided to launch; the schema did.
  if (opts.published && !org.site_published_at) return null;

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

  return {
    ministryName: org.name,
    shareRatio: publishedRatio(facts.ledger),
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
