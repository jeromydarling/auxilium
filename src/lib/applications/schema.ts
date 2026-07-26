/**
 * The membership application.
 *
 * A fixed spine plus configurable sections, and the split is the whole design.
 *
 * The **spine** is whatever creating a household actually requires: who is
 * applying, how to reach them, who else is in the household, and when they want
 * to start. It is not configurable, because approving an application creates
 * real members and a form that might not collect a surname cannot do that. Most
 * of the value here is that a roster is never retyped out of a PDF.
 *
 * The **sections** are everything ministries genuinely differ on, and they
 * differ enormously. Faith-gated ministries require a statement of faith and
 * regular church attendance — one asks for a pastor's signature. Others state
 * plainly that they welcome members of all faiths and ask only for ethical
 * attestations. Tobacco is disqualifying at three large ministries and a
 * monthly surcharge at four others. Pre-existing lookbacks run 24 or 36 months.
 * A single fixed form cannot serve both ends of that, and a form builder with
 * no spine cannot create a household. Hence both.
 *
 * Two rules that are not negotiable and are enforced elsewhere in this module:
 *
 *   • **A submitted application is immutable.** What someone disclosed at
 *     application is the exact evidence a decline three years later gets argued
 *     against. If it can be edited afterwards it is worthless as a record.
 *     Corrections supersede; the original is kept.
 *   • **Nothing here decides anything.** The form can flag, sort, and warn. It
 *     never auto-declines. Same discipline as the eligibility check, for the
 *     same reason: a person told no by a form has been refused by something
 *     that cannot be argued with.
 *
 * Pure. No database, no clock beyond what is passed in.
 */

export type FieldType =
  | 'text'
  | 'textarea'
  | 'email'
  | 'phone'
  | 'date'
  | 'number'
  | 'select'
  /** A yes/no the ministry wants on the record. */
  | 'checkbox'
  /**
   * A statement the applicant affirms. Rendered as the statement itself rather
   * than a label, because "I affirm the statement of faith" beside a tick box
   * is not the same document as the statement.
   */
  | 'attestation';

export interface FormField {
  key: string;
  label: string;
  type: FieldType;
  help?: string;
  required?: boolean;
  /** For `select`. */
  options?: { value: string; label: string }[];
  /** The text of an `attestation`, shown in full. */
  statement?: string;
  maxLength?: number;
}

export interface FormSection {
  key: string;
  title: string;
  description?: string;
  fields: FormField[];
}

export interface ApplicationForm {
  /** Bumped on publish. Every submission records the version it answered. */
  version: number;
  intro?: string;
  sections: FormSection[];
}

/** One person on the application. The applicant is the first of these. */
export interface HouseholdApplicant {
  first_name: string;
  last_name: string;
  date_of_birth?: string;
  /** Free text on purpose — "spouse", "son", "mother-in-law", "ward". */
  relationship?: string;
}

/**
 * The spine. Every field here exists because approval writes it to a real
 * record, not because it is nice to have.
 */
export interface ApplicationSpine {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  date_of_birth?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  /** Everyone else in the household. The applicant is not repeated here. */
  household: HouseholdApplicant[];
  /** When they would like sharing to begin. A request, never a commitment. */
  requested_start_date?: string;
}

export interface ApplicationSubmission {
  spine: ApplicationSpine;
  /** section key → field key → value. */
  answers: Record<string, Record<string, string | boolean>>;
}

/**
 * A starting form.
 *
 * Deliberately does not include a statement of faith. Roughly half of this
 * category does not gate on one, and a default that assumes otherwise would
 * ship every non-faith-gated ministry a form that misrepresents them until
 * somebody notices. Adding one is a section; removing a wrong one is an
 * apology.
 *
 * Also deliberately no health questions: those belong to the second stage,
 * after an account exists. See `HEALTH_DISCLOSURE_NOTE`.
 */
