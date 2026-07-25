import { daysBetween } from '../utils';
import type { GuidelineVersion, GuidelineProvision } from '../integrity/types';

/**
 * Pre-submission eligibility prediction.
 *
 * The cruelest failure in this category is the one that happens in the right
 * order but too late: a member pays contributions for years, has a procedure,
 * and only then learns it will not be shared. A woman was billed $125,000
 * after a stroke and told she would be terminated for a pre-existing
 * condition. A man paid $12,000 over years and was denied $67,000 over a
 * kidney stone from twelve years earlier.
 *
 * Neither would have been prevented by a faster claim. Both would have been
 * changed entirely by an honest answer *before* the procedure.
 *
 * So this predicts against two things a marketing page cannot: the guideline
 * version that actually binds this member, and the ministry's own denial
 * history for this category. It is deliberately conservative — a false
 * reassurance here is the exact harm the feature exists to prevent, so
 * uncertainty is always reported as uncertainty rather than smoothed away.
 */

export type EligibilityVerdict = 'likely_shared' | 'uncertain' | 'likely_denied' | 'excluded';

export interface EligibilityQuery {
  category: string;
  estimated_cents: number;
  /** When the care is expected. Decides which guideline version applies. */
  planned_date: string;
  member_joined_at: string | null;
  /** Whether the member has disclosed this as pre-existing. */
  is_preexisting: boolean;
  /** What the member has already had shared this year, for limit checks. */
  shared_this_year_cents: number;
}

export interface CategoryHistory {
  category: string;
  submitted: number;
  denied: number;
  /** The reason codes actually used when denying this category. */
  common_denial_reasons: string[];
}

export interface EligibilityAssessment {
  verdict: EligibilityVerdict;
  /** 0–100. How confident, not how likely to be shared. */
  confidence: number;
  /** Named reasons, same shape as everywhere else in Auxilium. */
  factors: { code: string; label: string; detail: string; direction: 'supports' | 'against' }[];
  /** What the member should be told, in plain words, before they proceed. */
  member_guidance: string;
  /** The guideline version this answer was computed against. */
  guideline_version: string | null;
  /** Steps that would materially improve the answer. */
  next_steps: string[];
}

