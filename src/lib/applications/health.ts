/**
 * Health disclosure — the second stage.
 *
 * Deliberately not on the public application. Pre-existing disclosure is the
 * most sensitive material a ministry holds and the exact evidence a decline
 * gets argued over years later; collecting it from an anonymous stranger over
 * an unauthenticated POST is indefensible when it is avoidable. Once accepted,
 * a household has portal credentials, and this is answered signed in, against a
 * known account, with an audit trail.
 *
 * Three things make this different from the application form:
 *
 * **It is per person, not per household.** A pre-existing condition belongs to
 * one member. Recording it against a household would mean a spouse's diagnosis
 * limiting a child's need, which is not how any published guideline works.
 *
 * **The lookback window is the ministry's, and it is stated on the page.**
 * Twenty-four months at some ministries, thirty-six at others, sixty for cancer
 * at one. Asking "have you ever" when the guidelines say thirty-six months
 * collects more than the ministry is entitled to act on, and asking "in the
 * last year" when they say thirty-six collects too little to be relied on.
 *
 * **Nothing here computes eligibility.** It records what a member said. The
 * pre-existing rules read it later, a human decides, and no answer on this form
 * produces an outcome. A member who discloses honestly and is auto-excluded by
 * a form has been refused by something that cannot be argued with.
 *
 * Pure. No database, no clock beyond what is passed in.
 */

/** What a ministry asks about each person. Configured, like the application. */
export interface HealthQuestion {
  key: string;
  /** The question as the member reads it. */
  prompt: string;
  help?: string;
  /**
   * A yes answer asks for detail. Almost always true — "yes" alone is not
   * something a ministry can act on and not something a member can be held to.
   */
  wantsDetail?: boolean;
}

export interface HealthDisclosureForm {
  /**
   * Months of history the ministry actually looks back over.
   *
   * Shown to the member in the question itself, because "have you had any of
   * the following" means something different at 24 months and at 36, and the
   * difference decides whether a need is shared.
   */
  lookback_months: number;
  /** Conditions with a longer window — cancer is commonly 60 months. */
  extended: { label: string; months: number }[];
  questions: HealthQuestion[];
  intro?: string;
}

/** One person's answers. */
export interface PersonHealthDisclosure {
  member_id: string;
  answers: Record<string, { answer: boolean; detail?: string }>;
  /** Set when the member submits. Immutable from that point. */
  completed_at?: string;
}

/**
 * A starting set of questions.
 *
 * Written as things a member can answer about themselves without a medical
 * dictionary. "Have you been told you have a chronic condition" is answerable;
 * "do you have any conditions meeting the definition in section VII" is not,
 * and a form somebody cannot answer honestly produces a record nobody can rely
 * on.
 *
 * Deliberately no condition checklist. Regulators have collected lists of what
 * ministries treat as pre-existing — ALS, asthma, diabetes, sleep apnea,
 * autism, hypertension — and a default that ticks those off invites a ministry
 * to adopt someone else's exclusions without deciding they are its own.
 */
export const DEFAULT_HEALTH_FORM: HealthDisclosureForm = {
  lookback_months: 24,
  extended: [{ label: 'Any cancer', months: 60 }],
  intro:
    'These questions are about the last two years unless a question says otherwise. Answer them ' +
    'as best you can — this is not a test, and being straightforward now is what stops a ' +
    'disagreement later. Nothing here decides anything on its own; a person reads every answer.',
  questions: [
    {
      key: 'ongoing_treatment',
      prompt: 'Are you currently being treated for anything, or taking any regular medication?',
      help: 'Including anything you take every day, even if it is well controlled.',
      wantsDetail: true,
    },
    {
      key: 'diagnosis',
      prompt: 'Has a doctor told you that you have a condition that is ongoing or likely to return?',
      wantsDetail: true,
    },
    {
      key: 'hospital',
      prompt: 'Have you stayed in hospital, had surgery, or been to an emergency department?',
      wantsDetail: true,
    },
    {
      key: 'advised',
      prompt: 'Has a doctor advised treatment, tests, or surgery that you have not yet had?',
      help:
        'Worth mentioning even if you decided against it. Advice you did not act on can still ' +
        'count as a known condition.',
      wantsDetail: true,
    },
    {
      key: 'symptoms',
      prompt: 'Have you had symptoms you have not seen anyone about?',
      help:
        'Most guidelines look at signs and symptoms, not only diagnoses, so this matters even ' +
        'where nothing was confirmed.',
      wantsDetail: true,
    },
    {
      key: 'pregnancy',
      prompt: 'Are you pregnant, or planning to be in the next year?',
      help: 'Maternity is almost always timed from conception or the due date, so the dates matter.',
      wantsDetail: true,
    },
  ],
};

export interface DisclosureIssue {
  path: string;
  message: string;
}

/**
 * Check one person's disclosure.
 *
 * The only rule with teeth: a yes that wants detail must have detail. A bare
 * "yes" is not something a ministry can act on and not something a member can
 * later be held to — it is the worst of both, an answer that looks like a
 * disclosure and functions as nothing.
 *
 * A "no" is never questioned. Pressing somebody to justify a no would turn this
 * into an interrogation, and the honest answer to most of these is no.
 */
export function validateDisclosure(
  form: HealthDisclosureForm,
  disclosure: Pick<PersonHealthDisclosure, 'answers'>,
): DisclosureIssue[] {
  const issues: DisclosureIssue[] = [];

  for (const question of form.questions) {
    const given = disclosure.answers?.[question.key];

    if (!given || typeof given.answer !== 'boolean') {
      issues.push({ path: question.key, message: 'Please answer yes or no.' });
      continue;
    }

    if (given.answer && question.wantsDetail !== false && !given.detail?.trim()) {
      issues.push({
        path: question.key,
        message: 'A few words about this, so nobody has to guess later.',
      });
    }
  }

  return issues;
}

/**
 * The window a question covers, in words the member reads.
 *
 * Rendered into the question rather than kept as a footnote, because the window
 * is what makes the question answerable.
 */
export function lookbackLabel(months: number): string {
  if (months % 12 === 0) {
    const years = months / 12;
    return years === 1 ? 'the last year' : `the last ${years} years`;
  }
  return `the last ${months} months`;
}

/** Whether a household has finished. Partial is not done — see the note below. */
export function disclosureProgress(
  memberIds: string[],
  disclosures: PersonHealthDisclosure[],
): { done: number; total: number; complete: boolean; outstanding: string[] } {
  const completed = new Set(
    disclosures.filter((d) => d.completed_at).map((d) => d.member_id),
  );
  const outstanding = memberIds.filter((id) => !completed.has(id));

  return {
    done: completed.size,
    total: memberIds.length,
    // A household is not disclosed until everyone is. Treating "most of them"
    // as done is how a member gets a need declined over a person nobody asked
    // about — and the ministry finds out at the worst possible moment.
    complete: outstanding.length === 0 && memberIds.length > 0,
    outstanding,
  };
}