export const DEFAULT_FORM: ApplicationForm = {
  version: 1,
  intro:
    'This is an application to join, not an agreement to share. Everything you tell us here is ' +
    'reviewed by a person, and we will come back to you either way.',
  sections: [
    {
      key: 'membership',
      title: 'Your membership',
      description: 'What you are applying for. Your ministry can change these options.',
      fields: [
        {
          key: 'program',
          label: 'Which program are you applying for?',
          type: 'select',
          required: true,
          help: 'If you are not sure, pick the closest one — we will confirm it with you.',
          options: [
            { value: 'standard', label: 'Standard' },
            { value: 'not_sure', label: 'I am not sure yet' },
          ],
        },
        {
          key: 'previous_coverage',
          label: 'What do you have now?',
          type: 'select',
          required: false,
          options: [
            { value: 'none', label: 'Nothing at the moment' },
            { value: 'insurance', label: 'Health insurance' },
            { value: 'sharing', label: 'Another sharing ministry' },
            { value: 'other', label: 'Something else' },
          ],
        },
      ],
    },
    {
      key: 'agreements',
      title: 'What you are agreeing to',
      description:
        'These are the things every applicant is asked to confirm. Your ministry can add its own.',
      fields: [
        {
          key: 'not_insurance',
          label: 'I understand this is not insurance',
          type: 'attestation',
          required: true,
          // The wording legislatures themselves wrote into the safe-harbour
          // statutes. Softening it here would be softening the one sentence
          // every state that legislated on this insisted on.
          statement:
            'I understand that this ministry is not an insurance company, that whether anyone ' +
            'chooses to help with my medical bills is voluntary, that no one is compelled by law ' +
            'to contribute toward them, and that I remain personally responsible for my own ' +
            'medical bills.',
        },
        {
          key: 'accurate',
          label: 'What I have written here is accurate',
          type: 'attestation',
          required: true,
          statement:
            'The information in this application is true and complete as far as I know. I ' +
            'understand it may be used when deciding whether a future need is shared.',
        },
      ],
    },
    {
      key: 'about',
      title: 'Anything else',
      fields: [
        {
          key: 'referral',
          label: 'How did you hear about us?',
          type: 'text',
          required: false,
          maxLength: 200,
        },
        {
          key: 'notes',
          label: 'Anything you would like us to know',
          type: 'textarea',
          required: false,
          maxLength: 2000,
        },
      ],
    },
  ],
};

/**
 * Why health questions are not in the form above.
 *
 * A public application endpoint is reachable by anyone, and pre-existing
 * disclosure is the most sensitive thing a ministry collects — it is also the
 * exact material a decline gets argued over years later. Collecting it from an
 * anonymous stranger over an unauthenticated POST is the hardest thing in this
 * feature to defend, and it is avoidable: once an application is accepted the
 * household has portal credentials, and disclosure happens signed in, against a
 * known account, with an audit trail.
 *
 * The cost is a two-step process. The benefit is that medical history never
 * touches the public endpoint.
 */
export const HEALTH_DISCLOSURE_NOTE =
  'Health and pre-existing condition questions are asked after your application is accepted, ' +
  'once you have an account to answer them in.';

export const APPLICATION_STATUSES = [
  'submitted',
  'in_review',
  'needs_info',
  'accepted',
  'declined',
  'withdrawn',
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/** Statuses where the ministry owes the applicant a next move. */
export function isMinistryTurn(status: ApplicationStatus): boolean {
  return status === 'submitted' || status === 'in_review';
}

export function isTerminal(status: ApplicationStatus): boolean {
  return status === 'accepted' || status === 'declined' || status === 'withdrawn';
}

/** The relationship values the household table actually accepts. */
export type HouseholdRelationship = 'primary' | 'spouse' | 'dependent' | 'member' | 'other';

const SPOUSE_WORDS = ['spouse', 'wife', 'husband', 'partner'];
const DEPENDENT_WORDS = [
  'son', 'daughter', 'child', 'children', 'kid', 'stepson', 'stepdaughter', 'stepchild',
  'dependent', 'dependant', 'ward', 'foster', 'grandchild', 'grandson', 'granddaughter',
];

/**
 * Turn what somebody typed into the value the household table stores.
 *
 * Applicants write "my boy", "step-daughter", "mother-in-law". The column is an
 * enum, and — more to the point — `is_dependent` feeds Familia scoring, so
 * getting this wrong means a household of six with four children reads as six
 * unrelated adults and never surfaces as the complex family it is.
 *
 * Age wins over wording. Somebody described as "other" who is nine is a
 * dependent whatever the form said, and a form that let a child be miscounted
 * by a typo would be a poor place to compute household complexity from.
 *
 * Anything unrecognised becomes 'member' rather than 'other': 'other' reads as
 * a deliberate classification, and a word we simply did not recognise is not
 * one.
 */
export function classifyRelationship(
  relationship: string | undefined,
  dateOfBirth: string | undefined,
  asOf: string,
): { relationship: HouseholdRelationship; is_dependent: boolean } {
  const minor = isMinorOn(dateOfBirth, asOf);
  const word = (relationship ?? '').toLowerCase().replace(/[^a-z]/g, '');

  if (SPOUSE_WORDS.some((w) => word.includes(w))) {
    // A spouse is not a dependent even if the household treats them as one for
    // other purposes — Familia counts children, not partners.
    return { relationship: 'spouse', is_dependent: false };
  }
  if (minor || DEPENDENT_WORDS.some((w) => word.includes(w))) {
    return { relationship: 'dependent', is_dependent: true };
  }
  return { relationship: 'member', is_dependent: false };
}

/** Under 18 on a given date. Returns false when the date of birth is unknown. */
export function isMinorOn(dateOfBirth: string | undefined, asOf: string): boolean {
  if (!dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return false;
  const birth = Date.parse(`${dateOfBirth}T00:00:00Z`);
  const at = Date.parse(`${asOf.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(birth) || Number.isNaN(at)) return false;
  // Calendar years rather than milliseconds, so a leap year cannot make
  // somebody a day short of eighteen into a dependent.
  const years = (at - birth) / (365.2425 * 86_400_000);
  return years < 18;
}
