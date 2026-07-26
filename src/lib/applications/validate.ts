import type {
  ApplicationForm, ApplicationSubmission, FormField, HouseholdApplicant,
} from './schema';

/**
 * Validating an application.
 *
 * The posture here is deliberately different from the roster importer's. That
 * one rejects as little as possible, because refusing a family over a typo'd
 * postcode is worse than importing them with a warning — the data is already
 * the ministry's and a human can fix it later.
 *
 * An application is the opposite situation: the person is at the keyboard right
 * now, and the cheapest possible moment to get a date of birth right is before
 * they hit submit. So required means required, and the message says what to do.
 *
 * What does not change is the rule that matters most. **Nothing here declines
 * anybody.** Validation stops a form being submitted incomplete; it never
 * decides eligibility, and there is no path from an answer to a rejection. A
 * person turned away by a form has been refused by something that cannot be
 * argued with, which is the failure this whole product exists to prevent.
 */

export interface ValidationIssue {
  /** `spine.email`, or `section.field`. */
  path: string;
  message: string;
}

/** A conservative email shape. Deliberately not RFC 5322 — that rejects real addresses. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** ISO date, and a real one. `2026-02-31` parses in JS and must not pass here. */
function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
  );
}

function validatePerson(person: HouseholdApplicant, path: string, issues: ValidationIssue[]): void {
  if (!person.first_name?.trim()) {
    issues.push({ path: `${path}.first_name`, message: 'A first name is needed.' });
  }
  if (!person.last_name?.trim()) {
    issues.push({ path: `${path}.last_name`, message: 'A last name is needed.' });
  }
  if (person.date_of_birth && !isRealDate(person.date_of_birth)) {
    issues.push({ path: `${path}.date_of_birth`, message: 'That date does not look right.' });
  }
}

function validateField(
  field: FormField,
  raw: string | boolean | undefined,
  path: string,
  issues: ValidationIssue[],
): void {
  const isBlank =
    raw === undefined ||
    raw === null ||
    (typeof raw === 'string' && raw.trim() === '') ||
    // An unticked attestation is blank, not false. "I did not affirm this" and
    // "I affirmed it as no" are not the same answer.
    (typeof raw === 'boolean' && raw === false);

  if (field.required && isBlank) {
    issues.push({
      path,
      message:
        field.type === 'attestation'
          ? 'This needs to be agreed to before the application can be sent.'
          : 'This one is needed.',
    });
    return;
  }
  if (isBlank) return;

  if (typeof raw === 'string') {
    const value = raw.trim();

    if (field.maxLength && value.length > field.maxLength) {
      issues.push({ path, message: `Please keep this under ${field.maxLength} characters.` });
    }
    if (field.type === 'email' && !EMAIL.test(value)) {
      issues.push({ path, message: 'That email address does not look right.' });
    }
    if (field.type === 'date' && !isRealDate(value)) {
      issues.push({ path, message: 'That date does not look right.' });
    }
    if (field.type === 'number' && !Number.isFinite(Number(value))) {
      issues.push({ path, message: 'This needs to be a number.' });
    }
    if (field.type === 'select' && field.options && !field.options.some((o) => o.value === value)) {
      issues.push({ path, message: 'Please choose one of the options.' });
    }
  }
}

/**
 * Check a submission against the form it claims to answer.
 *
 * The form is passed in rather than looked up, because which version was on
 * screen when somebody started typing is a fact about the submission, not about
 * the ministry's current configuration. Validating a half-hour-old form against
 * a version published five minutes ago would reject people for the ministry's
 * edit.
 */
export function validateApplication(
  form: ApplicationForm,
  submission: ApplicationSubmission,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { spine, answers } = submission;

  validatePerson(spine, 'spine', issues);

  if (!spine.email?.trim()) {
    issues.push({ path: 'spine.email', message: 'We need an email address to reply to.' });
  } else if (!EMAIL.test(spine.email.trim())) {
    issues.push({ path: 'spine.email', message: 'That email address does not look right.' });
  }

  if (spine.requested_start_date && !isRealDate(spine.requested_start_date)) {
    issues.push({ path: 'spine.requested_start_date', message: 'That date does not look right.' });
  }

  // A household with more people than a household plausibly has is either a
  // mistake or an attack. Refused rather than silently truncated: quietly
  // dropping the twenty-first person from a family's application is exactly the
  // kind of silent loss this product exists to stop.
  if (spine.household.length > 20) {
    issues.push({
      path: 'spine.household',
      message: 'That is more people than we can take on one application. Please call us.',
    });
  }

  spine.household.forEach((person, i) => validatePerson(person, `spine.household.${i}`, issues));

  for (const section of form.sections) {
    for (const field of section.fields) {
      validateField(field, answers[section.key]?.[field.key], `${section.key}.${field.key}`, issues);
    }
  }

  return issues;
}

/**
 * Strip anything the form did not ask for.
 *
 * A public endpoint receives whatever someone chooses to POST. Storing unasked
 * keys would let anybody write arbitrary content into a ministry's records
 * through a form that never displayed it — and a reviewer reading the
 * application would have no idea it was there.
 */
export function pruneAnswers(
  form: ApplicationForm,
  answers: Record<string, Record<string, string | boolean>>,
): Record<string, Record<string, string | boolean>> {
  const clean: Record<string, Record<string, string | boolean>> = {};

  for (const section of form.sections) {
    const incoming = answers?.[section.key];
    if (!incoming) continue;

    const kept: Record<string, string | boolean> = {};
    for (const field of section.fields) {
      const value = incoming[field.key];
      if (value === undefined) continue;
      kept[field.key] = typeof value === 'string' ? value.trim().slice(0, field.maxLength ?? 5000) : value;
    }
    if (Object.keys(kept).length > 0) clean[section.key] = kept;
  }

  return clean;
}
