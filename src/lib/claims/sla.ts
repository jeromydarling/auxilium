import { daysBetween } from '../utils';

/**
 * The claims SLA clock.
 *
 * The asymmetry this exists to correct is documented and one-sided: ministries
 * publish hard deadlines *members* must meet — six months from date of service
 * to submit a bill at Sedera, Zion, Knew Health and CHM, 120 days at Solidarity
 * — and publish no enforceable deadline of their own. Where a turnaround is
 * stated at all it is stated as a range, in months, in marketing copy, and
 * nothing computes against it.
 *
 * When that gap has actually been closed, it has been closed by a regulator
 * after the fact: New York's DFS consent order with Jericho Share imposed fixed
 * payment deadlines as a *remedy*. The argument for this module is that the
 * remedy is cheap to install beforehand and expensive to be handed.
 *
 * So `sla_days` is not a claim about the industry and is not a number we
 * inherited from anyone. It is the ministry's own commitment, set per
 * organization, defaulted deliberately tighter than any published turnaround
 * we found, and made a computed, visible state on every claim — so a breach is
 * something the system announces rather than something a member discovers.
 */

export type SlaStatus = 'on_track' | 'due_soon' | 'breached' | 'severely_breached' | 'closed';

/** The stage a claim is in, and what the member is waiting for. */
export type ClaimStage =
  | 'submitted'      // received, not yet looked at
  | 'in_review'      // a human is working it
  | 'needs_info'     // waiting on the member or provider — clock pauses
  | 'approved'       // decided, not yet paid
  | 'sharing'        // payment in progress
  | 'completed'
  | 'declined'
  | 'withdrawn';

const TERMINAL: ClaimStage[] = ['completed', 'declined', 'withdrawn'];

/**
 * Stages where the ministry is the blocker. A claim parked in `needs_info` is
 * waiting on someone else, so counting that time against the ministry would be
 * both unfair and — worse — an incentive to park claims there.
 *
 * The countervailing risk is real: "needs_info" is exactly where claims go to
 * die. That is why `needs_info` has its own separate ageing rule below rather
 * than simply being excluded.
 */
export function isMinistryBlocking(stage: ClaimStage): boolean {
  return stage === 'submitted' || stage === 'in_review' || stage === 'approved' || stage === 'sharing';
}

export interface SlaInput {
  stage: ClaimStage;
  submitted_at: string | null;
  created_at: string;
  sla_due_at: string | null;
  first_response_at: string | null;
  last_status_change_at: string | null;
  /** The ministry's committed turnaround, in days. */
  sla_days: number;
}

export interface SlaState {
  status: SlaStatus;
  /** Negative when still within the window; positive once past it. */
  days_over: number;
  days_remaining: number;
  due_at: string | null;
  /** Whether anyone has actually engaged with this claim yet. */
  acknowledged: boolean;
  /** Days since submission with no human response at all. */
  days_unacknowledged: number;
  /** One sentence for the member-facing tracker. */
  member_message: string;
  /** Whether this should escalate to a named human right now. */
  needs_escalation: boolean;
}

/** The due date a claim gets on submission. */
export function computeDueAt(submittedAt: string, slaDays: number): string {
  return new Date(Date.parse(submittedAt) + slaDays * 86_400_000).toISOString();
}

export function evaluateSla(input: SlaInput, now: string = new Date().toISOString()): SlaState {
  const submitted = input.submitted_at ?? input.created_at;
  const dueAt = input.sla_due_at ?? computeDueAt(submitted, input.sla_days);

  const daysOver = daysBetween(dueAt, now) ?? 0;
  const acknowledged = Boolean(input.first_response_at);
  const daysUnacknowledged = acknowledged ? 0 : (daysBetween(submitted, now) ?? 0);

  if (TERMINAL.includes(input.stage)) {
    return {
      status: 'closed',
      days_over: daysOver,
      days_remaining: -daysOver,
      due_at: dueAt,
      acknowledged,
      days_unacknowledged: 0,
      member_message: closedMessage(input.stage),
      needs_escalation: false,
    };
  }

  // A claim waiting on the member does not accrue against the ministry's
  // commitment — but it gets its own ageing rule, because "needs info" is
  // exactly where claims quietly go to die.
  if (input.stage === 'needs_info') {
    const waiting = daysBetween(input.last_status_change_at ?? submitted, now) ?? 0;
    const stalled = waiting >= 14;
    return {
      status: stalled ? 'breached' : 'on_track',
      days_over: stalled ? waiting - 14 : 0,
      days_remaining: Math.max(0, 14 - waiting),
      due_at: dueAt,
      acknowledged,
      days_unacknowledged: 0,
      member_message: stalled
        ? `We asked for more information ${waiting} days ago and have not heard back. We will call you.`
        : 'We are waiting on some additional information before we can continue.',
      // The ministry chases after two weeks. Silence is not the member's fault
      // to resolve alone.
      needs_escalation: stalled,
    };
  }

  const status: SlaStatus =
    daysOver >= input.sla_days ? 'severely_breached'   // twice the committed window
    : daysOver > 0 ? 'breached'
    : daysOver >= -3 ? 'due_soon'
    : 'on_track';

  return {
    status,
    days_over: Math.max(0, daysOver),
    days_remaining: Math.max(0, -daysOver),
    due_at: dueAt,
    acknowledged,
    days_unacknowledged: daysUnacknowledged,
    member_message: memberMessage(status, input.stage, daysOver, acknowledged),
    // Escalate on any breach, and on silence past a third of the window even
    // if the deadline itself has not arrived — an unacknowledged claim is the
    // one that becomes a news story.
    needs_escalation:
      status === 'breached' ||
      status === 'severely_breached' ||
      (!acknowledged && daysUnacknowledged >= Math.max(3, Math.floor(input.sla_days / 3))),
  };
}

