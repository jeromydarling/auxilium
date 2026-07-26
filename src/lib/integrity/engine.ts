import type { ReasonCode } from '../nri/types';
import type {
  IntegrityFacts, IntegrityReport, IntegrityBand, DenialFinding, GuidelineVersion, DenialFacts,
} from './types';
import { ACA_MLR_INDIVIDUAL_BPS, ACA_MLR_LARGE_GROUP_BPS } from './types';
import { evaluateIntegrityRules, INTEGRITY_RULES_VERSION } from './rules';
import { shareRatioBps, combineLedgers, emptyLedger, formatBps } from './mlr';

/**
 * The integrity engine.
 *
 * Facts in, a defensible report out. Pure, deterministic, and free of any
 * Cloudflare or React import — the same discipline as the NRI engine, for the
 * same reason: a score that cannot be reproduced offline from the same ledger
 * is worth nothing in the moment someone disputes it.
 *
 * Scores run the opposite direction from NRI. Here 100 is good — this measures
 * whether the ministry is keeping its promise, so higher is healthier.
 */

const BAND_FLOORS: { band: IntegrityBand; min: number }[] = [
  { band: 'healthy', min: 85 },
  { band: 'watch', min: 70 },
  { band: 'concern', min: 50 },
  { band: 'critical', min: 0 },
];

export function bandForIntegrityScore(score: number): IntegrityBand {
  for (const { band, min } of BAND_FLOORS) {
    if (score >= min) return band;
  }
  return 'critical';
}

export const INTEGRITY_BAND_LABEL: Record<IntegrityBand, string> = {
  healthy: 'Healthy',
  watch: 'Watch',
  concern: 'Concern',
  critical: 'Critical',
};

export function computeIntegrity(
  facts: IntegrityFacts,
  now: string = new Date().toISOString(),
): IntegrityReport {
  const reasons = evaluateIntegrityRules(facts, now);

  const deductions = reasons.reduce((sum, r) => sum + r.weight, 0);
  const score = Math.max(0, Math.min(100, 100 - deductions));
  const band = bandForIntegrityScore(score);

  const current = facts.ledger[0] ?? emptyLedger(period(now));
  const trailing = combineLedgers(facts.ledger.slice(0, 3));

  const currentRatio = shareRatioBps(current.shared_cents, current.contributions_cents);
  const trailingRatio = shareRatioBps(trailing.shared_cents, trailing.contributions_cents);

  return {
    org_id: facts.org_id,
    period: current.period,
    score,
    band,
    share_ratio_bps: currentRatio,
    trailing_share_ratio_bps: trailingRatio,
    totals: current,
    reason_codes: reasons,
    summary: summarize(score, band, trailingRatio, reasons),
    recommended_actions: recommendedActions(reasons),
    benchmark: {
      aca_individual_bps: ACA_MLR_INDIVIDUAL_BPS,
      aca_large_group_bps: ACA_MLR_LARGE_GROUP_BPS,
      ministry_target_bps: facts.target_share_ratio_bps,
      meets_ministry_target: trailingRatio >= facts.target_share_ratio_bps,
      meets_aca_individual: trailingRatio >= ACA_MLR_INDIVIDUAL_BPS,
    },
    computed_at: now,
  };
}

/**
 * A sentence a board member could read aloud without translation. Assembled
 * from the reasons themselves so it can never drift from the number beside it.
 */
function summarize(
  score: number,
  band: IntegrityBand,
  trailingRatio: number,
  reasons: ReasonCode[],
): string {
  const ratio = `${formatBps(trailingRatio)} of contributions reached members' medical costs over the last three months`;

  if (reasons.length === 0) {
    return `${ratio}. Nothing in the ledger or the claims record calls for attention.`;
  }

  const opener =
    band === 'critical' ? 'Integrity is critical'
    : band === 'concern' ? 'Integrity needs immediate attention'
    : band === 'watch' ? 'Integrity is worth watching'
    : 'Integrity is healthy, with minor notes';

  const top = reasons.slice(0, 3).map((r) => r.detail ?? r.label.toLowerCase());
  const list =
    top.length === 1 ? top[0]
    : top.length === 2 ? `${top[0]}; ${top[1]}`
    : `${top.slice(0, -1).join('; ')}; and ${top[top.length - 1]}`;

  const more = reasons.length > 3 ? ` (+${reasons.length - 3} more findings)` : '';

  return `${opener} (${score}/100). ${ratio}. ${list}${more}.`;
}

/**
 * What to do about it. Mapped from the reasons that actually fired — generic
 * advice on a compliance screen is worse than none, because it teaches people
 * the screen is decorative.
 */
