import { Hono } from 'hono';
import { requireUser, requireRole, currentUser, type AppEnv } from '../lib/auth';
import { all, first, run, json } from '../lib/db';
import { param } from '../lib/http';
import { audit } from '../lib/audit';
import { newId, randomSecret } from '../../src/lib/ids';
import { nowIso } from '../../src/lib/utils';
import { loadSite } from '../lib/site-service';
import { defaultSite, reviewSite, slugAvailable, resolveSite, siteNav } from '../../src/lib/cms/blocks';
import { dnsInstructions, normalizeDomain, validateDomain, verificationToken } from '../../src/lib/cms/domains';
import { verifyDomain } from '../lib/domain-service';

/**
 * The ministry site, from the staff side.
 *
 * Two things this API is careful about, both of which the earlier shell got
 * wrong by omission:
 *
 * **Publishing is a decision about the site, not about a page.** A ministry
 * building its first site has pages in every state for a fortnight. When
 * publishing a page was the same act as launching, the public address started
 * answering the moment somebody clicked publish on a draft — with one page and
 * no navigation.
 *
 * **The preview and the published page come from the same function.** Both
 * call `loadSite` and `resolveSite`; the only difference is which pages are
 * included. A preview computed differently from production is a lie that gets
 * discovered by a visitor.
 */

const cms = new Hono<AppEnv>();

/**
 * Public read, kept for the portal and for anything embedding a single page.
 * The whole public site is rendered by the Worker at /{slug}, not from here.
 */
cms.get('/public/:orgSlug/:pageSlug', async (c) => {
  const site = await loadSite(c.env, { slug: param(c, 'orgSlug') }, { published: true });
  if (!site) return c.json({ error: 'Not found.' }, 404);

  const page = site.pages.find((p) => p.slug === param(c, 'pageSlug'));
  if (!page) return c.json({ error: 'Not found.' }, 404);

  return c.json(
    {
      org: { name: site.org.name, brand: site.brand },
      nav: siteNav(site.pages),
      page: { title: page.title, blocks: resolveSite(page, site.ctx) },
    },
    200,
    // Anonymous published content is safe to edge-cache briefly.
    { 'Cache-Control': 'public, max-age=60, s-maxage=300' },
  );
});

// ── Everything below requires a session ──────────────────────────────────────
cms.use('*', requireUser);

/**
 * The editor's whole view in one call.
 *
 * Deliberately one request rather than four. The editor needs the pages, the
 * live data, the review, and the publish state together or it renders a state
 * that never existed — a page showing a share-ratio block as fine while the
 * review that says it will not appear is still in flight.
 */
cms.get('/site', async (c) => {
  const user = (await currentUser(c))!;
  const site = await loadSite(c.env, { id: user.org_id }, { published: false });
  if (!site) return c.json({ error: 'That ministry was not found.' }, 404);

  const rows = await all<{ id: string; slug: string; status: string; nav: number; position: number }>(
    c.env.DB,
    `SELECT id, slug, status, nav, position FROM cms_pages
      WHERE org_id = ? AND deleted_at IS NULL ORDER BY position, title`,
    user.org_id,
  );
  const meta = new Map(rows.map((r) => [r.slug, r]));

  return c.json({
    org: { name: site.org.name, slug: site.org.slug },
    published_at: site.org.published_at,
    public_url: `/${site.org.slug}`,
    brand: site.brand,
    context: site.ctx,
    pages: site.pages.map((p) => ({
      ...p,
      id: meta.get(p.slug)?.id ?? null,
      status: meta.get(p.slug)?.status ?? 'draft',
      position: meta.get(p.slug)?.position ?? 0,
      resolved: resolveSite(p, site.ctx),
    })),
    nav: siteNav(site.pages),
    issues: reviewSite(site.pages, site.ctx),
  });
});

/**
 * Start from the template.
 *
 * Refuses when pages already exist rather than merging, because there is no
 * safe merge: a ministry that has written its own "what is shared" page and
 * then re-runs this would either lose it or end up with two.
 */
