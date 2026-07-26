import { Hono } from 'hono';
import { requireUser, requireRole, currentUser, type AppEnv } from '../lib/auth';
import { param } from '../lib/http';
import { all, first, run, json } from '../lib/db';
import { newId } from '../../src/lib/ids';
import { nowIso } from '../../src/lib/utils';
import { ALL_ARTICLES } from '../../src/lib/knowledge';
import { search, byCategory, articleBySlug } from '../../src/lib/knowledge/search';
import { answer, suggestedQuestions, type AccountFacts } from '../../src/lib/knowledge/answer';
import type { KbArticle, Audience } from '../../src/lib/knowledge/types';
import { gatherAccountFacts, memberIdForUser } from '../lib/knowledge-service';

/**
 * The knowledge base, and the thing that answers questions with it.
 *
 * Two audiences read this. Staff asking how to do something correctly, and
 * members asking what is happening to their bill and whether they have any say
 * in it. The second group is the one this has to serve well: they are asking
 * because something has gone wrong, and the alternative to a good answer here
 * is a phone call they may not make.
 *
 * Answers are retrieval over a written library plus facts from the asker's own
 * record. There is no generation step. That is the same choice the scoring
 * engine makes and for the same reasons — it is explainable, deterministic, and
 * works with no key and no network.
 */
const knowledge = new Hono<AppEnv>();
knowledge.use('*', requireUser);

/**
 * Ministry-authored articles, layered over the platform library.
 *
 * A ministry article with the same slug wins. If a ministry has written its own
 * answer about its own waiting period, that answer is the correct one.
 */
async function libraryFor(env: AppEnv['Bindings'], orgId: string): Promise<KbArticle[]> {
  const rows = await all<{
    slug: string; audience: string; category: string; title: string; summary: string;
    body: string; steps: string; synonyms: string; sources: string; related: string;
    app_path: string | null; updated_at: string;
  }>(
    env.DB,
    `SELECT slug, audience, category, title, summary, body, steps, synonyms, sources,
            related, app_path, updated_at
       FROM kb_articles
      WHERE org_id = ? AND status = 'published' AND deleted_at IS NULL`,
    orgId,
  );

  const ministry: KbArticle[] = rows.map((r) => ({
    slug: r.slug,
    audience: r.audience as Audience,
    category: r.category,
    title: r.title,
    summary: r.summary,
    body: json(r.body, []),
    steps: json(r.steps, []),
    synonyms: json(r.synonyms, []),
    sources: json(r.sources, []),
    related: json(r.related, []),
    appPath: r.app_path ?? undefined,
    updated: r.updated_at.slice(0, 10),
  }));

  const overridden = new Set(ministry.map((a) => a.slug));
  return [...ministry, ...ALL_ARTICLES.filter((a) => !overridden.has(a.slug))];
}

/** Which audience this user reads as. Members never see staff operations articles. */
function audienceFor(role: string): 'staff' | 'member' {
  return role === 'member' ? 'member' : 'staff';
}

/** Browse: everything, grouped, for the audience asking. */
knowledge.get('/', async (c) => {
  const user = (await currentUser(c))!;
  const audience = audienceFor(user.role);
  const library = await libraryFor(c.env, user.org_id);

  const grouped = byCategory(library, audience);
  return c.json({
    audience,
    suggested: suggestedQuestions(audience),
    categories: [...grouped.entries()].map(([category, articles]) => ({
      category,
      articles: articles.map((a) => ({
        slug: a.slug,
        title: a.title,
        summary: a.summary,
        updated: a.updated,
      })),
    })),
  });
});

