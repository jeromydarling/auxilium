import type { NriDirection, NriBand, NriSubjectType } from './directions';
import type {
  MemberStatus, NeedCategory, NeedStatus, NeedUrgency, PrayerCategory, PrayerStatus,
} from '../../types/domain';

/**
 * The facts a signal is computed from.
 *
 * This is the single most important boundary in the NRI layer: rules read
 * *only* this object. They never touch D1, never call a network, never look at
 * the clock except through the `now` passed to the engine. That is what makes
 * every score reproducible — given the same facts and the same timestamp, you
 * get byte-identical output, forever. It is also what makes the whole rule set
 * testable in plain Node with no database.
 */

export interface NeedFacts {
  id: string;
  status: NeedStatus;
  category: NeedCategory;
  urgency: NeedUrgency;
  amount_requested_cents: number;
  submitted_at: string | null;
  last_status_change_at: string | null;
  created_at: string;
  assigned_to: string | null;
}

export interface PrayerFacts {
  id: string;
  category: PrayerCategory;
  status: PrayerStatus;
  is_urgent: boolean;
  created_at: string;
  followup_due_at: string | null;
  last_followup_at: string | null;
}

export interface HouseholdFacts {
  id: string;
  member_count: number;
  dependent_count: number;
  caregiver_count: number;
  share_amount_cents: number;
  /** Household membership rows added or removed in the last 90 days. */
  recent_membership_changes: number;
}

export interface MemberFacts {
  id: string;
  org_id: string;
  status: MemberStatus;
  created_at: string;
  joined_at: string | null;
  last_contact_at: string | null;
  last_response_at: string | null;
  onboarding_complete: boolean;
  financial_stress: boolean;
  household: HouseholdFacts | null;
  /**
   * Whether this member is their household's primary contact.
   *
   * Household-structure facts — size, dependents, caregiving, recent changes —
   * are properties of the *household*, not of each person in it. Scoring them
   * on every member puts eight rows on the triage board for one family and
   * ranks nothing. They are scored on the primary contact instead, because
   * that is the person staff would actually call about the household.
   *
   * A household with no primary marked falls back to true for everyone, so a
   * messy import never silently hides a complex family.
   */
  is_primary_contact: boolean;
  needs: NeedFacts[];
  prayer_requests: PrayerFacts[];
  /**
   * Outreach logged with no member response afterwards. Counted from
   * need_updates of kind 'outreach' plus prayer follow-ups, in the last 120
   * days. This is the "we keep calling and hearing nothing" number.
   */
  unanswered_outreach: number;
}

/**
 * One reason a score is what it is. The `weight` is the exact number of points
 * this reason contributed — the sum of weights (clamped) IS the score, so a
 * staff member can add them up by hand and get the same answer. No hidden
 * multipliers, no learned coefficients.
 */
export interface ReasonCode {
  code: string;
  label: string;
  weight: number;
  detail?: string;
}

export type ReasonSeverity = 'info' | 'notable' | 'serious';

/** A computed signal, before it is persisted. */
export interface NriSignal {
  subject_type: NriSubjectType;
  subject_id: string;
  direction: NriDirection;
  score: number;
  reason_codes: ReasonCode[];
  source: string;
  updated_at: string;
  dismissed: boolean;
  dismissed_at?: string | null;
  dismissed_at_score?: number | null;
}

/**
 * What the API hands the UI. The UI never re-derives "why" — it renders this.
 * Every field here is safe to show a staff member verbatim.
 */
export interface NriExplanation {
  direction: NriDirection;
  label: string;
  score: number;
  band: NriBand;
  /** Human sentence: "Onus is high because …". Generated, never AI-written. */
  summary: string;
  reasons: ReasonCode[];
  /** What the ministry should actually do. From DIRECTION_META.response. */
  recommended_response: string;
  source: string;
  updated_at: string;
  dismissed: boolean;
}

/** A rule is a pure predicate over facts that, when it matches, adds weight. */
export interface NriRule {
  code: string;
  direction: NriDirection;
  label: string;
  /** Points added when this rule matches, unless `evaluate` overrides it. */
  weight: number;
  severity: ReasonSeverity;
  /** Why this rule exists, in plain language. Shown in the admin rule reference. */
  rationale: string;
  evaluate: (facts: MemberFacts, now: string) => RuleOutcome;
}

export type RuleOutcome =
  | { matched: false }
  | { matched: true; detail?: string; weight?: number };

/** Aggregate view of a subject across all four directions. */
export interface NriCompass {
  subject_type: NriSubjectType;
  subject_id: string;
  scores: Record<NriDirection, number>;
  /** Highest-scoring direction. Ties broken by DIRECTION_PRIORITY. */
  dominant: NriDirection;
  /** Highest score across directions — the number used to sort a triage queue. */
  peak: number;
  band: NriBand;
  explanations: NriExplanation[];
}
