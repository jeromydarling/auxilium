import { Hono } from 'hono';
import { intVar } from '../lib/env';
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

export default integrity;
