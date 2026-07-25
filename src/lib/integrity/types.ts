import type { ReasonCode } from '../nri/types';

/**
 * Claims integrity — the organizational counterpart to NRI.
 *
 * NRI asks "which member needs attention?". This layer asks "is this ministry
 * keeping its promise?", and it is deliberately built to be answerable by
 * someone outside the ministry: a board member, an auditor, a regulator, a
 * journalist.
 *
 * The design constraint is the same as NRI's and matters more here: every
 * number is a sum of named, weighted reasons over facts drawn from a ledger.
 * An integrity score that could not be reproduced by hand from the same
 * contributions and disbursements would be worthless in exactly the moment it
 * is needed.
 */

export type IntegrityBand = 'healthy' | 'watch' | 'concern' | 'critical';

/** Basis points keep the whole ratio calculation in integer arithmetic. */
export const BPS = 10_000;

/**
 * The ACA medical-loss-ratio floors. HCSMs are statutorily exempt from these —
 * which is the entire point of measuring against them anyway. A ministry that
 * can show it clears the bar it is not held to has said something no
 * competitor's marketing can.
 */
export const ACA_MLR_INDIVIDUAL_BPS = 8_000;  // 80%
export const ACA_MLR_LARGE_GROUP_BPS = 8_500; // 85%

/** One period's ledger totals. The raw material for every ratio below. */
export interface PeriodLedger {
  period: string;                 // 'YYYY-MM'
  contributions_cents: number;    // kind = 'share' only
  fees_cents: number;             // kind = 'fee'
  shared_cents: number;           // disbursements category = 'share'
  administrative_cents: number;
  marketing_cents: number;
  related_party_cents: number;
  /** Distinct members who received a share this period. */
  members_shared_with: number;
  /** Largest single non-share payee this period, for concentration checks. */
  top_payee_name: string | null;
  top_payee_cents: number;
}

/**
 * Everything the integrity rules read. As with NRI facts, rules touch nothing
 * else — no database, no clock beyond the `now` passed in.
 */
export interface IntegrityFacts {
  org_id: string;
  /** Most recent period first. Rules use several periods to see drift. */
  ledger: PeriodLedger[];
  /** The ministry's own published commitment, in basis points. */
  target_share_ratio_bps: number;
  /** Denials in the window, for guideline-consistency scoring. */
  denials: DenialFacts[];
  /** Guideline versions in force across the window. */
  guidelines: GuidelineVersion[];
  /** Open claims past their SLA, and by how far. */
  sla_breaches: { need_id: string; days_over: number }[];
  /** Appeals past their own due date. */
  overdue_appeals: number;
  /** Total open claims, for breach-rate context. */
  open_claim_count: number;
}

export interface DenialFacts {
  need_id: string;
  member_id: string;
  /** When the member joined — decides which guideline version binds them. */
  member_joined_at: string | null;
  denied_at: string;
  denial_reason_code: string | null;
  denial_guideline_ref: string | null;
  amount_requested_cents: number;
  category: string;
}

export interface GuidelineVersion {
  version: string;
  effective_from: string;
  effective_to: string | null;
  provisions: GuidelineProvision[];
}

export interface GuidelineProvision {
  code: string;
  statement: string;
  /**
   * The denial reason codes this provision actually authorizes.
   *
   * This is the load-bearing field of the whole integrity layer. The pattern
   * behind nearly every case in the research is a ministry marketing
   * "covered from day one" and then denying on precisely that basis. If a
   * denial cites a reason no published provision supports, the ministry has
   * departed from its own rules — and that is now visible the week it happens
   * rather than in a deposition three years later.
   */
  supports_denial_codes: string[];
  waiting_period_days?: number;
  annual_limit_cents?: number;
  category?: string;
}

/** A computed integrity reading for one period. */
export interface IntegrityReport {
  org_id: string;
  period: string;
  /** 0–100. Higher is better — the inverse of NRI, where higher means worse. */
  score: number;
  band: IntegrityBand;
  share_ratio_bps: number;
  /** Ratio over the trailing window, which is what a regulator would ask for. */
  trailing_share_ratio_bps: number;
  totals: PeriodLedger;
  /** Named, weighted reasons. Deductions from 100. */
  reason_codes: ReasonCode[];
  /** Plain sentence a board member could read aloud. */
  summary: string;
  /** What to actually do about it. */
  recommended_actions: string[];
  benchmark: {
    aca_individual_bps: number;
    aca_large_group_bps: number;
    ministry_target_bps: number;
    meets_ministry_target: boolean;
    meets_aca_individual: boolean;
  };
  computed_at: string;
}

/** One guideline-consistency finding about a single denial. */
export interface DenialFinding {
  need_id: string;
  member_id: string;
  severity: 'info' | 'warning' | 'serious';
  code: string;
  message: string;
  amount_requested_cents: number;
}