cms.post('/site/init', requireRole('owner', 'admin'), async (c) => {
  const user = (await currentUser(c))!;

  const existing = await first<{ count: number }>(
    c.env.DB,
    'SELECT COUNT(*) AS count FROM cms_pages WHERE org_id = ? AND deleted_at IS NULL',
    user.org_id,
  );
  if ((existing?.count ?? 0) > 0) {
    return c.json({ error: 'This ministry already has pages. Add or edit them instead.' }, 409);
  }

  const org = await first<{ name: string }>(
    c.env.DB, 'SELECT name FROM organizations WHERE id = ?', user.org_id,
  );
  const now = nowIso();
  const pages = defaultSite(org?.name ?? 'this ministry');

  await c.env.DB.batch(
    pages.map((page, i) =>
      c.env.DB.prepare(
        `INSERT INTO cms_pages
           (id, org_id, slug, title, blocks, status, nav, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)`,
      ).bind(
        newId('cmsPage'), user.org_id, page.slug, page.title,
        JSON.stringify(page.blocks), page.nav ? 1 : 0, i, now, now,
      ),
    ),
  );

  await audit(c.env.DB, {
    orgId: user.org_id, actorId: user.id, actorKind: 'user', action: 'cms.site_created',
    subjectType: 'organization', subjectId: user.org_id, meta: { pages: pages.length },
  });

  return c.json({ pages: pages.length }, 201);
});

/**
 * Publish or unpublish the whole site.
 *
 * Publishing also publishes every page that is still a draft — a ministry
 * clicking "publish my site" means the site it has been looking at, and leaving
 * half of it as drafts would launch a site with dead navigation entries.
 * Unpublishing leaves page states alone so it is genuinely reversible.
 */
cms.patch('/site', requireRole('owner', 'admin'), async (c) => {
  const user = (await currentUser(c))!;
  const { published } = await c.req.json<{ published?: boolean }>();
  const now = nowIso();

  if (published) {
    const site = await loadSite(c.env, { id: user.org_id }, { published: false });
    if (!site || site.pages.length === 0) {
      return c.json({ error: 'There is nothing to publish yet.' }, 400);
    }
    // A site with no home page publishes a front door that 404s. Every other
    // finding here is a warning; this one is the shape of the thing being
    // broken, so it is the one that blocks.
    if (!site.pages.some((p) => p.slug === 'home')) {
      return c.json({ error: 'Add a page at "home" first — that is what the address opens.' }, 400);
    }

    await c.env.DB.batch([
      c.env.DB.prepare(
        `UPDATE cms_pages SET status = 'published', published_at = ?, updated_at = ?
          WHERE org_id = ? AND deleted_at IS NULL AND status = 'draft'`,
      ).bind(now, now, user.org_id),
      c.env.DB.prepare(
        'UPDATE organizations SET site_published_at = ?, updated_at = ? WHERE id = ?',
      ).bind(now, now, user.org_id),
    ]);
  } else {
    await run(
      c.env.DB,
      'UPDATE organizations SET site_published_at = NULL, updated_at = ? WHERE id = ?',
      now, user.org_id,
    );
  }

  await audit(c.env.DB, {
    orgId: user.org_id, actorId: user.id, actorKind: 'user',
    action: published ? 'cms.site_published' : 'cms.site_unpublished',
    subjectType: 'organization', subjectId: user.org_id,
  });

  return c.json({ published: Boolean(published) });
});

/**
 * The ministry's public address.
 *
 * Changing it breaks every link anyone has to the old one, so this reports what
 * would break rather than silently doing it. Checked against the reserved list
 * at rename and not only at signup: the marketing site gains pages, and a slug
 * that becomes reserved later is exactly the kind of thing that breaks quietly.
 */
cms.get('/site/slug/:slug', async (c) => {
  const user = (await currentUser(c))!;
  const slug = param(c, 'slug').trim().toLowerCase();

  const shape = slugAvailable(slug);
  if (!shape.ok) return c.json(shape);

  const taken = await first<{ id: string }>(
    c.env.DB, 'SELECT id FROM organizations WHERE slug = ? AND id != ?', slug, user.org_id,
  );
  if (taken) return c.json({ ok: false, reason: 'Another ministry is already at that address.' });

  return c.json({ ok: true });
});

cms.patch('/site/slug', requireRole('owner'), async (c) => {
  const user = (await currentUser(c))!;
  const { slug } = await c.req.json<{ slug?: string }>();
  const clean = (slug ?? '').trim().toLowerCase();

  const shape = slugAvailable(clean);
  if (!shape.ok) return c.json({ error: shape.reason }, 400);

  const before = await first<{ slug: string }>(
    c.env.DB, 'SELECT slug FROM organizations WHERE id = ?', user.org_id,
  );

  try {
    await run(
      c.env.DB, 'UPDATE organizations SET slug = ?, updated_at = ? WHERE id = ?',
      clean, nowIso(), user.org_id,
    );
  } catch {
    return c.json({ error: 'Another ministry is already at that address.' }, 409);
  }

  await audit(c.env.DB, {
    orgId: user.org_id, actorId: user.id, actorKind: 'user', action: 'cms.slug_changed',
    subjectType: 'organization', subjectId: user.org_id,
    meta: { from: before?.slug ?? null, to: clean },
  });

  return c.json({ slug: clean });
});