/** One article. */
knowledge.get('/article/*', async (c) => {
  const user = (await currentUser(c))!;
  const slug = c.req.path.replace(/^\/api\/knowledge\/article\//, '');
  const library = await libraryFor(c.env, user.org_id);
  const article = articleBySlug(library, slug);

  if (!article) return c.json({ error: 'No such article.' }, 404);

  // Isolation here is deliberately one-way.
  //
  // A member must not be able to read staff operations material by guessing a
  // slug — the audience field is a permission, not a hint. But staff reading
  // member articles is not a leak, it is the job: someone on the phone with a
  // frightened member needs to see exactly what that member is being told
  // about appeals, deadlines, and their rights against the hospital. Blocking
  // that would mean the people answering the questions could not read the
  // answers.
  if (audienceFor(user.role) === 'member' && article.audience === 'staff') {
    return c.json({ error: 'No such article.' }, 404);
  }

  return c.json({ article });
});

/** Plain search, for someone who would rather browse than ask. */
knowledge.get('/search', async (c) => {
  const user = (await currentUser(c))!;
  const query = c.req.query('q') ?? '';
  if (!query.trim()) return c.json({ results: [] });

  const library = await libraryFor(c.env, user.org_id);
  const hits = search(library, query, { audience: audienceFor(user.role), limit: 10 });

  return c.json({
    results: hits.map((h) => ({
      slug: h.article.slug,
      title: h.article.title,
      summary: h.article.summary,
      category: h.article.category,
      // Returned so a result can explain itself rather than appearing by magic.
      matched: h.matched,
    })),
  });
});

/**
 * Ask a question.
 *
 * This is the endpoint that makes the knowledge base feel like it knows you.
 * The answer combines the written library with facts from the asker's own
 * record — for a member, their own claims and guideline version; for staff,
 * whatever they are looking at.
 *
 * Every question is recorded with the confidence of its answer, because the
 * unanswered ones are the single best signal of what is missing.
 */
knowledge.post('/ask', async (c) => {
  const user = (await currentUser(c))!;
  const body = await c.req.json<{ question: string; member_id?: string }>();
  const question = (body.question ?? '').trim();

  if (question.length < 3) {
    return c.json({ error: 'Ask a question of at least a few words.' }, 400);
  }
  if (question.length > 500) {
    return c.json({ error: 'That question is too long — try asking it in a sentence.' }, 400);
  }

  const role = audienceFor(user.role);
  const library = await libraryFor(c.env, user.org_id);

  // A member may only ever be grounded in their own record; staff may look at a
  // specific member, which is what makes this useful on a call.
  //
  // Member sessions resolve through `member_accounts` rather than `users`, so a
  // staff session can never carry a member context by accident — the two are
  // different tables and this is the only place they meet.
  const subjectMemberId = role === 'member' ? await memberIdForUser(c.env, user.id) : (body.member_id ?? null);

  const facts: AccountFacts = await gatherAccountFacts(c.env, {
    orgId: user.org_id,
    role,
    memberId: subjectMemberId,
  });

  const result = answer(library, question, facts);

  await run(
    c.env.DB,
    `INSERT INTO kb_questions (id, org_id, role, question, confidence, top_slug, asked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    newId('kbQuestion'),
    user.org_id,
    role,
    question,
    result.confidence,
    result.articles[0]?.slug ?? null,
    nowIso(),
  );

  return c.json(result);
});

/**
 * Tell us an answer did not help.
 *
 * Volunteered, never inferred. "They asked again" is not evidence the answer
 * was wrong, and treating it as such would fill the gap report with noise.
 */
knowledge.post('/unhelpful', async (c) => {
  const user = (await currentUser(c))!;
  const body = await c.req.json<{ question: string }>();

  await run(
    c.env.DB,
    `UPDATE kb_questions SET marked_unhelpful = 1
      WHERE org_id = ? AND question = ?
      AND id = (SELECT id FROM kb_questions WHERE org_id = ? AND question = ?
                 ORDER BY asked_at DESC LIMIT 1)`,
    user.org_id,
    body.question,
    user.org_id,
    body.question,
  );

  return c.json({ recorded: true });
});

/**
 * What people asked that this could not answer.
 *
 * The most useful screen in the whole module for whoever maintains the ministry's
 * own articles: a ranked list of the questions its members are asking into a
 * void.
 */
knowledge.get('/gaps', requireRole('owner', 'admin'), async (c) => {
  const user = (await currentUser(c))!;

  const rows = await all<{ question: string; role: string; n: number; last_asked: string }>(
    c.env.DB,
    `SELECT question, role, COUNT(*) AS n, MAX(asked_at) AS last_asked
       FROM kb_questions
      WHERE org_id = ? AND (confidence = 'none' OR marked_unhelpful = 1)
      GROUP BY LOWER(question), role
      ORDER BY n DESC, last_asked DESC
      LIMIT 100`,
    user.org_id,
  );

  return c.json({
    gaps: rows,
    note:
      'These are questions the knowledge base could not answer. Each one is either an article ' +
      'worth writing or a wording your members use that the existing articles do not.',
  });
});

// ── Ministry-authored articles ───────────────────────────────────────────────

const requireEditor = requireRole('owner', 'admin');

knowledge.get('/manage', requireEditor, async (c) => {
  const user = (await currentUser(c))!;
  const rows = await all(
    c.env.DB,
    `SELECT id, slug, title, audience, category, status, updated_at
       FROM kb_articles WHERE org_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC`,
    user.org_id,
  );
  return c.json({ articles: rows });
});

knowledge.post('/manage', requireEditor, async (c) => {
  const user = (await currentUser(c))!;
  const b = await c.req.json<Record<string, unknown>>();

  const slug = String(b.slug ?? '').trim();
  const title = String(b.title ?? '').trim();
  const summary = String(b.summary ?? '').trim();

  if (!/^[a-z0-9-]+(\/[a-z0-9-]+)*$/.test(slug)) {
    return c.json({ error: 'Slug should look like ours/waiting-periods.' }, 400);
  }
  if (title.length < 5) return c.json({ error: 'Give the article a real title.' }, 400);
  if (summary.length < 40) {
    return c.json(
      {
        error:
          'The summary needs to answer the question on its own — it is what a member sees in ' +
          'search results and what an answer leads with.',
      },
      400,
    );
  }

  const id = newId('kbArticle');
  await run(
    c.env.DB,
    `INSERT INTO kb_articles
       (id, org_id, slug, audience, category, title, summary, body, steps, synonyms,
        sources, related, app_path, status, updated_by, published_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (org_id, slug) DO UPDATE SET
       audience = excluded.audience, category = excluded.category, title = excluded.title,
       summary = excluded.summary, body = excluded.body, steps = excluded.steps,
       synonyms = excluded.synonyms, sources = excluded.sources, related = excluded.related,
       app_path = excluded.app_path, status = excluded.status,
       updated_by = excluded.updated_by, published_at = excluded.published_at,
       updated_at = excluded.updated_at`,
    id,
    user.org_id,
    slug,
    String(b.audience ?? 'both'),
    String(b.category ?? 'Our ministry'),
    title,
    summary,
    JSON.stringify(b.body ?? []),
    JSON.stringify(b.steps ?? []),
    JSON.stringify(b.synonyms ?? []),
    JSON.stringify(b.sources ?? []),
    JSON.stringify(b.related ?? []),
    b.app_path ? String(b.app_path) : null,
    b.status === 'published' ? 'published' : 'draft',
    user.id,
    b.status === 'published' ? nowIso() : null,
    nowIso(),
    nowIso(),
  );

  const saved = await first(
    c.env.DB,
    `SELECT id, slug, status FROM kb_articles WHERE org_id = ? AND slug = ?`,
    user.org_id,
    slug,
  );
  return c.json({ article: saved });
});

knowledge.delete('/manage/*', requireEditor, async (c) => {
  const user = (await currentUser(c))!;
  const slug = c.req.path.replace(/^\/api\/knowledge\/manage\//, '');
  await run(
    c.env.DB,
    `UPDATE kb_articles SET deleted_at = ?, updated_at = ? WHERE org_id = ? AND slug = ?`,
    nowIso(),
    nowIso(),
    user.org_id,
    slug,
  );
  return c.json({ deleted: true });
});

export default knowledge;
export { param };
