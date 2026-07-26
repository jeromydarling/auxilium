/**
 * Prefixed random IDs. One helper, used everywhere — the database never
 * generates an ID, so an object can be fully constructed before it is written
 * and referenced by children in the same batch.
 *
 * The prefix is worth the eight bytes: a stray ID in a log line, a queue
 * message, or a support ticket is instantly identifiable without a lookup.
 */

const PREFIXES = {
  org: 'org',
  user: 'usr',
  session: 'ses',
  member: 'mem',
  household: 'hh',
  householdMember: 'hm',
  import: 'imp',
  importRow: 'irw',
  importMapping: 'imap',
  need: 'need',
  needUpdate: 'nupd',
  prayer: 'pray',
  signal: 'sig',
  nriSession: 'nris',
  document: 'doc',
  audit: 'aud',
  cmsPage: 'page',
  contribution: 'con',
  disbursement: 'dis',
  billingAccount: 'bacct',
  billingPeriod: 'bper',
  billingEvent: 'bevt',
} as const;

export type IdKind = keyof typeof PREFIXES;

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/**
 * 22 chars of base-36 from crypto randomness — comfortably more entropy than a
 * UUIDv4 and URL-safe without escaping. Works identically in Workers and Node.
 */
function randomToken(length = 22): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

export function newId(kind: IdKind): string {
  return `${PREFIXES[kind]}_${randomToken()}`;
}

/** True if `id` looks like an ID of `kind`. Cheap guard at trust boundaries. */
export function isId(kind: IdKind, id: unknown): id is string {
  return typeof id === 'string' && id.startsWith(`${PREFIXES[kind]}_`);
}
