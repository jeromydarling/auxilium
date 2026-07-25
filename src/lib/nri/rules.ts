import type { NriRule, RuleOutcome } from './types';
import { daysBetween } from '../utils';

/**
 * The NRI rule set, version 1.
 *
 * Every rule here is a sentence a staff member would say out loud. That is the
 * design constraint: if you cannot explain a rule to a ministry director in one
 * breath, it does not belong in v1. There is no model, no training data, and no
 * learned weight anywhere in this file — a score is a sum of named reasons, and
 * the reasons are always shown alongside it.
 *
 * Weights are calibrated so that:
 *   • a single serious fact lands in "attend" (50–74) on its own
 *   • two serious facts, or one serious plus context, reach "urgent" (75+)
 *   • ordinary background facts accumulate into "watch" (25–49) but never alarm
 *
 * When you add a rule: give it a stable `code` (it is persisted in
 * member_signals.reason_codes and read by old records), write the rationale,
 * and add a test in engine.test.ts pinning the behavior you intend.
 */

const DAY = 1;

/** Small helper so rules read declaratively. */
function match(detail?: string, weight?: number): RuleOutcome {
  return weight === undefined ? { matched: true, detail } : { matched: true, detail, weight };
}
const NO: RuleOutcome = { matched: false };

// ─────────────────────────────────────────────────────────────────────────────
// CURA — care, pastoral attention, prayer
// ─────────────────────────────────────────────────────────────────────────────

