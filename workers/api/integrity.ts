import { Hono } from 'hono';
import { intVar, type Env } from '../lib/env';
import { requireUser, requireRole, currentUser, type AppEnv } from '../lib/auth';
import { all, first, run, json } from '../lib/db';
import { param } from '../lib/http';
import { audit } from '../lib/audit';
import {
  gatherIntegrityFacts, computeAndStoreIntegrity, auditOrgDenials, loadGuidelines,
} from '../lib/integrity-service';
import { computeIntegrity } from '../../src/lib/integrity/engine';
import { INTEGRITY_RULES, INTEGRITY_RULES_VERSION } from '../../src/lib/integrity/rules';
import { shareRatioBps, formatBps } from '../../src/lib/integrity/mlr';
import { ACA_MLR_INDIVIDUAL_BPS, ACA_MLR_LARGE_GROUP_BPS } from '../../src/lib/integrity/types';
import { canChange, correctionImpact } from '../../src/lib/integrity/guidelines';
import { newId } from '../../src/lib/ids';
import { nowIso } from '../../src/lib/utils';

const integrity = new Hono<AppEnv>();
integrity.use('*', requireUser);

/** Only leadership sees the ledger. This is board-level information. */
const requireLeadership = requireRole('owner', 'admin');

/**
 * The integrity report — the answer to "where did the money go, and can you
 * prove it?"
 *
 * Cached briefly because it is read on every dashboard load, and invalidated
 * by any ledger write.
 */
integrity.get('/', requireLeadership, async (c) => {
  const user = (await currentUser(c))!;
  const cacheKey = `integrity:${user.org_id}`;

  const cached = await c.env.CACHE.get(cacheKey, 'json').catch(() => null);
  if (cached) return c.json(cached as Record<string, unknown>);

  const facts = await gatherIntegrityFacts(c.env, user.org_id);
  const report = computeIntegrity(facts);

  const payload = {
    report,
    ledger: facts.ledger,
    rules_version: INTEGRITY_RULES_VERSION,
  };

  const ttl = intVar(c.env.NRI_SIGNAL_TTL_SECONDS, 900);
  await c.env.CACHE.put(cacheKey, JSON.stringify(payload), { expirationTtl: ttl }).catch(() => {});

  return c.json(payload);
});

/**
 * The public transparency view.
 *
 * Deliberately unauthenticated and deliberately minimal: the share ratio, the
 * benchmark it is measured against, and nothing about any individual. A
 * ministry that is doing this honestly can link members straight to it, and
 * that link is worth more than any marketing claim — it is the one number
 * Aliera and Medical Cost Sharing could never have published.
 *
 * Opt-in per organization. Publishing is a decision, not a default.
 */
integrity.get('/public/:orgSlug', async (c) => {
  const slug = param(c, 'orgSlug');

  const org = await first<{ id: string; name: string; brand: string; target_share_ratio_bps: number }>(
    c.env.DB,
    'SELECT id, name, brand, target_share_ratio_bps FROM organizations WHERE slug = ? AND deleted_at IS NULL',
    slug,
  );
  if (!org) return c.json({ error: 'Not found.' }, 404);

  const brand = json<Record<string, unknown>>(org.brand, {});
  if (brand.publish_share_ratio !== true) {
    return c.json({ error: 'This ministry has not published its sharing ratio.' }, 404);
  }

  // Trailing twelve months. A single month is too easy to cherry-pick.
  const totals = await first<{ contributions: number; shared: number }>(
    c.env.DB,
    `SELECT
       (SELECT COALESCE(SUM(amount_cents), 0) FROM contributions
         WHERE org_id = ? AND kind = 'share' AND received_at >= datetime('now', '-365 days')) AS contributions,
       (SELECT COALESCE(SUM(amount_cents), 0) FROM disbursements
         WHERE org_id = ? AND category = 'share' AND paid_at >= datetime('now', '-365 days')) AS shared`,
    org.id, org.id,
  );

  const ratio = shareRatioBps(totals?.shared ?? 0, totals?.contributions ?? 0);

  return c.json(
    {
      ministry: org.name,
      window: 'trailing 12 months',
      share_ratio: formatBps(ratio),
      share_ratio_bps: ratio,
      shared_cents: totals?.shared ?? 0,
      contributions_cents: totals?.contributions ?? 0,
      benchmark: {
        // Stated precisely: HCSMs are exempt, which is what makes publishing
        // the comparison meaningful rather than a compliance box.
        note:
          'Health care sharing ministries are exempt from the ACA medical loss ratio. ' +
          'This ministry publishes the comparison voluntarily.',
        aca_individual: formatBps(ACA_MLR_INDIVIDUAL_BPS),
        aca_large_group: formatBps(ACA_MLR_LARGE_GROUP_BPS),
        meets_aca_individual: ratio >= ACA_MLR_INDIVIDUAL_BPS,
      },
      computed_at: nowIso(),
    },
    200,
    { 'Cache-Control': 'public, max-age=300, s-maxage=900' },
  );
});

