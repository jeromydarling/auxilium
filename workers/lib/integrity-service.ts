import { computeIntegrity, auditDenials, guidelineInForce } from '../../src/lib/integrity/engine';
import type {
  IntegrityFacts, PeriodLedger, GuidelineVersion, DenialFacts, IntegrityReport,
  GoverningVersionRule,
} from '../../src/lib/integrity/types';

/** The four published rules, for validating whatever is in the column. */
const GOVERNING_RULES: GoverningVersionRule[] =
  ['member_join', 'date_of_service', 'date_submitted', 'date_received'];
import { newId } from '../../src/lib/ids';
import { nowIso } from '../../src/lib/utils';
import type { Env } from './env';
import { all, first, json, run } from './db';

/**
 * The bridge between D1 and the integrity engine.
 *
 * Same split as NRI: everything database-shaped lives here, everything
 * rule-shaped lives in src/lib/integrity. The rules never learn what a D1
 * binding is, which is what keeps the whole layer reproducible offline from an
 * exported ledger — the property that matters most when someone disputes a
 * number.
 */

/** How many months of ledger the rules read. Enough for drift, short enough to stay current. */
const LEDGER_MONTHS = 6;

export async function gatherIntegrityFacts(
  env: Env,
  orgId: string,
  now: string = nowIso(),
): Promise<IntegrityFacts> {
  const [org, ledger, guidelines, denials, breaches, appeals, openClaims] = await Promise.all([
    first<{ target_share_ratio_bps: number; sla_days: number; governing_version_rule: string }>(
      env.DB,
      `SELECT target_share_ratio_bps, sla_days, governing_version_rule
         FROM organizations WHERE id = ?`,
      orgId,
    ),
    loadLedger(env, orgId),
    loadGuidelines(env, orgId),
    loadDenials(env, orgId),
    // Open claims past their committed turnaround, and by how far.
    all<{ need_id: string; days_over: number }>(
      env.DB,
      `SELECT id AS need_id,
              CAST(julianday(?) - julianday(sla_due_at) AS INTEGER) AS days_over
         FROM needs
        WHERE org_id = ? AND deleted_at IS NULL
          AND status NOT IN ('completed', 'declined', 'withdrawn')
          AND sla_due_at IS NOT NULL AND sla_due_at < ?`,
      now, orgId, now,
    ),
    first<{ count: number }>(
      env.DB,
      `SELECT COUNT(*) AS count FROM appeals
        WHERE org_id = ? AND status IN ('submitted', 'in_review', 'more_info')
          AND due_at IS NOT NULL AND due_at < ?`,
      orgId, now,
    ),
    first<{ count: number }>(
      env.DB,
      `SELECT COUNT(*) AS count FROM needs
        WHERE org_id = ? AND deleted_at IS NULL
          AND status NOT IN ('completed', 'declined', 'withdrawn')`,
      orgId,
    ),
  ]);

  return {
    org_id: orgId,
    ledger,
    target_share_ratio_bps: org?.target_share_ratio_bps ?? 8_000,
    // Unrecognised or unset falls back to enrolment — the strictest of the four
    // published rules, and the right default for a ministry that has not said.
    governing_version_rule: GOVERNING_RULES.includes(
      org?.governing_version_rule as GoverningVersionRule,
    )
      ? (org!.governing_version_rule as GoverningVersionRule)
      : 'member_join',
    denials,
    guidelines,
    sla_breaches: breaches.map((b) => ({ need_id: b.need_id, days_over: b.days_over })),
    overdue_appeals: appeals?.count ?? 0,
    open_claim_count: openClaims?.count ?? 0,
  };
}

/**
 * The ledger, newest period first.
 *
 * Contributions and disbursements are summed separately and stitched together
 * by period rather than joined, because a period can legitimately have one and
 * not the other — and a month with money in and nothing out is precisely the
 * signal that must not be lost to an inner join.
 */