export function assessEligibility(
  query: EligibilityQuery,
  guideline: GuidelineVersion | null,
  history: CategoryHistory | null,
  now: string = new Date().toISOString(),
): EligibilityAssessment {
  const factors: EligibilityAssessment['factors'] = [];
  const nextSteps: string[] = [];

  // This exists to be run *before* care. Run afterwards it still works, but
  // the member is already exposed and should be told that plainly rather than
  // given advice about scheduling they can no longer act on.
  const alreadyHappened = Date.parse(query.planned_date) < Date.parse(now);
  if (alreadyHappened) {
    nextSteps.push(
      'This care has already happened, so this is an estimate of how the claim will be treated ' +
      'rather than a decision you can still act on.',
    );
  }

  // Without published guidelines we genuinely cannot answer, and saying so is
  // the honest output. Guessing here would be worse than useless.
  if (!guideline) {
    return {
      verdict: 'uncertain',
      confidence: 0,
      factors: [{
        code: 'guideline.none',
        label: 'No published guidelines',
        detail: 'This ministry has no guideline version on record for the planned date of care.',
        direction: 'against',
      }],
      member_guidance:
        'We cannot give you a reliable answer because no sharing guidelines are on record for ' +
        'this date. Please ask the ministry for a written pre-determination before proceeding.',
      guideline_version: null,
      next_steps: ['Request a written pre-determination before scheduling.'],
    };
  }

  const provisions = guideline.provisions;

  // ── Hard exclusions ───────────────────────────────────────────────────────
  const exclusion = findExclusion(provisions, query.category);
  if (exclusion) {
    return {
      verdict: 'excluded',
      confidence: 95,
      factors: [{
        code: 'guideline.excluded',
        label: 'Excluded by the guidelines',
        detail: `${exclusion.code}: ${exclusion.statement}`,
        direction: 'against',
      }],
      member_guidance:
        `Based on guideline ${guideline.version}, this is not shared: "${exclusion.statement}" ` +
        'Please plan on paying for this yourself, and talk to the ministry before you proceed if ' +
        'you believe it should be covered.',
      guideline_version: guideline.version,
      next_steps: [
        'Ask the ministry whether any exception applies to your situation.',
        'Ask the provider for a cash price — it is often far below the billed rate.',
      ],
    };
  }

  // ── Waiting periods ───────────────────────────────────────────────────────
  const membershipDays = query.member_joined_at
    ? daysBetween(query.member_joined_at, query.planned_date) ?? 0
    : 0;

  const waiting = provisions.find(
    (p) =>
      p.waiting_period_days !== undefined &&
      (p.category === query.category || (query.is_preexisting && p.code.startsWith('preexisting'))),
  );

  let verdict: EligibilityVerdict = 'likely_shared';
  let confidence = 70;

  if (waiting && waiting.waiting_period_days !== undefined) {
    if (membershipDays < waiting.waiting_period_days) {
      const remaining = waiting.waiting_period_days - membershipDays;
      verdict = 'likely_denied';
      confidence = 85;
      factors.push({
        code: 'guideline.waiting_period',
        label: 'Inside a waiting period',
        detail:
          `${waiting.code} requires ${waiting.waiting_period_days} days of membership. ` +
          `You will have ${membershipDays} on the planned date — ${remaining} days short.`,
        direction: 'against',
      });
      nextSteps.push(
        `If the care can safely wait ${remaining} days, it would fall inside the sharing window.`,
      );
    } else {
      factors.push({
        code: 'guideline.waiting_period_met',
        label: 'Waiting period satisfied',
        detail: `${membershipDays} days of membership against a ${waiting.waiting_period_days}-day requirement.`,
        direction: 'supports',
      });
      confidence += 10;
    }
  }

  // ── Pre-existing disclosure ───────────────────────────────────────────────
  if (query.is_preexisting) {
    const preexisting = provisions.find((p) => p.code.startsWith('preexisting'));
    if (preexisting) {
      factors.push({
        code: 'guideline.preexisting',
        label: 'Pre-existing condition provision applies',
        detail: `${preexisting.code}: ${preexisting.statement}`,
        direction: preexisting.supports_denial_codes.length > 0 ? 'against' : 'supports',
      });
      if (preexisting.supports_denial_codes.length > 0 && verdict === 'likely_shared') {
        verdict = 'uncertain';
      }
    } else {
      // No provision addresses pre-existing conditions at all — a real gap the
      // member should know about rather than discover later.
      factors.push({
        code: 'guideline.preexisting_silent',
        label: 'Guidelines are silent on pre-existing conditions',
        detail: 'No provision addresses pre-existing conditions, so this cannot be predicted reliably.',
        direction: 'against',
      });
      verdict = 'uncertain';
      confidence = Math.min(confidence, 40);
      nextSteps.push('Get the ministry\'s position on this condition in writing before proceeding.');
    }
  }

  // ── Annual limits ─────────────────────────────────────────────────────────
  const limit = provisions.find((p) => p.annual_limit_cents !== undefined);
  if (limit?.annual_limit_cents !== undefined) {
    const projected = query.shared_this_year_cents + query.estimated_cents;
    if (projected > limit.annual_limit_cents) {
      const over = projected - limit.annual_limit_cents;
      factors.push({
        code: 'guideline.annual_limit',
        label: 'Would exceed the annual limit',
        detail:
          `Projected sharing of $${(projected / 100).toLocaleString('en-US')} against a limit of ` +
          `$${(limit.annual_limit_cents / 100).toLocaleString('en-US')} — about ` +
          `$${(over / 100).toLocaleString('en-US')} over.`,
        direction: 'against',
      });
      if (verdict === 'likely_shared') verdict = 'uncertain';
    }
  }

  // ── What this ministry has actually done, not what it advertises ──────────
  if (history && history.submitted >= 5) {
    const denialRate = history.denied / history.submitted;
    if (denialRate >= 0.3) {
      factors.push({
        code: 'history.high_denial_rate',
        label: 'This ministry denies this category often',
        detail:
          `${history.denied} of ${history.submitted} ${query.category} claims were denied ` +
          `(${Math.round(denialRate * 100)}%)` +
          (history.common_denial_reasons.length
            ? `, most often for: ${history.common_denial_reasons.slice(0, 2).join(', ')}.`
            : '.'),
        direction: 'against',
      });
      if (verdict === 'likely_shared') verdict = 'uncertain';
      confidence += 10;
    } else if (denialRate <= 0.05) {
      factors.push({
        code: 'history.low_denial_rate',
        label: 'This category is reliably shared here',
        detail: `${history.submitted - history.denied} of ${history.submitted} such claims were shared.`,
        direction: 'supports',
      });
      confidence += 15;
    }
  } else {
    factors.push({
      code: 'history.thin',
      label: 'Little history to go on',
      detail: `Fewer than five ${query.category} claims on record, so history adds little here.`,
      direction: 'against',
    });
    confidence = Math.min(confidence, 55);
  }

  // A large amount deserves a written answer regardless of the prediction.
  if (query.estimated_cents >= 2_500_000) {
    nextSteps.push(
      'For a claim this size, ask for a written pre-determination. A verbal assurance is not ' +
      'something you can rely on later.',
    );
  }

  return {
    verdict,
    confidence: Math.max(0, Math.min(100, confidence)),
    factors,
    member_guidance: guidance(verdict, guideline.version),
    guideline_version: guideline.version,
    next_steps: nextSteps,
  };
}

function findExclusion(
  provisions: GuidelineProvision[],
  category: string,
): GuidelineProvision | undefined {
  return provisions.find(
    (p) =>
      p.category === category &&
      (p.code.includes('exclu') || p.supports_denial_codes.includes('excluded')),
  );
}

/**
 * Deliberately plain, and deliberately never promissory. "Likely" is the
 * strongest word this function is allowed to use about a future claim —
 * softening that would recreate the exact harm the feature exists to prevent.
 */
function guidance(verdict: EligibilityVerdict, version: string): string {
  switch (verdict) {
    case 'likely_shared':
      return (
        `Based on guideline ${version} and this ministry's actual history, this is likely to be ` +
        'shared. That is not a guarantee — get it in writing if the amount matters to you.'
      );
    case 'uncertain':
      return (
        'We cannot tell you reliably whether this will be shared. Please ask for a written ' +
        'pre-determination before you schedule anything, and plan for the possibility that you ' +
        'will owe the full amount.'
      );
    case 'likely_denied':
      return (
        `Based on guideline ${version}, this is likely to be denied. Please do not proceed ` +
        'expecting it to be shared. Ask the ministry directly first — there may be an exception, ' +
        'and it is far better to find out now.'
      );
    case 'excluded':
      return 'This is excluded by the guidelines and will not be shared.';
  }
}