/** Which specific denials a human should re-open, worst first. */
integrity.get('/denials', requireLeadership, async (c) => {
  const user = (await currentUser(c))!;
  const findings = await auditOrgDenials(c.env, user.org_id);

  const needIds = findings.map((f) => f.need_id);
  const members = needIds.length
    ? await all<{ need_id: string; first_name: string; last_name: string; title: string }>(
        c.env.DB,
        `SELECT n.id AS need_id, m.first_name, m.last_name, n.title
           FROM needs n JOIN members m ON m.id = n.member_id
          WHERE n.id IN (${needIds.map(() => '?').join(',')})`,
        ...needIds,
      )
    : [];

  const byNeed = new Map(members.map((m) => [m.need_id, m]));

  return c.json({
    findings: findings.map((f) => ({ ...f, need: byNeed.get(f.need_id) ?? null })),
    total_at_stake_cents: findings.reduce((sum, f) => sum + f.amount_requested_cents, 0),
  });
});

/** Force a recompute and persist the snapshot. */
integrity.post('/recompute', requireLeadership, async (c) => {
  const user = (await currentUser(c))!;
  const report = await computeAndStoreIntegrity(c.env, user.org_id);
  await audit(c.env.DB, {
    orgId: user.org_id, actorId: user.id, actorKind: 'user', action: 'integrity.recomputed',
    subjectType: 'org', subjectId: user.org_id,
    meta: { score: report.score, band: report.band, ratio_bps: report.share_ratio_bps },
  });
  return c.json({ report });
});

/** History, for the trend a board actually asks about. */
integrity.get('/history', requireLeadership, async (c) => {
  const user = (await currentUser(c))!;
  const rows = await all<Record<string, unknown>>(
    c.env.DB,
    `SELECT period, contributions_cents, shared_cents, administrative_cents,
            marketing_cents, related_party_cents, share_ratio_bps, integrity_score,
            band, computed_at
       FROM integrity_snapshots WHERE org_id = ?
      ORDER BY period DESC LIMIT 24`,
    user.org_id,
  );
  return c.json({ items: rows });
});

/** The published rule set, exactly as with NRI. */
integrity.get('/rules', async (c) => {
  return c.json({
    version: INTEGRITY_RULES_VERSION,
    benchmark: {
      aca_individual_bps: ACA_MLR_INDIVIDUAL_BPS,
      aca_large_group_bps: ACA_MLR_LARGE_GROUP_BPS,
    },
    rules: INTEGRITY_RULES.map((r) => ({
      code: r.code,
      label: r.label,
      weight: r.weight,
      // The documented failure each rule was written from. This is the part
      // that makes the rule arguable rather than arbitrary.
      provenance: r.provenance,
    })),
  });
});

// ── Ledger entry ─────────────────────────────────────────────────────────────

