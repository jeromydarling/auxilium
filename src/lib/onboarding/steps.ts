/**
 * Ministry setup.
 *
 * A new organization currently lands in an empty shell: no guidelines, no
 * roster, a turnaround commitment it never chose, and a triage board with
 * nothing on it. Every one of those is a real gap rather than a cosmetic one —
 * a ministry recording denials against no published guidelines is generating
 * findings against itself on day one.
 *
 * Three decisions shape this module:
 *
 * **It is a checklist, not a wizard.** A ministry will not have its guidelines
 * ready the afternoon it signs up. Software that blocks until setup is complete
 * gets abandoned at step three; a list that says what is missing and lets you
 * work meanwhile gets finished over a fortnight. Nothing here gates anything.
 *
 * **Status is derived, not recorded.** "Has this ministry published guidelines"
 * is answered by looking for guidelines, not by a boolean somebody set. A
 * recorded flag drifts the moment a step is undone — a ministry that deletes
 * its only guideline version would otherwise still show a tick. Only the two
 * things that genuinely cannot be observed are stored: whether a default was
 * actively *chosen*, and whether the list was dismissed.
 *
 * **Every step says what breaks if you skip it.** Not "recommended" — the
 * specific consequence. That is the difference between a checklist people
 * finish and one they close.
 *
 * Pure. Facts in, steps out. No database, no clock beyond what is passed.
 */

export type StepStatus = 'done' | 'todo';

/** How much is actually lost by leaving a step undone. */
export type StepWeight =
  /** The product misreports or misbehaves until this is done. */
  | 'blocking'
  /** Works, but a real capability is dark. */
  | 'important'
  /** Genuinely optional. */
  | 'optional';

export interface OnboardingStep {
  key: string;
  title: string;
  /** One line: what this is. */
  body: string;
  /** What actually breaks while this is undone. Never "recommended". */
  consequence: string;
  status: StepStatus;
  weight: StepWeight;
  /** Where to go and do it. */
  route: string;
  actionLabel: string;
}

/**
 * What the app can observe about a ministry.
 *
 * Deliberately booleans and counts rather than the rows themselves: the step
 * list has no business reading a member record, and keeping the facts narrow
 * means this stays testable without fixtures.
 */
export interface OnboardingFacts {
  /** Explicitly chosen, not merely defaulted. See `commitment_set_at`. */
  commitment_chosen: boolean;
  /** Which guideline version governs a need — declared rather than assumed. */
  governing_rule_declared: boolean;
  published_guideline_versions: number;
  member_count: number;
  /** Staff other than the founding owner. */
  team_member_count: number;
  /** Any contribution or disbursement recorded. */
  has_ledger_entries: boolean;
  /**
   * Whether the ministry has *answered* the question of publishing its share
   * ratio — either way. Observable without stored state, because the flag has
   * three states: true, explicitly false, and absent. Absent means nobody has
   * been asked yet, which is exactly the thing worth prompting.
   */
  share_ratio_decided: boolean;
  /** Any member who can sign in to the portal. */
  portal_accounts: number;
  /** Set when someone chooses to stop being shown the list. */
  dismissed: boolean;
}

/**
 * The setup list, in the order it should be done.
 *
 * Order is not arbitrary. The roster comes before guidelines because a
 * ministry can get value from the triage board immediately and will put off
 * anything that feels like paperwork — and because an empty board is the thing
 * that makes the product look broken. The commitment comes first of all because
 * it is one number, takes ten seconds, and every claim submitted before it is
 * set carries a due date the ministry never agreed to.
 */
