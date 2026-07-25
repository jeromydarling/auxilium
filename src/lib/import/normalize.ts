import { parseCents } from '../money';
import { digitsOnly } from './infer';
import type { ColumnMapping, NormalizedRow } from './fields';

/**
 * Turning a raw spreadsheet row into canonical member fields.
 *
 * Every function here is forgiving on input and strict on output. Ministries
 * type dates six different ways and write "Y", "yes", "TRUE", and "1" to mean
 * the same thing; the database gets one shape regardless. Anything genuinely
 * unparseable becomes null and is reported by the validator, never guessed at.
 */

/** ISO date 'YYYY-MM-DD' from the formats real exports actually contain. */
export function normalizeDate(input: string | null | undefined): string | null {
  if (!input) return null;
  const value = input.trim();
  if (!value) return null;

  // Already ISO (possibly with a time component we don't need).
  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return isoDate(+iso[1], +iso[2], +iso[3]);

  // US-style M/D/YYYY or M-D-YYYY. Ambiguous with D/M/YYYY, and we resolve to
  // US because that is where health sharing ministries operate. A value where
  // the first part exceeds 12 is unambiguous, so honor it.
  const slash = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slash) {
    let [, a, b, y] = slash;
    let year = +y;
    if (year < 100) year += year < 50 ? 2000 : 1900;
    let month = +a;
    let day = +b;
    if (month > 12 && day <= 12) [month, day] = [day, month];
    return isoDate(year, month, day);
  }

  // Anything else: let Date have one careful attempt ("Jan 5, 1980").
  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) {
    const d = new Date(parsed);
    return isoDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }

  return null;
}

function isoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (year < 1900 || year > 2200) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Lowercased and trimmed. Not validated here — that is the validator's job. */
export function normalizeEmail(input: string | null | undefined): string | null {
  const value = input?.trim().toLowerCase();
  return value ? value : null;
}

/**
 * Digits only, formatted as (555) 123-4567 when it is a plain 10-digit US
 * number, otherwise left as the digit string. A leading US country code is
 * dropped so that "+1 555 123 4567" and "5551234567" are the same person.
 */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let digits = digitsOnly(input);
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length === 0) return null;
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return digits;
}

const TRUTHY = new Set(['y', 'yes', 'true', 't', '1', 'x', 'checked']);
const FALSY = new Set(['n', 'no', 'false', 'f', '0', '']);

export function normalizeBoolean(input: string | null | undefined): boolean {
  if (!input) return false;
  const value = input.trim().toLowerCase();
  if (TRUTHY.has(value)) return true;
  if (FALSY.has(value)) return false;
  return false;
}

const STATUS_ALIASES: Record<string, string> = {
  a: 'active', active: 'active', current: 'active', enrolled: 'active', yes: 'active',
  p: 'pending', pending: 'pending', applied: 'pending', new: 'pending', prospect: 'pending',
  l: 'lapsed', lapsed: 'lapsed', expired: 'lapsed', delinquent: 'lapsed', suspended: 'lapsed',
  i: 'inactive', inactive: 'inactive', cancelled: 'inactive', canceled: 'inactive',
  terminated: 'inactive', withdrawn: 'inactive', former: 'inactive', no: 'inactive',
};

/** Map a ministry's status vocabulary onto ours. Unknown → 'active'. */
export function normalizeStatus(input: string | null | undefined): string {
  if (!input) return 'active';
  return STATUS_ALIASES[input.trim().toLowerCase()] ?? 'active';
}

const RELATIONSHIP_ALIASES: Record<string, string> = {
  primary: 'primary', head: 'primary', 'head of household': 'primary', self: 'primary',
  subscriber: 'primary', main: 'primary', member: 'member',
  spouse: 'spouse', wife: 'spouse', husband: 'spouse', partner: 'spouse',
  dependent: 'dependent', child: 'dependent', son: 'dependent', daughter: 'dependent',
  minor: 'dependent', student: 'dependent',
};

export function normalizeRelationship(input: string | null | undefined): string {
  if (!input) return 'member';
  return RELATIONSHIP_ALIASES[input.trim().toLowerCase()] ?? 'other';
}

/** Trim, collapse internal whitespace, and drop empties. */
function text(input: string | null | undefined): string | null {
  const value = input?.trim().replace(/\s+/g, ' ');
  return value ? value : null;
}

/**
 * Apply a mapping to one raw row, producing canonical fields.
 *
 * A useful convenience lives here: when a file has a single "Name" column
 * mapped to first_name and no last_name column, we split on the last space.
 * That case is common enough in old rosters to be worth the special handling,
 * and the validator will flag it if the split produces nonsense.
 */
export function normalizeRow(raw: Record<string, string>, mapping: ColumnMapping): NormalizedRow {
  const get = (field: string): string | null => {
    for (const [header, mapped] of Object.entries(mapping)) {
      if (mapped === field) {
        const value = raw[header];
        return value?.trim() ? value.trim() : null;
      }
    }
    return null;
  };

  let firstName = text(get('first_name')) ?? '';
  let lastName = text(get('last_name')) ?? '';

  const hasLastNameColumn = Object.values(mapping).includes('last_name');
  if (!hasLastNameColumn && firstName.includes(' ')) {
    const parts = firstName.split(' ');
    lastName = parts.pop()!;
    firstName = parts.join(' ');
  }

  return {
    first_name: firstName,
    last_name: lastName,
    email: normalizeEmail(get('email')),
    phone: normalizePhone(get('phone')),
    date_of_birth: normalizeDate(get('date_of_birth')),
    member_number: text(get('member_number')),
    status: normalizeStatus(get('status')),
    joined_at: normalizeDate(get('joined_at')),
    address_line1: text(get('address_line1')),
    address_line2: text(get('address_line2')),
    city: text(get('city')),
    state: text(get('state')),
    postal_code: text(get('postal_code')),
    household_name: text(get('household_name')),
    relationship: normalizeRelationship(get('relationship')),
    is_dependent: normalizeBoolean(get('is_dependent')) || normalizeRelationship(get('relationship')) === 'dependent',
    is_caregiver: normalizeBoolean(get('is_caregiver')),
    share_amount_cents: parseCents(get('share_amount')),
    notes: text(get('notes')),
  };
}