integrity.post('/contributions', requireLeadership, async (c) => {
  const user = (await currentUser(c))!;
  const body = await c.req.json<Record<string, unknown>>();

  const amount = Number(body.amount_cents ?? 0);
  if (!Number.isInteger(amount) || amount <= 0) {
    return c.json({ error: 'A contribution needs a positive amount in whole cents.' }, 400);
  }

  const receivedAt = String(body.received_at ?? nowIso());
  const id = newId('audit');

  await run(
    c.env.DB,
    `INSERT INTO contributions (id, org_id, household_id, member_id, amount_cents, period,
                                received_at, method, kind, reference, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, user.org_id, body.household_id ?? null, body.member_id ?? null, amount,
    String(body.period ?? receivedAt.slice(0, 7)), receivedAt,
    body.method ?? 'ach', body.kind ?? 'share', body.reference ?? null, nowIso(),
  );

  await c.env.CACHE.delete(`integrity:${user.org_id}`).catch(() => {});
  return c.json({ id }, 201);
});

integrity.post('/disbursements', requireLeadership, async (c) => {
  const user = (await currentUser(c))!;
  const body = await c.req.json<Record<string, unknown>>();

  const amount = Number(body.amount_cents ?? 0);
  if (!Number.isInteger(amount) || amount <= 0) {
    return c.json({ error: 'A disbursement needs a positive amount in whole cents.' }, 400);
  }
  if (!body.payee_name) {
    return c.json({ error: 'Every disbursement needs a payee.' }, 400);
  }

  // The one piece of policy enforced at the API rather than the database: a
  // related-party payment must state the relationship. Undisclosed
  // related-party payments are the mechanism in every diversion case in the
  // record, and an unexplained one should be impossible to enter here.
  if (body.category === 'related_party' && !body.relationship) {
    return c.json({
      error:
        'A related-party payment must state the relationship. Recording it without one is how ' +
        'diversion goes unnoticed.',
    }, 400);
  }

  const paidAt = String(body.paid_at ?? nowIso());
  const id = newId('audit');

  await run(
    c.env.DB,
    `INSERT INTO disbursements (id, org_id, need_id, member_id, amount_cents, period, paid_at,
                                payee_name, payee_type, category, relationship, approved_by,
                                reference, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, user.org_id, body.need_id ?? null, body.member_id ?? null, amount,
    String(body.period ?? paidAt.slice(0, 7)), paidAt,
    body.payee_name, body.payee_type ?? 'provider', body.category ?? 'share',
    body.relationship ?? null, user.id, body.reference ?? null, nowIso(),
  );

  await audit(c.env.DB, {
    orgId: user.org_id, actorId: user.id, actorKind: 'user', action: 'disbursement.recorded',
    subjectType: 'need', subjectId: (body.need_id as string) ?? null,
    meta: { amount_cents: amount, category: body.category ?? 'share', payee: body.payee_name },
  });

  await c.env.CACHE.delete(`integrity:${user.org_id}`).catch(() => {});
  return c.json({ id }, 201);
});

// ── Guidelines ───────────────────────────────────────────────────────────────

integrity.get('/guidelines', async (c) => {
  const user = (await currentUser(c))!;
  return c.json({ items: await loadGuidelines(c.env, user.org_id) });
});

integrity.post('/guidelines', requireLeadership, async (c) => {
  const user = (await currentUser(c))!;
  const body = await c.req.json<Record<string, unknown>>();

  if (!body.version || !body.effective_from) {
    return c.json({ error: 'A guideline version needs a version label and an effective date.' }, 400);
  }

  const id = newId('audit');
  const now = nowIso();

  try {
    await run(
      c.env.DB,
      `INSERT INTO sharing_guidelines (id, org_id, version, effective_from, effective_to,
                                       published_url, provisions, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, user.org_id, body.version, body.effective_from, body.effective_to ?? null,
      body.published_url ?? null, JSON.stringify(body.provisions ?? []), now, now,
    );
  } catch {
    return c.json({ error: `Version "${body.version}" already exists.` }, 409);
  }

  await audit(c.env.DB, {
    orgId: user.org_id, actorId: user.id, actorKind: 'user', action: 'guideline.published',
    subjectType: 'org', subjectId: user.org_id,
    meta: { version: body.version, effective_from: body.effective_from },
  });

  await c.env.CACHE.delete(`integrity:${user.org_id}`).catch(() => {});
  return c.json({ id }, 201);
});

/**
 * Correct a published version, in place.
 *
 * In place — not a new row — because `member_applications.guideline_version_id`
 * points here and the unique index on (org_id, version) means a corrected copy
 * could not carry the same label anyway. The previous text is archived to
 * `guideline_revisions` first, so nothing is lost: what a decline was actually
 * judged against stays readable, which is the artefact a dispute turns on.
 *
 * A reason is required. A correction with no stated reason is indistinguishable
 * from a quiet rewrite, and that distinction is the entire point of the table.
 */
integrity.patch('/guidelines/:id', requireLeadership, async (c) => {
  const user = (await currentUser(c))!;
  const id = param(c, 'id');
  const body = await c.req.json<Record<string, unknown>>();

  const reason = String(body.reason ?? '').trim();
  if (reason.length < 10) {
    return c.json(
      { error: 'Say why this is being corrected — it is kept with the previous wording.' },
      400,
    );
  }

  const current = await first<Record<string, unknown>>(
    c.env.DB,
    'SELECT * FROM sharing_guidelines WHERE id = ? AND org_id = ? AND deleted_at IS NULL',
    id, user.org_id,
  );
  if (!current) return c.json({ error: 'That guideline version was not found.' }, 404);

  const usage = await guidelineUsage(c.env, user.org_id, current.version as string, id);
  const verdict = canChange('correction', usage);
  const now = nowIso();

  await c.env.DB.batch([
    // Archive first. If the update failed after this, the worst outcome is a
    // revision row for a change that did not happen — recoverable, and visibly
    // odd. The other order loses the previous text outright.
    c.env.DB.prepare(
      `INSERT INTO guideline_revisions
         (id, org_id, guideline_id, snapshot, reason, corrected_by, corrected_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(newId('guidelineRevision'), user.org_id, id, JSON.stringify(current), reason, user.id, now),
    c.env.DB.prepare(
      `UPDATE sharing_guidelines
          SET effective_from = ?, effective_to = ?, published_url = ?, provisions = ?, updated_at = ?
        WHERE id = ? AND org_id = ?`,
    ).bind(
      body.effective_from ?? current.effective_from,
      body.effective_to ?? current.effective_to ?? null,
      body.published_url ?? current.published_url ?? null,
      JSON.stringify(body.provisions ?? json(current.provisions as string, [])),
      now, id, user.org_id,
    ),
  ]);

  await audit(c.env.DB, {
    orgId: user.org_id, actorId: user.id, actorKind: 'user', action: 'guideline.corrected',
    subjectType: 'org', subjectId: user.org_id,
    meta: { version: current.version, reason, rescores: verdict.rescores, ...usage },
  });

  // Findings are recomputed from the current text rather than stored, so busting
  // the cache *is* the re-audit. That is deliberate: a re-score that wrote a
  // second stored opinion would immediately be able to disagree with the live
  // one, and there would be no way to tell which was right.
  await c.env.CACHE.delete(`integrity:${user.org_id}`).catch(() => {});

  return c.json({ id, rescores: verdict.rescores, impact: correctionImpact(usage) });
});

/**
 * Withdraw a version published by mistake.
 *
 * Refused the moment anything depends on it, and the refusal says what to do
 * instead. A ministry told only "you cannot delete this" learns nothing and will
 * publish a near-duplicate version to get around it — which muddles which
 * document binds which members, and is worse than the mistake it was working
 * around.
 */
integrity.delete('/guidelines/:id', requireLeadership, async (c) => {
  const user = (await currentUser(c))!;
  const id = param(c, 'id');

  const current = await first<{ version: string }>(
    c.env.DB,
    'SELECT version FROM sharing_guidelines WHERE id = ? AND org_id = ? AND deleted_at IS NULL',
    id, user.org_id,
  );
  if (!current) return c.json({ error: 'That guideline version was not found.' }, 404);

  const usage = await guidelineUsage(c.env, user.org_id, current.version, id);
  const verdict = canChange('withdrawal', usage);
  if (!verdict.allowed) return c.json({ error: verdict.reason, usage }, 409);

  await run(
    c.env.DB,
    'UPDATE sharing_guidelines SET deleted_at = ?, updated_at = ? WHERE id = ? AND org_id = ?',
    nowIso(), nowIso(), id, user.org_id,
  );

  await audit(c.env.DB, {
    orgId: user.org_id, actorId: user.id, actorKind: 'user', action: 'guideline.withdrawn',
    subjectType: 'org', subjectId: user.org_id, meta: { version: current.version },
  });
  await c.env.CACHE.delete(`integrity:${user.org_id}`).catch(() => {});

  return c.json({ ok: true });
});

/** What a version was corrected from, newest first. */
integrity.get('/guidelines/:id/revisions', async (c) => {
  const user = (await currentUser(c))!;
  const rows = await all<Record<string, unknown>>(
    c.env.DB,
    `SELECT r.id, r.reason, r.corrected_at, u.name AS corrected_by, r.snapshot
       FROM guideline_revisions r LEFT JOIN users u ON u.id = r.corrected_by
      WHERE r.org_id = ? AND r.guideline_id = ?
      ORDER BY r.corrected_at DESC`,
    user.org_id, param(c, 'id'),
  );
  return c.json({
    items: rows.map((r) => ({ ...r, snapshot: json(r.snapshot as string, {}) })),
  });
});

/**
 * How many decisions depend on a version.
 *
 * The two halves are asked completely differently, and the reason is worth
 * knowing before changing either.
 *
 * **Applications** carry `guideline_version_id` — a real foreign key to this
 * row. Exact.
 *
 * **Declines do not.** A decline records `denial_guideline_ref`, which is a
 * *provision code* ("HOSP-1"), not a version label. So the question "which
 * declines depend on this version" has no join that answers it: the same code
 * legitimately appears in v2.0 and v2.1, and which version actually governed a
 * given decline is a computation over the ministry's declared governing rule and
 * that decline's anchor date — `auditDenials` does it, and it needs the whole
 * fact set.
 *
 * So this counts every decline citing a code this version contains, which
 * **over-counts** when a code spans versions. That is the deliberate direction:
 * the only thing this number can block is a withdrawal, and refusing to remove a
 * document that might be cited is a great deal better than removing one that is.
 */
async function guidelineUsage(env: Env, orgId: string, _version: string, id: string) {
  const guideline = await first<{ provisions: string }>(
    env.DB,
    'SELECT provisions FROM sharing_guidelines WHERE id = ? AND org_id = ?',
    id, orgId,
  );

  const codes = json<{ code?: string }[]>(guideline?.provisions ?? '[]', [])
    .map((p) => p.code)
    .filter((c): c is string => Boolean(c));

  const applications = await first<{ n: number }>(
    env.DB,
    `SELECT COUNT(*) AS n FROM member_applications
      WHERE org_id = ? AND deleted_at IS NULL AND guideline_version_id = ?`,
    orgId, id,
  );

  // A version with no provisions cannot be cited by anything, and an empty IN ()
  // is a syntax error rather than an empty result.
  const denials = codes.length === 0
    ? { n: 0 }
    : await first<{ n: number }>(
        env.DB,
        `SELECT COUNT(*) AS n FROM needs
          WHERE org_id = ? AND deleted_at IS NULL
            AND denial_guideline_ref IN (${codes.map(() => '?').join(', ')})`,
        orgId, ...codes,
      );

  return { denials: denials?.n ?? 0, applications: applications?.n ?? 0 };
}

export default integrity;
