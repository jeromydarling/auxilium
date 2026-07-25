import { digitsOnly } from './infer';
import type { NormalizedRow } from './fields';

/**
 * Duplicate detection.
 *
 * Three match paths, in strict order of confidence:
 *
 *   1. email    — normalized address. Near-certain, and cheap.
 *   2. phone    — last 10 digits. Strong, but families share landlines, so it
 *                 additionally requires the last name to agree.
 *   3. name+dob — exact last name, first name, and date of birth. The only
 *                 honest way to match the many rosters with no contact details.
 *
 * Deliberately absent: fuzzy name matching. Levenshtein on "Jon"/"John" would
 * catch some real duplicates and silently merge some real siblings, and merging
 * two members who are different people is far more damaging than importing one
 * duplicate a human later notices. If a ministry needs fuzzy matching, it
 * belongs behind an explicit "review possible matches" step, not here.
 *
 * The keys computed here are stored on the member row and indexed, so matching
 * a 10,000-row roster is 10,000 index lookups rather than a cross join.
 */

export type MatchReason = 'email' | 'phone' | 'name_dob';

export interface DedupeKeys {
  dedupe_email: string | null;
  dedupe_phone: string | null;
  dedupe_name_dob: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Compute the three matchable keys for a row. Null where the row can't support one. */
export function dedupeKeys(row: Pick<NormalizedRow,
  'email' | 'phone' | 'first_name' | 'last_name' | 'date_of_birth'>): DedupeKeys {
  const email = row.email?.trim().toLowerCase() ?? null;

  const phoneDigits = row.phone ? digitsOnly(row.phone) : '';
  const phoneKey = phoneDigits.length >= 10 ? phoneDigits.slice(-10) : null;

  const nameDob =
    row.last_name && row.first_name && row.date_of_birth
      ? `${norm(row.last_name)}|${norm(row.first_name)}|${row.date_of_birth}`
      : null;

  return {
    // An invalid email is not a match key — matching two people on "n/a" would
    // merge the whole roster into one member.
    dedupe_email: email && EMAIL_RE.test(email) ? email : null,
    dedupe_phone: phoneKey,
    dedupe_name_dob: nameDob,
  };
}

function norm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** An existing member, reduced to what matching needs. */
export interface MatchCandidate {
  id: string;
  last_name: string;
  dedupe_email: string | null;
  dedupe_phone: string | null;
  dedupe_name_dob: string | null;
}

export interface MatchResult {
  member_id: string;
  reason: MatchReason;
  confidence: number;
}

/**
 * Find the best existing member for a row.
 *
 * `candidates` is the set already narrowed by an indexed query on the three
 * keys — this function decides among them, it does not scan the org.
 */
export function findMatch(
  row: NormalizedRow,
  candidates: MatchCandidate[],
): MatchResult | null {
  if (candidates.length === 0) return null;
  const keys = dedupeKeys(row);

  if (keys.dedupe_email) {
    const hit = candidates.find((c) => c.dedupe_email === keys.dedupe_email);
    if (hit) return { member_id: hit.id, reason: 'email', confidence: 0.99 };
  }

  if (keys.dedupe_phone) {
    // A shared household phone is normal. Require the surname to agree so we
    // update the right family member rather than overwriting a sibling.
    const hit = candidates.find(
      (c) => c.dedupe_phone === keys.dedupe_phone && norm(c.last_name) === norm(row.last_name),
    );
    if (hit) return { member_id: hit.id, reason: 'phone', confidence: 0.9 };
  }

  if (keys.dedupe_name_dob) {
    const hit = candidates.find((c) => c.dedupe_name_dob === keys.dedupe_name_dob);
    if (hit) return { member_id: hit.id, reason: 'name_dob', confidence: 0.85 };
  }

  return null;
}

/**
 * Duplicates *within the file itself* — two rows for the same person in one
 * upload. Common when a ministry concatenates exports. Returns the row indices
 * that duplicate an earlier row, so the pipeline can mark them 'skip' rather
 * than creating the same member twice in a single commit.
 */
export function findInternalDuplicates(rows: NormalizedRow[]): Map<number, number> {
  const duplicates = new Map<number, number>();
  const byEmail = new Map<string, number>();
  const byNameDob = new Map<string, number>();

  rows.forEach((row, index) => {
    const keys = dedupeKeys(row);

    if (keys.dedupe_email) {
      const seen = byEmail.get(keys.dedupe_email);
      if (seen !== undefined) {
        duplicates.set(index, seen);
        return;
      }
      byEmail.set(keys.dedupe_email, index);
    }

    if (keys.dedupe_name_dob) {
      const seen = byNameDob.get(keys.dedupe_name_dob);
      if (seen !== undefined) {
        duplicates.set(index, seen);
        return;
      }
      byNameDob.set(keys.dedupe_name_dob, index);
    }
  });

  return duplicates;
}