async function loadLedger(env: Env, orgId: string): Promise<PeriodLedger[]> {
  const [inflows, outflows, topPayees, sharedWith] = await Promise.all([
    all<{ period: string; share_cents: number; fee_cents: number }>(
      env.DB,
      `SELECT period,
              SUM(CASE WHEN kind = 'share' THEN amount_cents ELSE 0 END) AS share_cents,
              SUM(CASE WHEN kind = 'fee' THEN amount_cents ELSE 0 END) AS fee_cents
         FROM contributions WHERE org_id = ?
        GROUP BY period ORDER BY period DESC LIMIT ?`,
      orgId, LEDGER_MONTHS,
    ),
    all<{
      period: string; shared: number; administrative: number;
      marketing: number; related_party: number;
    }>(
      env.DB,
      `SELECT period,
              SUM(CASE WHEN category = 'share' THEN amount_cents ELSE 0 END) AS shared,
              SUM(CASE WHEN category = 'administrative' THEN amount_cents ELSE 0 END) AS administrative,
              SUM(CASE WHEN category = 'marketing' THEN amount_cents ELSE 0 END) AS marketing,
              SUM(CASE WHEN category = 'related_party' THEN amount_cents ELSE 0 END) AS related_party
         FROM disbursements WHERE org_id = ?
        GROUP BY period ORDER BY period DESC LIMIT ?`,
      orgId, LEDGER_MONTHS,
    ),
    // Largest single non-share payee per period, for the concentration rule.
    all<{ period: string; payee_name: string; total: number }>(
      env.DB,
      `SELECT period, payee_name, SUM(amount_cents) AS total
         FROM disbursements
        WHERE org_id = ? AND category != 'share'
        GROUP BY period, payee_name
        ORDER BY period DESC, total DESC`,
      orgId,
    ),
    all<{ period: string; members: number }>(
      env.DB,
      `SELECT period, COUNT(DISTINCT member_id) AS members
         FROM disbursements
        WHERE org_id = ? AND category = 'share' AND member_id IS NOT NULL
        GROUP BY period`,
      orgId,
    ),
  ]);

  const outflowByPeriod = new Map(outflows.map((o) => [o.period, o]));
  const sharedByPeriod = new Map(sharedWith.map((s) => [s.period, s.members]));

  // First row per period is the top payee, since the query orders by total desc.
  const topByPeriod = new Map<string, { payee_name: string; total: number }>();
  for (const row of topPayees) {
    if (!topByPeriod.has(row.period)) {
      topByPeriod.set(row.period, { payee_name: row.payee_name, total: row.total });
    }
  }

  // Union the periods so a month with only outflows still appears.
  const periods = [...new Set([...inflows.map((i) => i.period), ...outflows.map((o) => o.period)])]
    .sort()
    .reverse()
    .slice(0, LEDGER_MONTHS);

  return periods.map((period) => {
    const inflow = inflows.find((i) => i.period === period);
    const outflow = outflowByPeriod.get(period);
    const top = topByPeriod.get(period);

    return {
      period,
      contributions_cents: inflow?.share_cents ?? 0,
      fees_cents: inflow?.fee_cents ?? 0,
      shared_cents: outflow?.shared ?? 0,
      administrative_cents: outflow?.administrative ?? 0,
      marketing_cents: outflow?.marketing ?? 0,
      related_party_cents: outflow?.related_party ?? 0,
      members_shared_with: sharedByPeriod.get(period) ?? 0,
      top_payee_name: top?.payee_name ?? null,
      top_payee_cents: top?.total ?? 0,
    };
  });
}

async function loadGuidelines(env: Env, orgId: string): Promise<GuidelineVersion[]> {
  const rows = await all<{
    version: string; effective_from: string; effective_to: string | null; provisions: string;
  }>(
    env.DB,
    `SELECT version, effective_from, effective_to, provisions
       FROM sharing_guidelines WHERE org_id = ? ORDER BY effective_from DESC`,
    orgId,
  );

  return rows.map((r) => ({
    version: r.version,
    effective_from: r.effective_from,
    effective_to: r.effective_to,
    provisions: json(r.provisions, []),
  }));
}

/** Denials in the trailing year — long enough to see a pattern, recent enough to act on. */
async function loadDenials(env: Env, orgId: string): Promise<DenialFacts[]> {
  return all<DenialFacts>(
    env.DB,
    `SELECT n.id AS need_id, n.member_id, m.joined_at AS member_joined_at,
            n.service_date, n.submitted_at, n.bills_received_at AS received_at,
            COALESCE(n.last_status_change_at, n.updated_at) AS denied_at,
            n.denial_reason_code, n.denial_guideline_ref,
            n.amount_requested_cents, n.category
       FROM needs n JOIN members m ON m.id = n.member_id
      WHERE n.org_id = ? AND n.status = 'declined' AND n.deleted_at IS NULL
        AND COALESCE(n.last_status_change_at, n.updated_at) >= datetime('now', '-365 days')
      ORDER BY n.amount_requested_cents DESC
      LIMIT 500`,
    orgId,
  );
}

/** Compute and persist the current period's snapshot. */
export async function computeAndStoreIntegrity(
  env: Env,
  orgId: string,
  now: string = nowIso(),
): Promise<IntegrityReport> {
  const facts = await gatherIntegrityFacts(env, orgId, now);
  const report = computeIntegrity(facts, now);

  await run(
    env.DB,
    `INSERT INTO integrity_snapshots
       (id, org_id, period, contributions_cents, shared_cents, administrative_cents,
        marketing_cents, related_party_cents, share_ratio_bps, reason_codes,
        integrity_score, band, computed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (org_id, period) DO UPDATE SET
       contributions_cents = excluded.contributions_cents,
       shared_cents = excluded.shared_cents,
       administrative_cents = excluded.administrative_cents,
       marketing_cents = excluded.marketing_cents,
       related_party_cents = excluded.related_party_cents,
       share_ratio_bps = excluded.share_ratio_bps,
       reason_codes = excluded.reason_codes,
       integrity_score = excluded.integrity_score,
       band = excluded.band,
       computed_at = excluded.computed_at`,
    newId('audit'), orgId, report.period,
    report.totals.contributions_cents, report.totals.shared_cents,
    report.totals.administrative_cents, report.totals.marketing_cents,
    report.totals.related_party_cents, report.share_ratio_bps,
    JSON.stringify(report.reason_codes), report.score, report.band, now,
  );

  await env.CACHE.delete(`integrity:${orgId}`).catch(() => {});
  return report;
}

/** Per-denial findings — which specific claims a human should re-open. */
export async function auditOrgDenials(env: Env, orgId: string) {
  return auditDenials(await gatherIntegrityFacts(env, orgId));
}

/** The guideline version binding a member, given when they joined. */
export async function guidelineForMember(
  env: Env,
  orgId: string,
  onDate: string,
): Promise<GuidelineVersion | null> {
  return guidelineInForce(await loadGuidelines(env, orgId), onDate);
}

export { loadGuidelines };