// ── Custom domains ───────────────────────────────────────────────────────────

/**
 * The claim, the proof, and what still has to happen.
 *
 * Returned as one object because the three are only meaningful together: a
 * domain with no token is a half-written row, and a verified domain whose
 * CNAME has not been added yet is a ministry staring at their own broken site
 * wondering what they did wrong.
 */
cms.get('/site/domain', async (c) => {
  const user = (await currentUser(c))!;
  const org = await first<{
    custom_domain: string | null;
    custom_domain_token: string | null;
    custom_domain_verified_at: string | null;
    custom_domain_checked_at: string | null;
  }>(
    c.env.DB,
    `SELECT custom_domain, custom_domain_token, custom_domain_verified_at, custom_domain_checked_at
       FROM organizations WHERE id = ?`,
    user.org_id,
  );

  if (!org?.custom_domain || !org.custom_domain_token) {
    return c.json({ domain: null, platform_host: c.env.APP_HOST ?? null });
  }

  return c.json({
    domain: org.custom_domain,
    verified_at: org.custom_domain_verified_at,
    checked_at: org.custom_domain_checked_at,
    platform_host: c.env.APP_HOST ?? null,
    dns: dnsInstructions(org.custom_domain, org.custom_domain_token, c.env.APP_HOST ?? ''),
  });
});

cms.put('/site/domain', requireRole('owner'), async (c) => {
  const user = (await currentUser(c))!;
  const { domain } = await c.req.json<{ domain?: string }>();

  const check = validateDomain(domain ?? '');
  if (!check.ok) return c.json({ error: check.reason }, 400);

  const clean = normalizeDomain(domain!);
  const token = verificationToken(randomSecret);

  try {
    await run(
      c.env.DB,
      `UPDATE organizations
          SET custom_domain = ?, custom_domain_token = ?,
              custom_domain_verified_at = NULL, custom_domain_checked_at = NULL,
              updated_at = ?
        WHERE id = ?`,
      // Verification is cleared, always. It is a statement about one hostname,
      // and carrying it across a change would leave a domain verified that
      // nobody ever checked.
      clean, token, nowIso(), user.org_id,
    );
  } catch {
    return c.json({ error: 'Another ministry has already claimed that domain.' }, 409);
  }

  await audit(c.env.DB, {
    orgId: user.org_id, actorId: user.id, actorKind: 'user', action: 'cms.domain_claimed',
    subjectType: 'organization', subjectId: user.org_id, meta: { domain: clean },
  });

  return c.json({
    domain: clean,
    verified_at: null,
    platform_host: c.env.APP_HOST ?? null,
    dns: dnsInstructions(clean, token, c.env.APP_HOST ?? ''),
  });
});

cms.post('/site/domain/verify', requireRole('owner', 'admin'), async (c) => {
  const user = (await currentUser(c))!;
  const status = await verifyDomain(c.env, user.org_id);

  if (status.verified_at) {
    await audit(c.env.DB, {
      orgId: user.org_id, actorId: user.id, actorKind: 'user', action: 'cms.domain_verified',
      subjectType: 'organization', subjectId: user.org_id, meta: { domain: status.domain },
    });
  }
  return c.json(status);
});

cms.delete('/site/domain', requireRole('owner'), async (c) => {
  const user = (await currentUser(c))!;
  await run(
    c.env.DB,
    `UPDATE organizations
        SET custom_domain = NULL, custom_domain_token = NULL,
            custom_domain_verified_at = NULL, custom_domain_checked_at = NULL, updated_at = ?
      WHERE id = ?`,
    nowIso(), user.org_id,
  );
  await audit(c.env.DB, {
    orgId: user.org_id, actorId: user.id, actorKind: 'user', action: 'cms.domain_released',
    subjectType: 'organization', subjectId: user.org_id,
  });
  return c.json({ domain: null });
});

// ── Pages ────────────────────────────────────────────────────────────────────

cms.get('/pages', async (c) => {
  const user = (await currentUser(c))!;
  const pages = await all<Record<string, unknown>>(
    c.env.DB,
    `SELECT id, slug, title, status, nav, position, published_at, updated_at
       FROM cms_pages WHERE org_id = ? AND deleted_at IS NULL ORDER BY position, title`,
    user.org_id,
  );
  return c.json({ items: pages });
});