function recommendedActions(reasons: ReasonCode[]): string[] {
  const actions: string[] = [];
  const codes = new Set(reasons.map((r) => r.code));

  if (codes.has('integrity.zero_share_periods')) {
    actions.push(
      'Establish why no funds were disbursed while contributions were received, and publish the ' +
      'explanation to members before they ask.',
    );
  }
  if (codes.has('integrity.share_ratio_critical') || codes.has('integrity.share_ratio_below_target')) {
    actions.push(
      'Reconcile the sharing pool against the published commitment and bring the ratio back to ' +
      'target, or amend the published commitment honestly.',
    );
  }
  if (codes.has('integrity.related_party_payments')) {
    actions.push(
      'Disclose every related-party payment to the board with the relationship stated, and record ' +
      'the business justification for each.',
    );
  }
  if (codes.has('integrity.overhead_exceeds_sharing')) {
    actions.push('Reduce administrative and marketing spend until sharing exceeds overhead.');
  }
  if (codes.has('integrity.denials_without_guideline')) {
    actions.push(
      'Require every denial to cite the guideline provision that permits it. Re-review the ' +
      'denials that cite nothing.',
    );
  }
  if (codes.has('integrity.retroactive_guideline')) {
    actions.push(
      'Reverse any denial applying a guideline that post-dates the date your own published policy ' +
      'makes controlling, and honor the version that policy points at.',
    );
  }
  if (codes.has('integrity.denial_reason_unsupported')) {
    actions.push(
      'Re-review denials whose stated reason the cited provision does not authorize, and correct ' +
      'either the denial or the guideline.',
    );
  }
  if (codes.has('integrity.no_published_guidelines')) {
    actions.push('Publish a dated, versioned set of sharing guidelines members can actually read.');
  }
  if (codes.has('integrity.sla_breach_rate') || codes.has('integrity.severe_sla_breach')) {
    actions.push(
      'Assign an owner to every claim past its commitment today, and tell those members where ' +
      'their claim stands.',
    );
  }
  if (codes.has('integrity.overdue_appeals')) {
    actions.push('Decide the overdue appeals, or tell those members when they will be decided.');
  }
  if (codes.has('integrity.payee_concentration')) {
    actions.push('Review the concentration of non-share spending with a single payee.');
  }

  return actions;
}

/**
 * Per-denial guideline-consistency findings.
 *
 * The org-level rules answer "is there a pattern?". This answers "which
 * specific denials should a human re-open?", which is what actually gets
 * someone's bill paid.
 */
export function auditDenials(
  facts: IntegrityFacts,
): DenialFinding[] {
  const provisions = new Map(
    facts.guidelines.flatMap((g) =>
      g.provisions.map((p) => [p.code, { provision: p, version: g }] as const),
    ),
  );

  const findings: DenialFinding[] = [];

  // Which date the ministry's own published policy makes controlling. Four are
  // in force across the category, so assuming enrolment universally would flag
  // a time-of-service ministry every time it followed its own rules. Undeclared
  // falls back to enrolment, the reading most protective of the member.
  const policy = facts.governing_version_rule ?? 'member_join';
  const governingDate = (d: DenialFacts): { date: string; label: string } | null => {
    switch (policy) {
      case 'date_of_service':
        return d.service_date ? { date: d.service_date, label: 'the care was delivered' } : null;
      case 'date_submitted':
        return d.submitted_at ? { date: d.submitted_at, label: 'the request was submitted' } : null;
      case 'date_received':
        return d.received_at ? { date: d.received_at, label: 'the bills were received' } : null;
      default:
        return d.member_joined_at ? { date: d.member_joined_at, label: 'the member joined' } : null;
    }
  };

  for (const denial of facts.denials) {
    const base = {
      need_id: denial.need_id,
      member_id: denial.member_id,
      amount_requested_cents: denial.amount_requested_cents,
    };

    if (!denial.denial_guideline_ref) {
      findings.push({
        ...base,
        severity: 'serious',
        code: 'denial.no_guideline',
        message:
          'This denial cites no guideline provision. The member has no way to check it and the ' +
          'ministry has no record of the basis.',
      });
      continue;
    }

    const entry = provisions.get(denial.denial_guideline_ref);

    if (!entry) {
      findings.push({
        ...base,
        severity: 'serious',
        code: 'denial.unknown_guideline',
        message: `Cites provision "${denial.denial_guideline_ref}", which does not exist in any published version.`,
      });
      continue;
    }

    const { provision, version } = entry;

    const governing = governingDate(denial);
    if (governing && version.effective_from > governing.date.slice(0, 10)) {
      findings.push({
        ...base,
        severity: 'serious',
        code: 'denial.retroactive',
        message:
          `Applies guideline ${version.version}, effective ${version.effective_from}, to a need ` +
          `where ${governing.label} on ${governing.date.slice(0, 10)} — the date this ministry's ` +
          'own published policy makes controlling. The member never agreed to this rule.',
      });
      continue;
    }

    if (denial.denial_reason_code && !provision.supports_denial_codes.includes(denial.denial_reason_code)) {
      findings.push({
        ...base,
        severity: 'warning',
        code: 'denial.reason_unsupported',
        message:
          `Denied for "${denial.denial_reason_code}", but provision ${provision.code} does not ` +
          `authorize that reason. It permits: ${provision.supports_denial_codes.join(', ') || 'none'}.`,
      });
      continue;
    }

    if (!denial.denial_reason_code) {
      findings.push({
        ...base,
        severity: 'warning',
        code: 'denial.no_reason_code',
        message: 'Cites a guideline provision but records no reason code, so the denial cannot be categorized.',
      });
    }
  }

  // Most consequential first: severity, then dollars at stake.
  const rank = { serious: 0, warning: 1, info: 2 } as const;
  return findings.sort(
    (a, b) => rank[a.severity] - rank[b.severity] || b.amount_requested_cents - a.amount_requested_cents,
  );
}

/** The guideline version in force on a given date. */
export function guidelineInForce(
  guidelines: GuidelineVersion[],
  onDate: string,
): GuidelineVersion | null {
  const day = onDate.slice(0, 10);
  const applicable = guidelines.filter(
    (g) => g.effective_from <= day && (!g.effective_to || g.effective_to >= day),
  );
  if (applicable.length === 0) return null;
  // Latest effective_from wins when versions overlap.
  return applicable.sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0];
}

function period(iso: string): string {
  return iso.slice(0, 7);
}

export { INTEGRITY_RULES_VERSION };
