import type { NriDirection } from './directions';
import { DIRECTION_PRIORITY } from './directions';

/**
 * Contextual nudges — the session engine's output.
 *
 * A nudge is one sentence the ministry should read today, with an optional
 * place to go. This is the counterweight to the compass: the compass tells you
 * how a *member* is doing, a nudge tells you what *you* should do next.
 *
 * The rules for nudges are stricter than for signals, because a nudge
 * interrupts:
 *   • never more than a handful at once
 *   • never a nudge for something already handled
 *   • never a nudge that is only a restatement of a number on screen
 *
 * The derivation is pure so the whole set is testable and so the queue can
 * precompute it without a request context.
 */

export type NudgeKind = 'action' | 'awareness' | 'reflection';

export interface NriNudge {
  /**
   * Stable within a day. Dismissal is keyed on this, so it must not change
   * between two renders on the same data — no timestamps, no random parts.
   */
  id: string;
  direction: NriDirection;
  kind: NudgeKind;
  /** 0–1. How sure we are this is worth interrupting for. */
  confidence: number;
  message: string;
  action?: { label: string; route: string };
}

/** The aggregate counts the session engine reads. One cheap query each. */
export interface NudgeInputs {
  urgentSignalCount: number;
  /** Members with any live signal at 75+. */
  urgentMemberCount: number;
  /** Needs with no assignee, not in a terminal status. */
  unassignedNeedCount: number;
  /** Needs with no status change in 14+ days. */
  stalledNeedCount: number;
  /** Prayer requests whose follow-up date has passed. */
  overdueFollowupCount: number;
  /** Members created by import in the last 7 days with no household. */
  orphanMemberCount: number;
  /** Imports sitting in 'previewing' — uploaded but never committed. */
  pendingImportCount: number;
  /** Members whose Fides is 50+ — going quiet. */
  disengagingMemberCount: number;
  /** Open prayer requests with nobody assigned. */
  unassignedPrayerCount: number;
  /** Whether the org has any members at all — drives the empty-state nudge. */
  totalMemberCount: number;
}

const MAX_NUDGES = 5;

/**
 * Derive today's nudges. `dismissedIds` are filtered here rather than in the UI
 * so that every surface (drawer, dashboard banner, command center) agrees on
 * what is still live.
 */
export function deriveNudges(
  input: NudgeInputs,
  dismissedIds: ReadonlySet<string> = new Set(),
): NriNudge[] {
  const nudges: NriNudge[] = [];

  // A brand-new org gets exactly one nudge: bring your people in.
  if (input.totalMemberCount === 0) {
    return [{
      id: 'nudge.empty.import',
      direction: 'familia',
      kind: 'action',
      confidence: 1,
      message: 'No members yet. Import your roster to start seeing who needs attention.',
      action: { label: 'Import a roster', route: '/imports' },
    }];
  }

  if (input.urgentMemberCount > 0) {
    nudges.push({
      id: 'nudge.urgent.members',
      direction: 'cura',
      kind: 'action',
      confidence: 1,
      message:
        input.urgentMemberCount === 1
          ? 'One member is at an urgent signal level right now.'
          : `${input.urgentMemberCount} members are at an urgent signal level right now.`,
      action: { label: 'Open command center', route: '/nri' },
    });
  }

  if (input.overdueFollowupCount > 0) {
    nudges.push({
      id: 'nudge.followup.overdue',
      direction: 'cura',
      kind: 'action',
      confidence: 0.95,
      message:
        input.overdueFollowupCount === 1
          ? 'A care follow-up is past due. Someone was promised a call back.'
          : `${input.overdueFollowupCount} care follow-ups are past due.`,
      action: { label: 'Open prayer board', route: '/prayer' },
    });
  }

  if (input.stalledNeedCount > 0) {
    nudges.push({
      id: 'nudge.needs.stalled',
      direction: 'onus',
      kind: 'action',
      confidence: 0.9,
      message:
        input.stalledNeedCount === 1
          ? 'A case has not moved in two weeks.'
          : `${input.stalledNeedCount} cases have not moved in two weeks.`,
      action: { label: 'Review cases', route: '/needs' },
    });
  }

  if (input.unassignedNeedCount > 0) {
    nudges.push({
      id: 'nudge.needs.unassigned',
      direction: 'onus',
      kind: 'action',
      confidence: 0.85,
      message:
        input.unassignedNeedCount === 1
          ? 'One open case has no owner.'
          : `${input.unassignedNeedCount} open cases have no owner.`,
      action: { label: 'Assign cases', route: '/needs' },
    });
  }

  if (input.pendingImportCount > 0) {
    nudges.push({
      id: 'nudge.import.pending',
      direction: 'familia',
      kind: 'action',
      confidence: 0.8,
      message:
        input.pendingImportCount === 1
          ? 'An import is waiting for you to review the preview and commit it.'
          : `${input.pendingImportCount} imports are waiting for review.`,
      action: { label: 'Finish the import', route: '/imports' },
    });
  }

  if (input.orphanMemberCount > 0) {
    nudges.push({
      id: 'nudge.members.orphan',
      direction: 'familia',
      kind: 'action',
      confidence: 0.7,
      message:
        `${input.orphanMemberCount} recently imported member${input.orphanMemberCount === 1 ? ' is' : 's are'} ` +
        'not linked to a household yet.',
      action: { label: 'Review households', route: '/households' },
    });
  }

  if (input.unassignedPrayerCount > 0) {
    nudges.push({
      id: 'nudge.prayer.unassigned',
      direction: 'cura',
      kind: 'awareness',
      confidence: 0.65,
      message:
        input.unassignedPrayerCount === 1
          ? 'A prayer request has nobody following up.'
          : `${input.unassignedPrayerCount} prayer requests have nobody following up.`,
      action: { label: 'Open prayer board', route: '/prayer' },
    });
  }

  if (input.disengagingMemberCount >= 3) {
    nudges.push({
      id: 'nudge.fides.disengaging',
      direction: 'fides',
      kind: 'awareness',
      confidence: 0.6,
      message:
        `${input.disengagingMemberCount} members are going quiet. Reaching out before renewal ` +
        'costs far less than winning them back after.',
      action: { label: 'See who', route: '/nri?direction=fides' },
    });
  }

  // Nothing pressing is itself worth saying — a quiet board that says nothing
  // is indistinguishable from a broken one.
  if (nudges.length === 0) {
    nudges.push({
      id: 'nudge.clear',
      direction: 'fides',
      kind: 'reflection',
      confidence: 0.4,
      message: 'Nothing is overdue and no member is at an urgent level. Good day to do the slow work.',
    });
  }

  return nudges
    .filter((n) => !dismissedIds.has(n.id))
    .sort(
      (a, b) =>
        b.confidence - a.confidence ||
        DIRECTION_PRIORITY[b.direction] - DIRECTION_PRIORITY[a.direction],
    )
    .slice(0, MAX_NUDGES);
}

/**
 * Should the compass open itself?
 *
 * Only for something that genuinely cannot wait, and only once per calendar
 * day. An assistant that pops open for routine work gets closed reflexively,
 * and then it is useless on the day it matters.
 */
export function shouldAutoOpen(nudges: NriNudge[]): boolean {
  return nudges.some((n) => n.kind === 'action' && n.confidence >= 0.9);
}