cms.get('/pages/:id', async (c) => {
  const user = (await currentUser(c))!;
  const page = await first<Record<string, unknown>>(
    c.env.DB,
    'SELECT * FROM cms_pages WHERE id = ? AND org_id = ? AND deleted_at IS NULL',
    param(c, 'id'), user.org_id,
  );
  if (!page) return c.json({ error: 'That page was not found.' }, 404);
  return c.json({ page: { ...page, blocks: json(page.blocks, []) } });
});

cms.post('/pages', requireRole('owner', 'admin'), async (c) => {
  const user = (await currentUser(c))!;
  const { slug, title, blocks, nav } = await c.req.json<{
    slug?: string; title?: string; blocks?: unknown[]; nav?: boolean;
  }>();

  if (!title) return c.json({ error: 'A page needs a title.' }, 400);

  const pageSlug = (slug ?? title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!pageSlug) return c.json({ error: 'That title does not make a usable address.' }, 400);

  const id = newId('cmsPage');
  const now = nowIso();
  const last = await first<{ max: number | null }>(
    c.env.DB,
    'SELECT MAX(position) AS max FROM cms_pages WHERE org_id = ? AND deleted_at IS NULL',
    user.org_id,
  );

  try {
    await run(
      c.env.DB,
      `INSERT INTO cms_pages
         (id, org_id, slug, title, blocks, status, nav, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)`,
      id, user.org_id, pageSlug, title, JSON.stringify(blocks ?? []),
      nav ? 1 : 0, (last?.max ?? -1) + 1, now, now,
    );
  } catch {
    return c.json({ error: `A page at “${pageSlug}” already exists.` }, 409);
  }

  await audit(c.env.DB, {
    orgId: user.org_id, actorId: user.id, actorKind: 'user', action: 'cms.page_created',
    subjectType: 'cms_page', subjectId: id, meta: { slug: pageSlug },
  });

  return c.json({ id, slug: pageSlug }, 201);
});

cms.patch('/pages/:id', requireRole('owner', 'admin'), async (c) => {
  const user = (await currentUser(c))!;
  const id = param(c, 'id');
  const body = await c.req.json<Record<string, unknown>>();

  const sets: string[] = [];
  const params: unknown[] = [];

  if ('title' in body) {
    sets.push('title = ?');
    params.push(body.title);
  }
  if ('slug' in body) {
    const clean = String(body.slug ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!clean) return c.json({ error: 'That is not a usable address.' }, 400);
    sets.push('slug = ?');
    params.push(clean);
  }
  if ('blocks' in body) {
    sets.push('blocks = ?');
    params.push(JSON.stringify(body.blocks ?? []));
  }
  if ('nav' in body) {
    sets.push('nav = ?');
    params.push(body.nav ? 1 : 0);
  }
  if ('position' in body) {
    sets.push('position = ?');
    params.push(Number(body.position) || 0);
  }
  if ('status' in body) {
    const status = body.status === 'published' ? 'published' : 'draft';
    sets.push('status = ?', 'published_at = ?');
    params.push(status, status === 'published' ? nowIso() : null);
  }
  if (sets.length === 0) return c.json({ error: 'Nothing to update.' }, 400);

  sets.push('updated_at = ?');
  params.push(nowIso(), id, user.org_id);

  try {
    await run(
      c.env.DB, `UPDATE cms_pages SET ${sets.join(', ')} WHERE id = ? AND org_id = ?`, ...params,
    );
  } catch {
    return c.json({ error: 'Another page already uses that address.' }, 409);
  }
  return c.json({ ok: true });
});

/** Menu order, set by dragging. One call so a reorder cannot land half-applied. */
cms.post('/pages/reorder', requireRole('owner', 'admin'), async (c) => {
  const user = (await currentUser(c))!;
  const { ids } = await c.req.json<{ ids?: string[] }>();
  if (!Array.isArray(ids) || ids.length === 0) return c.json({ error: 'Nothing to reorder.' }, 400);

  const now = nowIso();
  await c.env.DB.batch(
    ids.map((id, i) =>
      c.env.DB.prepare('UPDATE cms_pages SET position = ?, updated_at = ? WHERE id = ? AND org_id = ?')
        .bind(i, now, id, user.org_id),
    ),
  );
  return c.json({ ok: true });
});

cms.delete('/pages/:id', requireRole('owner', 'admin'), async (c) => {
  const user = (await currentUser(c))!;
  await run(
    c.env.DB, 'UPDATE cms_pages SET deleted_at = ?, updated_at = ? WHERE id = ? AND org_id = ?',
    nowIso(), nowIso(), param(c, 'id'), user.org_id,
  );
  return c.json({ ok: true });
});

export default cms;