function memberMessage(
  status: SlaStatus,
  stage: ClaimStage,
  daysOver: number,
  acknowledged: boolean,
): string {
  if (status === 'severely_breached') {
    return `This claim is ${daysOver} days past our commitment. That is our failure, and it has been escalated.`;
  }
  if (status === 'breached') {
    return `This claim is ${daysOver} days past our commitment to you. It has been escalated to a case owner.`;
  }
  if (!acknowledged) {
    return 'Received. A case owner will review this shortly.';
  }

  switch (stage) {
    case 'in_review':
      return 'A case owner is reviewing this now.';
    case 'approved':
      return 'Approved. Payment is being arranged.';
    case 'sharing':
      return 'Approved and being paid.';
    default:
      return status === 'due_soon'
        ? 'In progress, and due to be decided in the next few days.'
        : 'In progress and on track.';
  }
}

function closedMessage(stage: ClaimStage): string {
  switch (stage) {
    case 'completed': return 'Shared and paid.';
    case 'declined': return 'Not shared. You can appeal this decision.';
    case 'withdrawn': return 'Withdrawn.';
    default: return 'Closed.';
  }
}

/**
 * A claim's progress through the visible stages, for the member-facing
 * tracker. The package-tracking pattern, and it exists for the same reason:
 * "still praying our bills get paid" is what members say when a process is
 * opaque, not necessarily when it is slow.
 */
export interface TrackerStep {
  key: string;
  label: string;
  state: 'done' | 'current' | 'upcoming' | 'failed';
  at: string | null;
}

export function buildTracker(input: {
  stage: ClaimStage;
  submitted_at: string | null;
  created_at: string;
  first_response_at: string | null;
  approved_at?: string | null;
  paid_at?: string | null;
}): TrackerStep[] {
  const stage = input.stage;
  const order: ClaimStage[] = ['submitted', 'in_review', 'approved', 'sharing', 'completed'];
  const currentIndex = order.indexOf(stage);

  const stepState = (index: number): TrackerStep['state'] => {
    if (stage === 'declined' || stage === 'withdrawn') {
      // Review happened and finished — it did not fail. What failed is the
      // decision, so that is the step that carries the mark. Getting this
      // backwards told a declined member that review had broken down and a
      // decision was still to come.
      return index <= 1 ? 'done' : 'failed';
    }
    if (stage === 'needs_info') {
      return index === 0 ? 'done' : index === 1 ? 'current' : 'upcoming';
    }
    if (currentIndex === -1) return 'upcoming';
    if (index < currentIndex) return 'done';
    if (index === currentIndex) return 'current';
    return 'upcoming';
  };

  const steps: TrackerStep[] = [
    { key: 'submitted', label: 'Received', state: stepState(0), at: input.submitted_at ?? input.created_at },
    { key: 'in_review', label: 'Under review', state: stepState(1), at: input.first_response_at },
    { key: 'approved', label: 'Decision', state: stepState(2), at: input.approved_at ?? null },
    { key: 'sharing', label: 'Being paid', state: stepState(3), at: null },
    { key: 'completed', label: 'Paid', state: stepState(4), at: input.paid_at ?? null },
  ];

  // A declined or withdrawn need is over. Leaving "Being paid" and "Paid" on
  // the tracker as upcoming steps tells the member money is still on its way,
  // which is the precise false hope this product exists to prevent. The
  // sequence stops where it actually stopped.
  if (stage === 'declined' || stage === 'withdrawn') return steps.slice(0, 3);

  return steps;
}
