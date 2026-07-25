import type { NormalizedRow } from './fields';

/**
 * Row validation.
 *
 * The governing principle: reject as little as possible. A roster is somebody's
 * whole membership, and refusing to import a family because a zip code has a
 * typo is worse than importing them and flagging it. So there are exactly two
 * severities:
 *
 *   error   — the row cannot become a member (no name). Blocks that row only.
 *   warning — the row imports, and the problem is recorded on it for follow-up.
 *
 * Warnings are not noise: several of them feed NRI directly. A member imported
 * with no contact method at all starts life with a real Fides problem, and the
 * ministry should see that on day one rather than discover it at renewal.
 */

export type IssueSeverity = 'error' | 'warning';

export interface RowIssue {
  code: string;
  field: string | null;
  message: string;
  severity: IssueSeverity;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateRow(row: NormalizedRow, now = new Date().toISOString()): RowIssue[] {
  const issues: RowIssue[] = [];

  // ── Errors: the row cannot become a person ────────────────────────────────
  if (!row.first_name && !row.last_name) {
    issues.push({
      code: 'name.missing',
      field: 'first_name',
      message: 'No name on this row. A member needs at least a first or last name.',
      severity: 'error',
    });
  }

  // ── Warnings: import it, but say something ────────────────────────────────
  // Only when exactly one half is present — a row with neither is already an
  // error above, and "only a last name was found" would be plainly untrue.
  if (Boolean(row.first_name) !== Boolean(row.last_name)) {
    issues.push({
      code: 'name.partial',
      field: row.first_name ? 'last_name' : 'first_name',
      message: `Only a ${row.first_name ? 'first' : 'last'} name was found.`,
      severity: 'warning',
    });
  }

  if (row.email && !EMAIL_RE.test(row.email)) {
    issues.push({
      code: 'email.invalid',
      field: 'email',
      message: `"${row.email}" does not look like an email address. It will be imported but not used for matching.`,
      severity: 'warning',
    });
  }

  if (row.phone && row.phone.replace(/\D/g, '').length < 10) {
    issues.push({
      code: 'phone.short',
      field: 'phone',
      message: 'Phone number has fewer than 10 digits.',
      severity: 'warning',
    });
  }

  if (!row.email && !row.phone) {
    issues.push({
      code: 'contact.none',
      field: null,
      message: 'No email or phone. This member cannot be contacted or matched against existing records.',
      severity: 'warning',
    });
  }

  if (row.date_of_birth) {
    const dob = Date.parse(row.date_of_birth);
    const nowMs = Date.parse(now);
    if (Number.isNaN(dob)) {
      issues.push({
        code: 'dob.unparseable',
        field: 'date_of_birth',
        message: 'Date of birth could not be read.',
        severity: 'warning',
      });
    } else if (dob > nowMs) {
      issues.push({
        code: 'dob.future',
        field: 'date_of_birth',
        message: 'Date of birth is in the future.',
        severity: 'warning',
      });
    } else if (nowMs - dob > 120 * 365.25 * 86_400_000) {
      issues.push({
        code: 'dob.implausible',
        field: 'date_of_birth',
        message: 'Date of birth implies an age over 120.',
        severity: 'warning',
      });
    }
  }

  if (row.share_amount_cents !== null && row.share_amount_cents < 0) {
    issues.push({
      code: 'share.negative',
      field: 'share_amount',
      message: 'Share amount is negative.',
      severity: 'warning',
    });
  }

  if (!row.household_name) {
    issues.push({
      code: 'household.none',
      field: 'household_name',
      message: 'No household on this row. The member will be imported without a household.',
      severity: 'warning',
    });
  }

  if (row.relationship === 'other') {
    issues.push({
      code: 'relationship.unrecognized',
      field: 'relationship',
      message: 'Relationship to the household was not recognized and was recorded as "other".',
      severity: 'warning',
    });
  }

  return issues;
}

export function hasBlockingError(issues: RowIssue[]): boolean {
  return issues.some((i) => i.severity === 'error');
}
