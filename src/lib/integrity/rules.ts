import type { ReasonCode } from '../nri/types';
import type { IntegrityFacts, PeriodLedger } from './types';
import { ACA_MLR_INDIVIDUAL_BPS } from './types';
import {
  shareRatioBps, overheadRatioBps, ratioDriftBps, consecutiveZeroShareperiods,
  combineLedgers, formatBps,
} from './mlr';

/**
 * The integrity rule set, version 1.
 *
 * Each rule is a deduction from a starting score of 100, and each carries the
 * case it was written from. That provenance is deliberate: when a ministry
 * asks why the system is flagging them, the answer should be a specific,
 * documented failure that happened to a real community, not an abstraction.
 *
 * Weights are calibrated so that:
 *   • the Aliera pattern (16% share ratio) scores critical on the ratio alone
 *   • the MCS pattern (collect, share nothing) scores critical on the zero-share
 *     run alone, even before the ratio has enough history to be meaningful
 *   • an honest ministry having a slow quarter lands in 'watch', not 'concern'
 *
 * Same discipline as NRI: deductions are named, weighted, and sum to the score.
 */

export interface IntegrityRule {
  code: string;
  label: string;
  /** Points deducted from 100 when this matches, unless evaluate overrides. */
  weight: number;
  /** The real-world failure this rule was written from. */
  provenance: string;
  evaluate: (facts: IntegrityFacts, now: string) => IntegrityOutcome;
}

export type IntegrityOutcome =
  | { matched: false }
  | { matched: true; detail: string; weight?: number };

const NO: IntegrityOutcome = { matched: false };
const hit = (detail: string, weight?: number): IntegrityOutcome =>
  weight === undefined ? { matched: true, detail } : { matched: true, detail, weight };

/** The trailing window every ratio rule reads. Three months smooths a lumpy month. */
const WINDOW = 3;

/**
 * Minimum observations before a rate is treated as a rate.
 *
 * "1 of 1 denials" is a 100% rate carrying almost no information. Without a
 * floor, a small ministry with a single lapse scores like Aliera — and a score
 * that cannot distinguish those two is one nobody will trust a second time.
 * Below this, the rules score the absolute count instead.
 */
const MIN_RATE_SAMPLE = 5;

function trailing(facts: IntegrityFacts): PeriodLedger {
  return combineLedgers(facts.ledger.slice(0, WINDOW));
}

