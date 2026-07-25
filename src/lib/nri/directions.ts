/**
 * The NRI compass — four directions, fixed.
 *
 * NRI is Need Response Intelligence: the layer that decides who the ministry
 * should look at next, and can always say why. The compass is the vocabulary
 * staff use out loud, so the four names are Latin, short, and don't collide
 * with ordinary English words in a search box.
 *
 *   Cura    — care, pastoral attention, prayer. Someone is hurting.
 *   Onus    — the weight of a case: money, urgency, processing that has stalled.
 *   Familia — household complexity: dependents, caregiving, family in transition.
 *   Fides   — trust and communication: are we actually still in touch?
 *
 * A member or case can carry several directions at once. That is the point —
 * "high Onus, low Cura" is a billing problem; "high Onus AND high Cura" is a
 * family in crisis, and the difference should be legible at a glance.
 */

export const NRI_DIRECTIONS = ['cura', 'onus', 'familia', 'fides'] as const;
export type NriDirection = (typeof NRI_DIRECTIONS)[number];

export type NriSubjectType = 'member' | 'household' | 'need';

export interface NriDirectionMeta {
  key: NriDirection;
  label: string;
  /** One line a staff member could read aloud in a triage meeting. */
  description: string;
  /** What the ministry actually does when this direction is high. */
  response: string;
  /** Tailwind token name — matches the CSS custom properties in globals.css. */
  token: string;
}

export const DIRECTION_META: Record<NriDirection, NriDirectionMeta> = {
  cura: {
    key: 'cura',
    label: 'Cura',
    description: 'Care and pastoral attention — someone is carrying something heavy.',
    response: 'Reach out personally. Pray, visit, call. Do not send a form.',
    token: 'cura',
  },
  onus: {
    key: 'onus',
    label: 'Onus',
    description: 'Case weight — large share amounts, urgency, or processing that has stalled.',
    response: 'Move the case. Assign an owner, unblock the review, communicate the timeline.',
    token: 'onus',
  },
  familia: {
    key: 'familia',
    label: 'Familia',
    description: 'Household complexity — dependents, caregiving, families in transition.',
    response: 'Check the household as a unit, not just the member who called.',
    token: 'familia',
  },
  fides: {
    key: 'fides',
    label: 'Fides',
    description: 'Trust and communication — the relationship is going quiet.',
    response: 'Re-establish contact before renewal. A lapsed member rarely comes back cold.',
    token: 'fides',
  },
};

/**
 * Score bands. Four is enough — more and staff stop believing the difference.
 * These thresholds are the product's opinion about when a human should act, and
 * they are used identically by the API, the dashboard, and the command center.
 */
export type NriBand = 'clear' | 'watch' | 'attend' | 'urgent';

export const BAND_THRESHOLDS: { band: NriBand; min: number }[] = [
  { band: 'urgent', min: 75 },
  { band: 'attend', min: 50 },
  { band: 'watch', min: 25 },
  { band: 'clear', min: 0 },
];

export function bandForScore(score: number): NriBand {
  for (const { band, min } of BAND_THRESHOLDS) {
    if (score >= min) return band;
  }
  return 'clear';
}

export const BAND_LABEL: Record<NriBand, string> = {
  clear: 'Clear',
  watch: 'Watch',
  attend: 'Needs attention',
  urgent: 'Urgent',
};

/**
 * Triage ordering when two subjects tie on score. Cura first is a deliberate
 * moral choice: when the numbers are equal, the hurting person outranks the
 * expensive case.
 */
export const DIRECTION_PRIORITY: Record<NriDirection, number> = {
  cura: 4,
  onus: 3,
  familia: 2,
  fides: 1,
};

export function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