export function buildOnboarding(facts: OnboardingFacts): OnboardingStep[] {
  return [
    {
      key: 'commitment',
      title: 'Set your turnaround commitment',
      body:
        'How many days you commit to deciding a submitted need, and how long an appeal may take.',
      consequence:
        'Until you set it, every claim is given a due date from our default of 17 days — a number ' +
        'your ministry never agreed to, on a board your staff are measured against.',
      status: facts.commitment_chosen ? 'done' : 'todo',
      weight: 'blocking',
      route: '/settings',
      actionLabel: 'Set it',
    },
    {
      key: 'roster',
      title: 'Bring in your roster',
      body: 'Upload whatever spreadsheet you already have. Nothing is written until you approve it.',
      consequence:
        'With no members, the triage board, the compass, and every score are empty — the product ' +
        'cannot notice anyone it does not know about.',
      status: facts.member_count > 0 ? 'done' : 'todo',
      weight: 'blocking',
      route: '/imports',
      actionLabel: 'Import members',
    },
    {
      key: 'guidelines',
      title: 'Publish your sharing guidelines',
      body: 'At least one dated version, with the provisions a decline can cite.',
      consequence:
        'Every decline you record will be flagged as citing no published provision — against your ' +
        'own integrity score. It is also the document a member is entitled to be measured against.',
      status: facts.published_guideline_versions > 0 ? 'done' : 'todo',
      weight: 'blocking',
      route: '/integrity',
      actionLabel: 'Add a version',
    },
    {
      key: 'publish_ratio',
      title: 'Decide whether to publish where the money went',
      body:
        'Your share ratio — of every dollar members contributed, how many cents reached their ' +
        'medical costs. You can publish it on your own website and at a public address, or keep ' +
        'it internal. Either answer is fine; not answering is the problem.',
      consequence:
        'Until you decide, the figure stays off your website and off your public page — so the ' +
        'one number that distinguishes a ministry doing this honestly from the ones in the ' +
        'lawsuits is invisible to everybody deciding whether to join you.',
      status: facts.share_ratio_decided ? 'done' : 'todo',
      // Not blocking: a ministry that chooses not to publish is not broken, and
      // the software has no business insisting. But it is not optional either —
      // an unanswered question is a gap, and the gap has a cost worth naming.
      weight: 'important',
      route: '/settings',
      actionLabel: 'Decide',
    },
    {
      key: 'governing_rule',
      title: 'Declare which guideline version governs',
      body:
        'The version in force when a member enrolled, when the care happened, when they submitted, ' +
        'or when you received the bills.',
      consequence:
        'Undeclared, we assume the version in force at enrolment — the strictest reading. If your ' +
        'published policy is time-of-service, correct declines will be scored against you.',
      status: facts.governing_rule_declared ? 'done' : 'todo',
      weight: 'important',
      route: '/settings',
      actionLabel: 'Declare it',
    },
    {
      key: 'ledger',
      title: 'Record contributions and sharing',
      body: 'Money in and money out, on one timeline.',
      consequence:
        'Without it there is no share ratio, so the one number a board member, a journalist, or a ' +
        'regulator will ask for cannot be produced.',
      status: facts.has_ledger_entries ? 'done' : 'todo',
      weight: 'important',
      route: '/integrity',
      actionLabel: 'Open the ledger',
    },
    {
      key: 'portal',
      title: 'Give a member portal access',
      body: 'Invite one household to see their own bills, their stages, and their rights.',
      consequence:
        'Members cannot see where their bill stands, so they call to ask — and the ones who do not ' +
        'call assume the worst.',
      status: facts.portal_accounts > 0 ? 'done' : 'todo',
      weight: 'important',
      route: '/members',
      actionLabel: 'Invite someone',
    },
    {
      key: 'team',
      title: 'Add your team',
      body: 'The people who will actually work the board.',
      consequence:
        'A single account means shared credentials and an audit log that cannot say who did what.',
      status: facts.team_member_count > 0 ? 'done' : 'todo',
      weight: 'optional',
      route: '/settings',
      actionLabel: 'Add someone',
    },
  ];
}

export interface OnboardingSummary {
  steps: OnboardingStep[];
  done: number;
  total: number;
  /** Undone steps that break something, worst first. */
  blocking: OnboardingStep[];
  complete: boolean;
  /** Whether the checklist should be shown at all. */
  visible: boolean;
}

export function summarizeOnboarding(facts: OnboardingFacts): OnboardingSummary {
  const steps = buildOnboarding(facts);
  const done = steps.filter((s) => s.status === 'done').length;
  const blocking = steps.filter((s) => s.status === 'todo' && s.weight === 'blocking');
  const complete = done === steps.length;

  return {
    steps,
    done,
    total: steps.length,
    blocking,
    complete,
    // Dismissing hides it even with work outstanding — a ministry that has read
    // the list and decided is entitled to be left alone. It disappears on its
    // own once finished, so nobody has to dismiss a completed checklist.
    visible: !complete && !facts.dismissed,
  };
}