export const INTEGRITY_RULES: IntegrityRule[] = [
  // ── Where the money actually went ──────────────────────────────────────────
  {
    code: 'integrity.share_ratio_critical',
    label: 'Share ratio far below the ACA floor',
    weight: 55,
    provenance:
      'California alleged Aliera retained nearly 84% of member contributions, leaving 16 cents ' +
      'of every dollar for medical costs. Members recovered 1–5% of what they were owed.',
    evaluate: (f) => {
      const t = trailing(f);
      if (t.contributions_cents === 0) return NO;
      const ratio = shareRatioBps(t.shared_cents, t.contributions_cents);
      if (ratio >= 5_000) return NO;
      // Below 25% is the Aliera range and deserves the full weight; 25–50% is
      // severe but not yet indistinguishable from a collapsing ministry.
      return hit(
        `Only ${formatBps(ratio)} of contributions went to sharing over the last ${WINDOW} months`,
        ratio < 2_500 ? 55 : 40,
      );
    },
  },
  {
    code: 'integrity.share_ratio_below_target',
    label: 'Share ratio below the ministry’s own commitment',
    weight: 20,
    provenance:
      'A ministry that publishes a sharing commitment and quietly falls below it has broken the ' +
      'only promise members can actually check.',
    evaluate: (f) => {
      const t = trailing(f);
      if (t.contributions_cents === 0) return NO;
      const ratio = shareRatioBps(t.shared_cents, t.contributions_cents);
      if (ratio >= f.target_share_ratio_bps) return NO;
      if (ratio < 5_000) return NO; // already covered, and more severely, above
      const gap = f.target_share_ratio_bps - ratio;
      return hit(
        `${formatBps(ratio)} against a published commitment of ${formatBps(f.target_share_ratio_bps)}`,
        gap > 1_500 ? 25 : 20,
      );
    },
  },
  {
    code: 'integrity.zero_share_periods',
    label: 'Contributions collected, nothing shared',
    weight: 60,
    provenance:
      'Medical Cost Sharing collected $7.5 million and shared $245,982 — 3.5% — distributing ' +
      'nothing at all to members from February 2021 onward while continuing to take payments.',
    evaluate: (f) => {
      const run = consecutiveZeroShareperiods(f.ledger);
      if (run === 0) return NO;
      if (run === 1) {
        return hit('One month with contributions received and nothing shared', 15);
      }
      // Two months is a serious operational failure; three or more is the
      // pattern that ended in federal action.
      return hit(
        `${run} consecutive months with contributions received and nothing shared`,
        run >= 3 ? 60 : 35,
      );
    },
  },
  {
    code: 'integrity.ratio_falling',
    label: 'Share ratio falling',
    weight: 20,
    provenance:
      'No ministry goes from healthy to 16% in one month. It slides, and every individual month ' +
      'looks defensible in isolation.',
    evaluate: (f) => {
      const drift = ratioDriftBps(f.ledger, WINDOW);
      if (drift >= -500) return NO; // less than 5 points of movement is noise
      return hit(
        `Share ratio fell ${formatBps(Math.abs(drift))} against the prior ${WINDOW} months`,
        drift <= -1_500 ? 30 : 20,
      );
    },
  },

  // ── Where money went instead ───────────────────────────────────────────────
  {
    code: 'integrity.related_party_payments',
    label: 'Payments to related parties',
    weight: 35,
    provenance:
      'MCS owners moved at least $4 million of member contributions into personal accounts for ' +
      'vacations and vehicles. It took years and an FBI investigation to surface.',
    evaluate: (f) => {
      const t = trailing(f);
      if (t.related_party_cents === 0 || t.contributions_cents === 0) return NO;
      const ratio = shareRatioBps(t.related_party_cents, t.contributions_cents);
      // Any related-party payment is worth disclosing; the weight scales with
      // how much of the pool it represents.
      if (ratio < 100) {
        return hit(`${formatBps(ratio)} of contributions went to related parties`, 5);
      }
      return hit(
        `${formatBps(ratio)} of contributions went to related parties ` +
        `($${(t.related_party_cents / 100).toLocaleString('en-US')})`,
        ratio >= 1_000 ? 45 : ratio >= 500 ? 35 : 20,
      );
    },
  },
  {
    code: 'integrity.overhead_exceeds_sharing',
    label: 'Overhead exceeds sharing',
    weight: 40,
    provenance:
      'When administration, marketing, and related-party payments together outweigh what reaches ' +
      'members\' medical bills, the organization has stopped being a sharing ministry in substance.',
    evaluate: (f) => {
      const t = trailing(f);
      if (t.contributions_cents === 0) return NO;
      const overhead = t.administrative_cents + t.marketing_cents + t.related_party_cents;
      if (overhead <= t.shared_cents) return NO;
      return hit(
        `Overhead of $${(overhead / 100).toLocaleString('en-US')} exceeded sharing of ` +
        `$${(t.shared_cents / 100).toLocaleString('en-US')}`,
      );
    },
  },
  {
    code: 'integrity.payee_concentration',
    label: 'Non-share spending concentrated on one payee',
    weight: 15,
    provenance:
      'Diversion usually runs through a small number of vendors rather than many. Concentration ' +
      'is not proof of anything, but it is the right place to look first.',
    evaluate: (f) => {
      const t = trailing(f);
      const overhead = t.administrative_cents + t.marketing_cents + t.related_party_cents;
      if (overhead === 0 || !t.top_payee_name) return NO;
      const share = shareRatioBps(t.top_payee_cents, overhead);
      if (share < 6_000) return NO;
      return hit(
        `${formatBps(share)} of non-share spending went to a single payee (${t.top_payee_name})`,
      );
    },
  },

  // ── Whether the ministry follows its own rules ─────────────────────────────
  {
    code: 'integrity.denials_without_guideline',
    label: 'Denials citing no published guideline',
    weight: 30,
    provenance:
      'Members across several ministries describe the same experience: a denial with no stated ' +
      'basis and no way to appeal it. A denial that cites nothing cannot be checked by anyone.',
    evaluate: (f) => {
      const unbacked = f.denials.filter((d) => !d.denial_guideline_ref);
      if (unbacked.length === 0) return NO;
      const amount = unbacked.reduce((sum, d) => sum + d.amount_requested_cents, 0);
      const detail =
        `${unbacked.length} of ${f.denials.length} denials cite no guideline provision ` +
        `($${(amount / 100).toLocaleString('en-US')} denied)`;

      // Below the sample floor, score the count rather than the rate. "1 of 1"
      // is a 100% rate and almost no information — without this a small
      // ministry with a single lapse scores like Aliera, and a score that
      // cannot tell those apart is one nobody will believe twice.
      if (f.denials.length < MIN_RATE_SAMPLE) {
        return hit(detail, Math.min(20, unbacked.length * 10));
      }

      const rate = unbacked.length / f.denials.length;
      return hit(detail, rate >= 0.5 ? 40 : rate >= 0.25 ? 30 : 15);
    },
  },
  {
    code: 'integrity.retroactive_guideline',
    label: 'Denials under a guideline version the ministry’s own policy does not make governing',
    weight: 45,
    provenance:
      'The signature pattern of this category: market coverage "from day one", then deny on ' +
      'exactly that basis under rules the member never agreed to. What makes it checkable is ' +
      'that ministries publish which version governs — and they do not agree. Four rules are in ' +
      'force across the category: the version at enrolment, at date of service, at submission, ' +
      'and at the date bills were received. So this does not score "a newer guideline was ' +
      'applied", which would fire on a time-of-service ministry following its own published ' +
      'policy correctly. It scores a denial reaching for a version that took effect after the ' +
      'date the ministry itself says is controlling. A rule that fires on correct behaviour ' +
      'teaches staff to dismiss the whole report.',
    evaluate: (f) => {
      // Absent a declared policy, fall back to enrolment — the strictest of the
      // four, and the safe default for a ministry that has not said.
      const policy = f.governing_version_rule ?? 'member_join';

      const anchorFor = (d: (typeof f.denials)[number]): string | null => {
        switch (policy) {
          case 'date_of_service': return d.service_date ?? null;
          case 'date_submitted': return d.submitted_at ?? null;
          case 'date_received': return d.received_at ?? null;
          default: return d.member_joined_at;
        }
      };

      const retroactive = f.denials.filter((d) => {
        if (!d.denial_guideline_ref) return false;
        const anchor = anchorFor(d);
        // No anchor date means we cannot tell, and cannot-tell is not a finding.
        if (!anchor) return false;
        const version = f.guidelines.find((g) =>
          g.provisions.some((p) => p.code === d.denial_guideline_ref),
        );
        if (!version) return false;
        return version.effective_from > anchor.slice(0, 10);
      });
      if (retroactive.length === 0) return NO;

      const anchorLabel =
        policy === 'date_of_service' ? 'the care was delivered'
        : policy === 'date_submitted' ? 'the request was submitted'
        : policy === 'date_received' ? 'the bills were received'
        : 'the member joined';

      return hit(
        `${retroactive.length} denial${retroactive.length > 1 ? 's' : ''} applied a guideline ` +
        `that took effect after ${anchorLabel}, which is the date this ministry's own published ` +
        'policy makes controlling',
      );
    },
  },
  {
    code: 'integrity.denial_reason_unsupported',
    label: 'Denial reasons the cited guideline does not authorize',
    weight: 35,
    provenance:
      'A denial that cites a real provision for a reason that provision does not actually support ' +
      'is how a ministry drifts away from its own published rules without ever amending them.',
    evaluate: (f) => {
      const provisions = new Map(
        f.guidelines.flatMap((g) => g.provisions.map((p) => [p.code, p] as const)),
      );
      const unsupported = f.denials.filter((d) => {
        if (!d.denial_guideline_ref || !d.denial_reason_code) return false;
        const provision = provisions.get(d.denial_guideline_ref);
        if (!provision) return true; // cites a provision that does not exist
        return !provision.supports_denial_codes.includes(d.denial_reason_code);
      });
      if (unsupported.length === 0) return NO;
      return hit(
        `${unsupported.length} denial${unsupported.length > 1 ? 's cite' : ' cites'} a provision ` +
        'that does not support the stated reason',
      );
    },
  },
  {
    code: 'integrity.no_published_guidelines',
    label: 'No published sharing guidelines',
    weight: 25,
    provenance:
      'Members cannot be held to rules they were never shown, and a ministry cannot demonstrate ' +
      'consistency without a dated, versioned record of what it promised.',
    evaluate: (f) => {
      if (f.guidelines.length > 0) return NO;
      return hit('No guideline version is on record for this ministry');
    },
  },

  // ── Whether claims actually move ───────────────────────────────────────────
  {
    code: 'integrity.sla_breach_rate',
    label: 'Claims past their turnaround commitment',
    weight: 25,
    provenance:
      'A Raleigh family carried their newborn\'s bills for months against a stated 17-day ' +
      'turnaround, because the ministry lost a vendor and nothing escalated automatically.',
    evaluate: (f) => {
      if (f.sla_breaches.length === 0) return NO;
      const worst = Math.max(...f.sla_breaches.map((b) => b.days_over));
      const detail =
        `${f.sla_breaches.length} of ${f.open_claim_count} open claims are past their commitment ` +
        `(worst: ${worst} days over)`;

      // Same sample floor as above. Three of four claims late is a bad week at
      // a small ministry, not evidence of an organization in collapse.
      if (f.open_claim_count < MIN_RATE_SAMPLE) {
        return hit(detail, Math.min(20, f.sla_breaches.length * 8));
      }

      const rate = f.sla_breaches.length / f.open_claim_count;
      return hit(detail, rate >= 0.5 ? 35 : rate >= 0.25 ? 25 : 15);
    },
  },
  {
    code: 'integrity.severe_sla_breach',
    label: 'Claims months past their commitment',
    weight: 30,
    provenance:
      'Orlando Health sued Liberty HealthShare for $1.1 million in unpaid claims. Asked to verify ' +
      'the balances, Liberty could not produce patient names, procedures, dates, or account numbers.',
    evaluate: (f) => {
      const severe = f.sla_breaches.filter((b) => b.days_over >= 60);
      if (severe.length === 0) return NO;
      return hit(
        `${severe.length} claim${severe.length > 1 ? 's are' : ' is'} more than 60 days past ` +
        'the turnaround commitment',
      );
    },
  },
  {
    code: 'integrity.overdue_appeals',
    label: 'Appeals past their due date',
    weight: 20,
    provenance:
      'Members describe having "no way to appeal a decision or denial". An appeals process that ' +
      'exists but does not run on time is the same experience with extra steps.',
    evaluate: (f) => {
      if (f.overdue_appeals === 0) return NO;
      return hit(
        `${f.overdue_appeals} appeal${f.overdue_appeals > 1 ? 's are' : ' is'} past the ` +
        'ministry\'s own response window',
        f.overdue_appeals >= 5 ? 30 : 20,
      );
    },
  },
];

export const INTEGRITY_RULES_VERSION = 'integrity.v1';

export function integrityRuleByCode(code: string): IntegrityRule | undefined {
  return INTEGRITY_RULES.find((r) => r.code === code);
}

/** Overhead ratio helper re-exported for the API's summary payload. */
export { overheadRatioBps, ACA_MLR_INDIVIDUAL_BPS };

/** Deductions, in the same shape NRI reasons use, so one component renders both. */
export function evaluateIntegrityRules(
  facts: IntegrityFacts,
  now: string,
): ReasonCode[] {
  const reasons: ReasonCode[] = [];
  for (const rule of INTEGRITY_RULES) {
    const outcome = rule.evaluate(facts, now);
    if (!outcome.matched) continue;
    reasons.push({
      code: rule.code,
      label: rule.label,
      weight: outcome.weight ?? rule.weight,
      detail: outcome.detail,
    });
  }
  return reasons.sort((a, b) => b.weight - a.weight);
}
