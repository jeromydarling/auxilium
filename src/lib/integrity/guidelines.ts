/**
 * Changing a published guideline.
 *
 * Three things get called "changing the guidelines" and they have opposite
 * consequences for decisions already made. Conflating them is the exact failure
 * this codebase's integrity design is most careful about — a rule that fires on
 * correct behaviour is worse than no rule, and so is a rule that goes quiet on
 * incorrect behaviour.
 *
 * **A correction.** The record here never matched the real published document —
 * a mistyped effective date, a provision code entered wrong. The erroneous text
 * should never have governed anything, so declines already scored against it are
 * re-audited against the corrected text. The old text is archived, never
 * discarded: what a decline was actually judged against has to stay readable,
 * because that is the artefact a dispute turns on.
 *
 * **A new version.** The ministry genuinely changed its rules. Both documents
 * are real and each governed a period. Re-scoring old declines against the new
 * one would be falsifying history — and it is the ministry's history, in the one
 * record a regulator would ask for.
 *
 * **A withdrawal.** Published by mistake, and nothing has ever been scored
 * against it. Allowed only when that is provably true.
 *
 * Getting the first two the wrong way round is not a cosmetic error. Treating a
 * correction as a new version raises a finding against every decline made under
 * the typo — against a ministry that did nothing wrong. Treating a new version
 * as a correction erases the document a member's decline actually depended on.
 *
 * Pure. Facts in, a verdict out.
 */

export type GuidelineChange = 'correction' | 'new_version' | 'withdrawal';

export interface GuidelineUsage {
  /** Declines that cite this version. */
  denials: number;
  /** Applications that recorded this version as the one in force at submission. */
  applications: number;
}

export interface ChangeVerdict {
  allowed: boolean;
  /** Shown to the person making the change. Plain words, never a code. */
  reason?: string;
  /**
   * True when past decisions have to be looked at again.
   *
   * Only a correction sets this. The integrity report recomputes from the
   * current guideline text, so "re-audit" means invalidating the cached report
   * rather than rewriting any stored finding — declines are re-scored the next
   * time anybody asks, which is also the only way a re-score stays honest about
   * the *current* text rather than freezing a second opinion.
   */
  rescores: boolean;
}

/** How many decisions depend on this version. */
export function usageCount(usage: GuidelineUsage): number {
  return usage.denials + usage.applications;
}

/**
 * Whether a change is allowed, and what follows from it.
 *
 * Withdrawal is the only one that can be refused, and it is refused for exactly
 * one reason: something already depends on the document. The message says what
 * to do instead rather than only saying no — a ministry that meant to fix a typo
 * and is told "you cannot delete this" learns nothing, and will publish a
 * near-duplicate version to get around it, which is worse than the typo.
 */
export function canChange(change: GuidelineChange, usage: GuidelineUsage): ChangeVerdict {
  switch (change) {
    case 'correction':
      // Always allowed, and always consequential. A correction to a version
      // nothing depends on is just an edit; a correction to one that eleven
      // declines cite is the case this whole distinction exists for.
      return { allowed: true, rescores: usageCount(usage) > 0 };

    case 'new_version':
      // Never touches the old document, so nothing can object.
      return { allowed: true, rescores: false };

    case 'withdrawal': {
      const used = usageCount(usage);
      if (used === 0) return { allowed: true, rescores: false };

      return {
        allowed: false,
        rescores: false,
        reason:
          `${describeUsage(usage)} already depend${used === 1 ? 's' : ''} on this version, so ` +
          'removing it would leave those records pointing at a document that no longer exists. ' +
          'Correct it instead — the change applies to every decision made under it, and the ' +
          'previous text stays on file.',
      };
    }
  }
}

function describeUsage(usage: GuidelineUsage): string {
  const parts: string[] = [];
  if (usage.denials > 0) {
    parts.push(`${usage.denials} decline${usage.denials === 1 ? '' : 's'}`);
  }
  if (usage.applications > 0) {
    parts.push(`${usage.applications} application${usage.applications === 1 ? '' : 's'}`);
  }
  return parts.join(' and ');
}

/**
 * What a ministry is told before it commits to a correction.
 *
 * Named counts rather than a warning triangle. "This will affect past
 * decisions" is ignorable; "eleven declines will be re-checked against the
 * corrected text" is a number somebody can weigh, and it is the difference
 * between a confirmation people read and one they click through.
 */
export function correctionImpact(usage: GuidelineUsage): string {
  const used = usageCount(usage);
  if (used === 0) {
    return 'Nothing has been decided under this version yet, so nothing is re-checked.';
  }
  return (
    `${describeUsage(usage)} were decided under this version and will be re-checked against ` +
    'the corrected text. The previous wording stays on file, so what each decision was ' +
    'actually judged against remains readable.'
  );
}
