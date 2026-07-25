import { Hono } from 'hono';
import { requireUser, requireRole, currentUser, type AppEnv } from '../lib/auth';
import { all, first, run, json } from '../lib/db';
import { param } from '../lib/http';
import { audit } from '../lib/audit';
import { newId } from '../../src/lib/ids';
import { nowIso } from '../../src/lib/utils';

/**
 * The white-label CMS shell.
 *
 * Ministry-branded member-facing pages, built from ordered blocks so new block
 * types never need a migration. V1 is deliberately a shell: pages, blocks,
 * draft/publish, and a public read endpoint. Custom domains and a visual
 * builder are V2 — the schema and the public route are shaped to accept them.
 */

const cms = new Hono<AppEnv>();

// ── Public: no auth. Published pages only, and only for the named org. ───────
cms.get('/public/:orgSlug/:pageSlug', async (c) => {
  const orgSlug = param(c, 'orgSlug');
  const pageSlug = param(c, 'pageSlug');

  const org = await first<{ id: string; name: string; brand: string }>(
    c.env.DB,
    'SELECT id, name, brand FROM organizations WHERE slug = ? AND deleted_at IS NULL',
    orgSlug,
  );
  if (!org) return c.json({ error: 'Not found.' }, 404);

  const page = await first<{ title: string; blocks: string; published_at: string | null }>(
    c.env.DB,
    `SELECT title, blocks, published_at FROM cms_pages
      WHERE org_id = ? AND slug = ? AND status = 'published' AND deleted_at IS NULL`,
    org.id, pageSlug,
  );
  if (!page) return c.json({ error: 'Not found.' }, 404);

  return c.json(
    {
      org: { name: org.name, brand: json(org.brand, {}) },
      page: { title: page.title, blocks: json(page.blocks, []), published_at: page.published_at },
    },
    200,
    // Anonymous published content is safe to edge-cache briefly.
    { 'Cache-Control': 'public, max-age=60, s-maxage=300' },
  );
});

// ── Everything below requires a session ──────────────────────────────────────
cms.use('*', requireUser);

cms.get('/pages', async (c) => {
  const user = (await currentUser(c))!;
  const pages = await all<Record<string, unknown>>(
    c.env.DB,
    `SELECT id, slug, title, status, published_at, updated_at
       FROM cms_pages WHERE org_id = ? AND deleted_at IS NULL ORDER BY title`,
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
  const { slug, title, blocks } = await c.req.json<{
    slug?: string; title?: string; blocks?: unknown[];
  }>();

  if (!title) return c.json({ error: 'A page needs a title.' }, 400);

  const pageSlug = (slug ?? title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const id = newId('cmsPage');
  const now = nowIso();

  try {
    await run(
      c.env.DB,
      `INSERT INTO cms_pages (id, org_id, slug, title, blocks, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'draft', ?, ?)`,
      id, user.org_id, pageSlug, title, JSON.stringify(blocks ?? []), now, now,
    );
  } catch {
    return c.json({ error: `A page at "${pageSlug}" already exists.` }, 409);
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
  if ('blocks' in body) {
    sets.push('blocks = ?');
    params.push(JSON.stringify(body.blocks ?? []));
  }
  if ('status' in body) {
    const status = body.status === 'published' ? 'published' : 'draft';
    sets.push('status = ?', 'published_at = ?');
    params.push(status, status === 'published' ? nowIso() : null);
  }
  if (sets.length === 0) return c.json({ error: 'Nothing to update.' }, 400);

  sets.push('updated_at = ?');
  params.push(nowIso(), id, user.org_id);

  await run(c.env.DB, `UPDATE cms_pages SET ${sets.join(', ')} WHERE id = ? AND org_id = ?`, ...params);
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