const CURA_RULES: NriRule[] = [
  {
    code: 'cura.hospitalization',
    direction: 'cura',
    label: 'Hospitalization',
    weight: 45,
    severity: 'serious',
    rationale:
      'An open hospitalization prayer request means someone is in a hospital bed right now. ' +
      'This is the highest-confidence care signal the system has.',
    evaluate: (f) => {
      const open = f.prayer_requests.filter(
        (p) => p.category === 'hospitalization' && (p.status === 'open' || p.status === 'praying'),
      );
      if (open.length === 0) return NO;
      return match(
        open.length === 1 ? 'Open hospitalization request' : `${open.length} open hospitalization requests`,
      );
    },
  },
  {
    code: 'cura.bereavement',
    direction: 'cura',
    label: 'Bereavement',
    weight: 45,
    severity: 'serious',
    rationale:
      'A death in the household reshapes everything else — billing questions, household ' +
      'membership, renewal. Care comes first and stays elevated for a long while.',
    evaluate: (f) => {
      const open = f.prayer_requests.filter(
        (p) => p.category === 'bereavement' && p.status !== 'closed',
      );
      if (open.length === 0) return NO;
      return match('Recent bereavement in the household');
    },
  },
  {
    code: 'cura.urgent_prayer',
    direction: 'cura',
    label: 'Urgent prayer request',
    weight: 30,
    severity: 'serious',
    rationale: 'Someone flagged this request as urgent. Trust the human who flagged it.',
    evaluate: (f) => {
      const urgent = f.prayer_requests.filter((p) => p.is_urgent && p.status !== 'closed');
      if (urgent.length === 0) return NO;
      return match(`${urgent.length} urgent request${urgent.length > 1 ? 's' : ''} open`);
    },
  },
  {
    code: 'cura.open_prayer',
    direction: 'cura',
    label: 'Open prayer requests',
    weight: 10,
    severity: 'notable',
    rationale:
      'Ordinary open requests are background care load. They accumulate gently rather than ' +
      'alarming — three quiet requests still deserve a look.',
    evaluate: (f) => {
      const open = f.prayer_requests.filter((p) => p.status === 'open' || p.status === 'praying');
      if (open.length === 0) return NO;
      // 10 per request, capped at 20 so a long prayer history cannot dominate.
      return match(`${open.length} open prayer request${open.length > 1 ? 's' : ''}`, Math.min(20, open.length * 10));
    },
  },
  {
    code: 'cura.followup_overdue',
    direction: 'cura',
    label: 'Care follow-up overdue',
    weight: 25,
    severity: 'serious',
    rationale:
      'The ministry promised itself it would check back and has not. This is the single ' +
      'most preventable way a member gets neglected, so it scores like a serious fact.',
    evaluate: (f, now) => {
      const overdue = f.prayer_requests.filter((p) => {
        if (!p.followup_due_at || p.status === 'closed' || p.status === 'answered') return false;
        const days = daysBetween(p.followup_due_at, now);
        return days !== null && days > 0;
      });
      if (overdue.length === 0) return NO;
      const worst = Math.max(
        ...overdue.map((p) => daysBetween(p.followup_due_at, now) ?? 0),
      );
      return match(`Follow-up overdue by ${worst} day${worst === 1 ? '' : 's'}`);
    },
  },
  {
    code: 'cura.repeated_unresolved_outreach',
    direction: 'cura',
    label: 'Repeated outreach, no resolution',
    weight: 20,
    severity: 'notable',
    rationale:
      'Three or more outreach attempts without the matter closing usually means the real ' +
      'need was never the one on the form.',
    evaluate: (f) => {
      if (f.unanswered_outreach < 3) return NO;
      return match(`${f.unanswered_outreach} outreach attempts without resolution`);
    },
  },
  {
    code: 'cura.serious_need_open',
    direction: 'cura',
    label: 'Serious medical need in progress',
    weight: 20,
    severity: 'notable',
    rationale:
      'An emergency or surgical case that is still open means a family is mid-crisis, ' +
      'whatever the paperwork says.',
    evaluate: (f) => {
      const serious = f.needs.filter(
        (n) =>
          (n.category === 'emergency' || n.category === 'surgical') &&
          !['completed', 'declined', 'withdrawn'].includes(n.status),
      );
      if (serious.length === 0) return NO;
      return match(`${serious.length} open ${serious[0].category} case`);
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// ONUS — case weight: money, urgency, stalled processing
// ─────────────────────────────────────────────────────────────────────────────

/** Above this, a single need is "large" for a typical sharing ministry. $25,000. */
const LARGE_NEED_CENTS = 2_500_000;
/** Above this, a need is exceptional and gets the full weight. $75,000. */
const MAJOR_NEED_CENTS = 7_500_000;
/** Days a need may sit in a non-terminal status before it counts as stalled. */
const STALL_DAYS = 14;

const ONUS_RULES: NriRule[] = [
  {
    code: 'onus.major_need',
    direction: 'onus',
    label: 'Major share amount',
    weight: 40,
    severity: 'serious',
    rationale:
      'A need above $75,000 changes the month for the whole sharing pool. Leadership should ' +
      'know about it by name, not discover it in a report.',
    evaluate: (f) => {
      const major = f.needs.filter(
        (n) => n.amount_requested_cents >= MAJOR_NEED_CENTS && !isTerminal(n.status),
      );
      if (major.length === 0) return NO;
      const top = Math.max(...major.map((n) => n.amount_requested_cents));
      return match(`Open need of $${(top / 100).toLocaleString('en-US')}`);
    },
  },
  {
    code: 'onus.large_need',
    direction: 'onus',
    label: 'Large share amount',
    weight: 25,
    severity: 'notable',
    rationale: 'Needs above $25,000 warrant a named case owner and a communicated timeline.',
    evaluate: (f) => {
      const large = f.needs.filter(
        (n) =>
          n.amount_requested_cents >= LARGE_NEED_CENTS &&
          n.amount_requested_cents < MAJOR_NEED_CENTS &&
          !isTerminal(n.status),
      );
      if (large.length === 0) return NO;
      const top = Math.max(...large.map((n) => n.amount_requested_cents));
      return match(`Open need of $${(top / 100).toLocaleString('en-US')}`);
    },
  },
  {
    code: 'onus.overdue_processing',
    direction: 'onus',
    label: 'Case processing stalled',
    weight: 30,
    severity: 'serious',
    rationale:
      'A case that has not changed status in two weeks is stuck, and the member is sitting ' +
      'at home with an unpaid bill wondering whether anyone read it.',
    evaluate: (f, now) => {
      const stalled = f.needs.filter((n) => {
        if (isTerminal(n.status)) return false;
        const anchor = n.last_status_change_at ?? n.submitted_at ?? n.created_at;
        const days = daysBetween(anchor, now);
        return days !== null && days >= STALL_DAYS * DAY;
      });
      if (stalled.length === 0) return NO;
      const worst = Math.max(
        ...stalled.map(
          (n) => daysBetween(n.last_status_change_at ?? n.submitted_at ?? n.created_at, now) ?? 0,
        ),
      );
      // Scale with how stuck it is: 30 at two weeks, 40 past a month.
      return match(`No status change in ${worst} days`, worst >= 30 ? 40 : 30);
    },
  },
  {
    code: 'onus.critical_urgency',
    direction: 'onus',
    label: 'Case marked critical',
    weight: 30,
    severity: 'serious',
    rationale: 'Staff marked this case critical. That flag should never be quietly outranked.',
    evaluate: (f) => {
      const critical = f.needs.filter((n) => n.urgency === 'critical' && !isTerminal(n.status));
      if (critical.length === 0) return NO;
      return match('Open case marked critical');
    },
  },
  {
    code: 'onus.unassigned',
    direction: 'onus',
    label: 'Open case with no owner',
    weight: 20,
    severity: 'notable',
    rationale:
      'An unassigned case is nobody\'s job. This is the cheapest possible fix and the most ' +
      'common cause of a case going quiet.',
    evaluate: (f) => {
      const orphans = f.needs.filter((n) => !n.assigned_to && !isTerminal(n.status));
      if (orphans.length === 0) return NO;
      return match(`${orphans.length} open case${orphans.length > 1 ? 's' : ''} unassigned`);
    },
  },
  {
    code: 'onus.repeated_cost_events',
    direction: 'onus',
    label: 'Repeated cost events',
    weight: 20,
    severity: 'notable',
    rationale:
      'Three or more needs in a year is a pattern, not an accident — often a chronic ' +
      'condition the ministry should be supporting differently.',
    evaluate: (f, now) => {
      const recent = f.needs.filter((n) => {
        const days = daysBetween(n.created_at, now);
        return days !== null && days <= 365;
      });
      if (recent.length < 3) return NO;
      return match(`${recent.length} needs submitted in the last 12 months`);
    },
  },
  {
    code: 'onus.financial_stress',
    direction: 'onus',
    label: 'Financial stress flagged',
    weight: 20,
    severity: 'notable',
    rationale:
      'Someone on staff marked this member as financially stressed. It is an explicit human ' +
      'judgment and it belongs in the score.',
    evaluate: (f) => (f.financial_stress ? match('Staff flagged financial stress') : NO),
  },
  {
    code: 'onus.needs_info_stalled',
    direction: 'onus',
    label: 'Waiting on the member for information',
    weight: 15,
    severity: 'notable',
    rationale:
      'A case parked in "needs info" is usually waiting on a member who did not understand ' +
      'what was asked. That is the ministry\'s problem to solve, not the member\'s.',
    evaluate: (f, now) => {
      const waiting = f.needs.filter((n) => {
        if (n.status !== 'needs_info') return false;
        const days = daysBetween(n.last_status_change_at ?? n.created_at, now);
        return days !== null && days >= 7;
      });
      if (waiting.length === 0) return NO;
      return match('Case waiting on member information for over a week');
    },
  },

  // ── Claims integrity ───────────────────────────────────────────────────────
  // Onus started as "how heavy is this case". These rules sharpen it into "is
  // this case being handled properly", because that is what actually predicts
  // a member being financially stranded — and it is the failure mode behind
  // every public collapse in this category.
  {
    code: 'onus.sla_breach',
    direction: 'onus',
    label: 'Past the ministry’s turnaround commitment',
    weight: 30,
    severity: 'serious',
    rationale:
      'A Raleigh family carried their newborn\'s bills for months against a stated 17-day ' +
      'turnaround. The commitment existed on a website and nowhere in the software, so nothing ' +
      'escalated until the family went to a news station.',
    evaluate: (f, now) => {
      const breached = f.needs.filter((n) => {
        if (isTerminal(n.status) || !n.sla_due_at) return false;
        const over = daysBetween(n.sla_due_at, now);
        return over !== null && over > 0;
      });
      if (breached.length === 0) return NO;
      const worst = Math.max(...breached.map((n) => daysBetween(n.sla_due_at, now) ?? 0));
      // Past double the typical window this stops being a delay and becomes
      // the thing members tell journalists about.
      return match(
        `${breached.length} claim${breached.length > 1 ? 's' : ''} past commitment (worst: ${worst} days)`,
        worst >= 30 ? 40 : 30,
      );
    },
  },
  {
    code: 'onus.unacknowledged_claim',
    direction: 'onus',
    label: 'Claim nobody has looked at',
    weight: 25,
    severity: 'serious',
    rationale:
      'A claim with no first response is worse than a slow one. The member cannot tell the ' +
      'difference between "being worked" and "lost", and assumes the former until it is too late.',
    evaluate: (f, now) => {
      const silent = f.needs.filter((n) => {
        if (isTerminal(n.status) || n.first_response_at) return false;
        const days = daysBetween(n.submitted_at ?? n.created_at, now);
        return days !== null && days >= 5;
      });
      if (silent.length === 0) return NO;
      const worst = Math.max(
        ...silent.map((n) => daysBetween(n.submitted_at ?? n.created_at, now) ?? 0),
      );
      return match(`${silent.length} claim${silent.length > 1 ? 's have' : ' has'} had no response in ${worst} days`);
    },
  },
  {
    code: 'onus.denial_without_guideline',
    direction: 'onus',
    label: 'Denied without citing a guideline',
    weight: 35,
    severity: 'serious',
    rationale:
      'A denial that cites no published provision cannot be checked by the member, defended by ' +
      'the ministry, or explained to a regulator. It is the single clearest sign a case needs ' +
      're-opening before it becomes a complaint.',
    evaluate: (f) => {
      const unbacked = f.needs.filter(
        (n) => n.status === 'declined' && !n.denial_guideline_ref,
      );
      if (unbacked.length === 0) return NO;
      const amount = unbacked.reduce((sum, n) => sum + n.amount_requested_cents, 0);
      return match(
        `${unbacked.length} denial${unbacked.length > 1 ? 's' : ''} cite no guideline ` +
        `($${(amount / 100).toLocaleString('en-US')})`,
      );
    },
  },
  {
    code: 'onus.intake_incomplete',
    direction: 'onus',
    label: 'Claim cannot be worked as submitted',
    weight: 20,
    severity: 'notable',
    rationale:
      'Missing procedure codes and absent itemized bills are the most common reason a claim ' +
      'silently stalls. Surfacing it as a signal turns a months-long wait into a phone call.',
    evaluate: (f) => {
      const blocked = f.needs.filter(
        (n) => !isTerminal(n.status) && n.intake_blocking_count > 0,
      );
      if (blocked.length === 0) return NO;
      return match(
        `${blocked.length} open claim${blocked.length > 1 ? 's are' : ' is'} missing information ` +
        'required to process it',
      );
    },
  },
  {
    code: 'onus.secondary_payer_stalled',
    direction: 'onus',
    label: 'Secondary-payer coordination stalled',
    weight: 20,
    severity: 'notable',
    rationale:
      'Ministries commonly defend a delay by pointing out they are the secondary payer and other ' +
      'coverage must be exhausted first. That is often fair — and it is also where a claim can ' +
      'sit untouched for months with nobody owning the coordination.',
    evaluate: (f, now) => {
      const stalled = f.needs.filter((n) => {
        if (isTerminal(n.status)) return false;
        if (n.secondary_payer_status !== 'pending' && n.secondary_payer_status !== 'in_progress') {
          return false;
        }
        const days = daysBetween(n.last_status_change_at ?? n.created_at, now);
        return days !== null && days >= 21;
      });
      if (stalled.length === 0) return NO;
      return match(
        `${stalled.length} claim${stalled.length > 1 ? 's' : ''} waiting over three weeks on ` +
        'other-payer coordination',
      );
    },
  },
  {
    code: 'onus.overdue_appeal',
    direction: 'onus',
    label: 'Appeal past its response window',
    weight: 30,
    severity: 'serious',
    rationale:
      'Members across several ministries describe having no way to appeal. An appeals process ' +
      'that exists but runs late is the same experience with extra steps — and this member has ' +
      'already been denied once.',
    evaluate: (f) => {
      const overdue = f.needs.filter((n) => n.has_overdue_appeal);
      if (overdue.length === 0) return NO;
      return match(
        `${overdue.length} appeal${overdue.length > 1 ? 's are' : ' is'} past the ministry's own ` +
        'response window',
      );
    },
  },
];

function isTerminal(status: string): boolean {
  return status === 'completed' || status === 'declined' || status === 'withdrawn';
}

// ─────────────────────────────────────────────────────────────────────────────
// FAMILIA — household complexity
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Household-structure rules score on the primary contact only.
 *
 * Size, dependents, caregiving, and recent changes are facts about the
 * household. Scoring them on every member produced eight identical rows for
 * one family on the triage board — technically correct, operationally
 * useless. The primary contact is the person staff would actually call about
 * the household, so the household's complexity attaches to them.
 */
const FAMILIA_RULES: NriRule[] = [
  {
    code: 'familia.large_household',
    direction: 'familia',
    label: 'Large household',
    weight: 20,
    severity: 'notable',
    rationale:
      'Five or more people in a sharing unit means more moving parts: more eligibility ' +
      'questions, more renewal paperwork, more ways to miss someone.',
    evaluate: (f) => {
      if (!f.is_primary_contact) return NO;
      const count = f.household?.member_count ?? 0;
      if (count < 5) return NO;
      // 20 at five people, 30 at seven or more.
      return match(`${count} people in the household`, count >= 7 ? 30 : 20);
    },
  },
  {
    code: 'familia.many_dependents',
    direction: 'familia',
    label: 'Multiple dependents',
    weight: 20,
    severity: 'notable',
    rationale: 'Dependents drive both cost variability and the volume of routine care questions.',
    evaluate: (f) => {
      if (!f.is_primary_contact) return NO;
      const deps = f.household?.dependent_count ?? 0;
      if (deps < 3) return NO;
      return match(`${deps} dependents`, deps >= 5 ? 30 : 20);
    },
  },
  {
    code: 'familia.caregiving',
    direction: 'familia',
    label: 'Caregiving in the household',
    weight: 30,
    severity: 'serious',
    rationale:
      'A caregiver in the household means someone is carrying a second full-time job. It ' +
      'changes what "we sent them the form" is worth.',
    evaluate: (f) => {
      if (!f.is_primary_contact) return NO;
      const caregivers = f.household?.caregiver_count ?? 0;
      if (caregivers === 0) return NO;
      return match(`${caregivers} caregiver${caregivers > 1 ? 's' : ''} in the household`);
    },
  },
  {
    code: 'familia.recent_change',
    direction: 'familia',
    label: 'Household changed recently',
    weight: 25,
    severity: 'serious',
    rationale:
      'People joining or leaving a household in the last 90 days — a birth, a marriage, an ' +
      'adult child aging off — is exactly when eligibility gets quietly wrong.',
    evaluate: (f) => {
      if (!f.is_primary_contact) return NO;
      const changes = f.household?.recent_membership_changes ?? 0;
      if (changes === 0) return NO;
      return match(`${changes} household membership change${changes > 1 ? 's' : ''} in 90 days`);
    },
  },
  {
    code: 'familia.new_baby',
    direction: 'familia',
    label: 'New baby',
    weight: 30,
    severity: 'serious',
    rationale:
      'A maternity case or birth request means a newborn needs adding to the household, and ' +
      'a family has about zero spare attention for paperwork.',
    evaluate: (f, now) => {
      const maternity = f.needs.some((n) => {
        if (n.category !== 'maternity') return false;
        const days = daysBetween(n.created_at, now);
        return days !== null && days <= 180;
      });
      const birthPrayer = f.prayer_requests.some((p) => {
        if (p.category !== 'birth') return false;
        const days = daysBetween(p.created_at, now);
        return days !== null && days <= 180;
      });
      if (!maternity && !birthPrayer) return NO;
      return match('Birth or maternity case in the last six months');
    },
  },
  {
    code: 'familia.unassigned_household',
    direction: 'familia',
    label: 'Member has no household',
    weight: 15,
    severity: 'notable',
    rationale:
      'A member with no household is almost always an import artifact. Until it is fixed, ' +
      'household-level sharing and eligibility logic cannot see them at all.',
    evaluate: (f) => (f.household === null ? match('Not linked to any household') : NO),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// FIDES — trust, engagement, communication
// ─────────────────────────────────────────────────────────────────────────────

const FIDES_RULES: NriRule[] = [
  {
    code: 'fides.no_response',
    direction: 'fides',
    label: 'No response to outreach',
    weight: 30,
    severity: 'serious',
    rationale:
      'We have reached out and heard nothing back. Silence before renewal is the clearest ' +
      'predictor of a member leaving without ever saying why.',
    evaluate: (f, now) => {
      if (f.unanswered_outreach < 2) return NO;
      const since = daysBetween(f.last_response_at, now);
      const detail =
        since === null
          ? `${f.unanswered_outreach} attempts, never heard back`
          : `${f.unanswered_outreach} attempts, last response ${since} days ago`;
      return match(detail, f.unanswered_outreach >= 4 ? 40 : 30);
    },
  },
  {
    code: 'fides.communication_gap',
    direction: 'fides',
    label: 'Long communication gap',
    weight: 25,
    severity: 'notable',
    rationale:
      'Six months of no contact at all is not a quiet member, it is a member the ministry ' +
      'has lost track of.',
    evaluate: (f, now) => {
      const anchor = f.last_contact_at ?? f.joined_at ?? f.created_at;
      const days = daysBetween(anchor, now);
      if (days === null || days < 180) return NO;
      return match(`No contact in ${days} days`, days >= 365 ? 35 : 25);
    },
  },
  {
    code: 'fides.onboarding_incomplete',
    direction: 'fides',
    label: 'Onboarding never finished',
    weight: 25,
    severity: 'serious',
    rationale:
      'A member who never finished onboarding does not know how sharing works, which means ' +
      'their first need will be their worst experience.',
    evaluate: (f, now) => {
      if (f.onboarding_complete) return NO;
      const days = daysBetween(f.joined_at ?? f.created_at, now);
      if (days === null || days < 30) return NO; // grace period — they may be mid-signup
      return match(`Joined ${days} days ago, onboarding still incomplete`, days >= 90 ? 35 : 25);
    },
  },
  {
    code: 'fides.pending_too_long',
    direction: 'fides',
    label: 'Stuck in pending status',
    weight: 25,
    severity: 'notable',
    rationale:
      'A membership that has been "pending" for over 60 days is a signup that quietly failed ' +
      'and nobody noticed.',
    evaluate: (f, now) => {
      if (f.status !== 'pending') return NO;
      const days = daysBetween(f.created_at, now);
      if (days === null || days < 60) return NO;
      return match(`Pending for ${days} days`);
    },
  },
  {
    code: 'fides.lapsed',
    direction: 'fides',
    label: 'Membership lapsed',
    weight: 35,
    severity: 'serious',
    rationale:
      'Lapsed is the outcome every other Fides rule is trying to prevent. It stays on the ' +
      'board because a lapsed member is still reachable for a while.',
    evaluate: (f) => (f.status === 'lapsed' ? match('Membership has lapsed') : NO),
  },
  {
    code: 'fides.confusion',
    direction: 'fides',
    label: 'Recent confusion about a case',
    weight: 20,
    severity: 'notable',
    rationale:
      'Repeatedly asking for more information on the same case usually means the request ' +
      'was unclear, and the member is losing confidence with every round trip.',
    evaluate: (f, now) => {
      const confused = f.needs.filter((n) => {
        if (n.status !== 'needs_info') return false;
        const days = daysBetween(n.created_at, now);
        return days !== null && days <= 90;
      });
      if (confused.length === 0) return NO;
      return match('Open case waiting on member clarification');
    },
  },
];

/** The complete v1 rule set. Order here is the order reasons are displayed. */
export const NRI_RULES: NriRule[] = [
  ...CURA_RULES,
  ...ONUS_RULES,
  ...FAMILIA_RULES,
  ...FIDES_RULES,
];

export const RULES_VERSION = 'rules.v1';

/** Look up a rule's rationale by code — used by the admin rule reference page. */
export function ruleByCode(code: string): NriRule | undefined {
  return NRI_RULES.find((r) => r.code === code);
}
