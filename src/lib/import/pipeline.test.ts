import { describe, it, expect } from 'vitest';
import { parseCsv, toCsv } from './csv';
import { inferColumns, normalizeHeader, missingRequiredFields, toMapping } from './infer';
import { normalizeDate, normalizePhone, normalizeStatus, normalizeRow, normalizeBoolean } from './normalize';
import { validateRow } from './validate';
import { dedupeKeys, findMatch, findInternalDuplicates, type MatchCandidate } from './dedupe';
import { analyzeCsv } from './pipeline';
import { parseCents, formatCents } from '../money';
import type { NormalizedRow } from './fields';

const NOW = '2026-07-25T12:00:00.000Z';

/**
 * A deliberately awful file, of the kind ministries actually send: mixed date
 * formats, a BOM, quoted commas, an embedded newline, inconsistent status
 * vocabulary, a duplicate row, a nameless row, and a header nobody would guess.
 */
// eslint-disable-next-line no-irregular-whitespace -- the leading BOM is the point of the first test
const MESSY_CSV = `﻿Mbr #,First Name,LAST NAME,Primary Email Address,Home Phone,DOB,Household Name,Relation,Monthly Share,Status,Notes
1001,Ruth,Alvarez,ruth.alvarez@example.org,(555) 010-1122,1979-04-12,Alvarez Household,Head,"$425.00",Active,"Prefers text, not email"
1002,Daniel,Alvarez,daniel.alvarez@example.org,555.010.1122,3/2/1981,Alvarez Household,Spouse,$0.00,active,
1003,Mia,Alvarez,,5550101122,11/14/2015,Alvarez Household,Child,,A,"Loves horses
and dogs"
1004,Ruth,Alvarez,ruth.alvarez@example.org,(555) 010-1122,1979-04-12,Alvarez Household,Head,425,Active,duplicate row
1005,,,orphan@example.org,,,,,,,no name at all
1006,Samuel,Okafor,SAMUEL.OKAFOR@EXAMPLE.ORG,+1 555 020 3344,Jan 5 1968,Okafor Household,Self,"1,250.50",Lapsed,
`;

describe('CSV parsing survives real-world files', () => {
  const parsed = parseCsv(MESSY_CSV);

  it('strips the BOM from the first header', () => {
    expect(parsed.headers[0]).toBe('Mbr #');
  });

  it('reads every data row', () => {
    expect(parsed.rows).toHaveLength(6);
  });

  it('keeps commas inside quoted fields', () => {
    expect(parsed.rows[0]['Notes']).toBe('Prefers text, not email');
  });

  it('keeps newlines inside quoted fields', () => {
    expect(parsed.rows[2]['Notes']).toContain('\n');
  });

  it('handles CRLF and lone CR line endings identically', () => {
    const lf = parseCsv('a,b\n1,2\n3,4');
    const crlf = parseCsv('a,b\r\n1,2\r\n3,4');
    const cr = parseCsv('a,b\r1,2\r3,4');
    expect(crlf.rows).toEqual(lf.rows);
    expect(cr.rows).toEqual(lf.rows);
  });

  it('renames duplicate and empty headers instead of dropping them', () => {
    const result = parseCsv('Name,Name,\nx,y,z');
    expect(result.headers).toEqual(['Name', 'Name (2)', 'Column 3']);
    expect(result.warnings.length).toBe(2);
  });

  it('pads ragged rows and warns', () => {
    const result = parseCsv('a,b,c\n1,2');
    expect(result.rows[0]).toEqual({ a: '1', b: '2', c: '' });
    expect(result.warnings.join(' ')).toMatch(/different number of columns/);
  });

  it('caps at maxRows and says so', () => {
    const many = 'a\n' + Array.from({ length: 50 }, (_, i) => i).join('\n');
    const result = parseCsv(many, 10);
    expect(result.rows).toHaveLength(10);
    expect(result.warnings.join(' ')).toMatch(/only the first 10/);
  });

  it('round-trips through toCsv', () => {
    const original = parseCsv('a,b\n"x, y",z');
    const round = parseCsv(toCsv(original.headers, original.rows));
    expect(round.rows).toEqual(original.rows);
  });

  it('treats an empty file as empty, not as an error', () => {
    expect(parseCsv('').rows).toEqual([]);
  });
});

describe('column inference', () => {
  const { headers, rows } = parseCsv(MESSY_CSV);
  const columns = inferColumns(headers, rows);
  const fieldFor = (header: string) => columns.find((c) => c.header === header)?.field;

  it('normalizes punctuation and case out of headers', () => {
    expect(normalizeHeader('PRIMARY E-MAIL:')).toBe('primary e mail');
    expect(normalizeHeader('Mbr #')).toBe('mbr');
  });

  it('maps the obvious columns', () => {
    expect(fieldFor('First Name')).toBe('first_name');
    expect(fieldFor('LAST NAME')).toBe('last_name');
    expect(fieldFor('Primary Email Address')).toBe('email');
    expect(fieldFor('Home Phone')).toBe('phone');
    expect(fieldFor('DOB')).toBe('date_of_birth');
    expect(fieldFor('Household Name')).toBe('household_name');
    expect(fieldFor('Monthly Share')).toBe('share_amount');
    expect(fieldFor('Status')).toBe('status');
  });

  it('maps abbreviations that only an alias table could know', () => {
    expect(fieldFor('Mbr #')).toBe('member_number');
    expect(fieldFor('Relation')).toBe('relationship');
  });

  it('never assigns the same canonical field twice', () => {
    const assigned = columns.map((c) => c.field).filter(Boolean);
    expect(new Set(assigned).size).toBe(assigned.length);
  });

  it('falls back to content sniffing for an unlabeled column', () => {
    const sniffed = inferColumns(['Column A'], [
      { 'Column A': 'a@example.org' },
      { 'Column A': 'b@example.org' },
      { 'Column A': 'c@example.org' },
    ]);
    expect(sniffed[0].field).toBe('email');
    expect(sniffed[0].basis).toBe('content');
    // Content evidence must rank below a header match so the UI flags it.
    expect(sniffed[0].confidence).toBeLessThan(0.7);
  });

  it('collects sample values for the preview table', () => {
    expect(columns.find((c) => c.header === 'First Name')!.samples[0]).toBe('Ruth');
  });

  it('reports missing required fields', () => {
    expect(missingRequiredFields(toMapping(columns))).toEqual([]);
    expect(missingRequiredFields({ 'Some Column': 'email' })).toEqual(['first_name', 'last_name']);
  });
});

describe('value normalization', () => {
  it('reads the date formats that actually turn up', () => {
    expect(normalizeDate('1979-04-12')).toBe('1979-04-12');
    expect(normalizeDate('3/2/1981')).toBe('1981-03-02');
    expect(normalizeDate('11/14/2015')).toBe('2015-11-14');
    expect(normalizeDate('Jan 5 1968')).toBe('1968-01-05');
    expect(normalizeDate('12-25-1990')).toBe('1990-12-25');
  });

  it('swaps day and month when the first part cannot be a month', () => {
    expect(normalizeDate('25/12/1990')).toBe('1990-12-25');
  });

  it('expands two-digit years around the 1950 pivot', () => {
    expect(normalizeDate('3/2/81')).toBe('1981-03-02');
    expect(normalizeDate('3/2/05')).toBe('2005-03-02');
  });

  it('returns null rather than guessing at nonsense', () => {
    expect(normalizeDate('not a date')).toBeNull();
    expect(normalizeDate('')).toBeNull();
  });

  it('formats phones consistently regardless of input shape', () => {
    expect(normalizePhone('(555) 010-1122')).toBe('(555) 010-1122');
    expect(normalizePhone('555.010.1122')).toBe('(555) 010-1122');
    expect(normalizePhone('+1 555 010 1122')).toBe('(555) 010-1122');
    expect(normalizePhone('5550101122')).toBe('(555) 010-1122');
  });

  it('maps a ministry status vocabulary onto ours', () => {
    expect(normalizeStatus('Active')).toBe('active');
    expect(normalizeStatus('A')).toBe('active');
    expect(normalizeStatus('Lapsed')).toBe('lapsed');
    expect(normalizeStatus('Terminated')).toBe('inactive');
    expect(normalizeStatus('something odd')).toBe('active');
  });

  it('reads every spelling of yes', () => {
    for (const yes of ['Y', 'yes', 'TRUE', '1', 'x']) expect(normalizeBoolean(yes)).toBe(true);
    for (const no of ['N', 'no', 'FALSE', '0', '']) expect(normalizeBoolean(no)).toBe(false);
  });

  it('splits a single Name column when there is no last-name column', () => {
    const row = normalizeRow({ Name: 'Ruth Alvarez' }, { Name: 'first_name' });
    expect(row.first_name).toBe('Ruth');
    expect(row.last_name).toBe('Alvarez');
  });

  it('leaves a real first-name column alone', () => {
    const row = normalizeRow(
      { First: 'Mary Jane', Last: 'Alvarez' },
      { First: 'first_name', Last: 'last_name' },
    );
    expect(row.first_name).toBe('Mary Jane');
    expect(row.last_name).toBe('Alvarez');
  });

  it('infers dependency from the relationship', () => {
    const row = normalizeRow({ R: 'Child' }, { R: 'relationship' });
    expect(row.is_dependent).toBe(true);
    expect(row.relationship).toBe('dependent');
  });
});

describe('money is always integer cents', () => {
  it('parses the formats a spreadsheet produces', () => {
    expect(parseCents('$425.00')).toBe(42_500);
    expect(parseCents('1,250.50')).toBe(125_050);
    expect(parseCents('425')).toBe(42_500);
    expect(parseCents(0)).toBe(0);
  });

  it('reads accounting-style negatives', () => {
    expect(parseCents('(1,250.00)')).toBe(-125_000);
    expect(parseCents('-42.50')).toBe(-4_250);
  });

  it('returns null for things that are not amounts', () => {
    expect(parseCents('')).toBeNull();
    expect(parseCents('n/a')).toBeNull();
    expect(parseCents(null)).toBeNull();
  });

  it('rounds rather than truncating', () => {
    expect(parseCents('10.005')).toBe(1001);
  });

  it('formats back to the same value', () => {
    expect(formatCents(42_500)).toBe('$425.00');
    expect(formatCents(125_050)).toBe('$1,250.50');
  });
});

describe('validation rejects little and explains much', () => {
  const base: NormalizedRow = {
    first_name: 'Ruth', last_name: 'Alvarez', email: 'ruth@example.org',
    phone: '(555) 010-1122', date_of_birth: '1979-04-12', member_number: '1001',
    status: 'active', joined_at: null, address_line1: null, address_line2: null,
    city: null, state: null, postal_code: null, household_name: 'Alvarez Household',
    relationship: 'primary', is_dependent: false, is_caregiver: false,
    share_amount_cents: 42_500, notes: null,
  };

  it('passes a clean row with no issues at all', () => {
    expect(validateRow(base, NOW)).toEqual([]);
  });

  it('errors only when there is no name', () => {
    const issues = validateRow({ ...base, first_name: '', last_name: '' }, NOW);
    expect(issues.some((i) => i.severity === 'error')).toBe(true);
  });

  it('treats a half-name as importable', () => {
    const issues = validateRow({ ...base, first_name: '' }, NOW);
    expect(issues.every((i) => i.severity === 'warning')).toBe(true);
    expect(issues.find((i) => i.code === 'name.partial')?.message).toMatch(/only a last name/i);
  });

  it('does not claim a nameless row has half a name', () => {
    const issues = validateRow({ ...base, first_name: '', last_name: '' }, NOW);
    expect(issues.map((i) => i.code)).not.toContain('name.partial');
  });

  it('warns but does not block on a bad email', () => {
    const issues = validateRow({ ...base, email: 'not-an-email' }, NOW);
    expect(issues.find((i) => i.code === 'email.invalid')?.severity).toBe('warning');
  });

  it('flags a member with no way to contact them', () => {
    const issues = validateRow({ ...base, email: null, phone: null }, NOW);
    expect(issues.map((i) => i.code)).toContain('contact.none');
  });

  it('catches impossible dates of birth', () => {
    expect(validateRow({ ...base, date_of_birth: '2030-01-01' }, NOW).map((i) => i.code))
      .toContain('dob.future');
    expect(validateRow({ ...base, date_of_birth: '1850-01-01' }, NOW).map((i) => i.code))
      .toContain('dob.implausible');
  });
});

describe('deduplication', () => {
  const row = (over: Partial<NormalizedRow> = {}): NormalizedRow => ({
    first_name: 'Ruth', last_name: 'Alvarez', email: 'ruth@example.org',
    phone: '(555) 010-1122', date_of_birth: '1979-04-12', member_number: null,
    status: 'active', joined_at: null, address_line1: null, address_line2: null,
    city: null, state: null, postal_code: null, household_name: null,
    relationship: 'member', is_dependent: false, is_caregiver: false,
    share_amount_cents: null, notes: null, ...over,
  });

  it('builds the three keys', () => {
    const keys = dedupeKeys(row());
    expect(keys.dedupe_email).toBe('ruth@example.org');
    expect(keys.dedupe_phone).toBe('5550101122');
    expect(keys.dedupe_name_dob).toBe('alvarez|ruth|1979-04-12');
  });

  it('refuses to use an invalid email as a match key', () => {
    expect(dedupeKeys(row({ email: 'n/a' })).dedupe_email).toBeNull();
  });

  const candidates: MatchCandidate[] = [
    { id: 'mem_ruth', last_name: 'Alvarez', dedupe_email: 'ruth@example.org', dedupe_phone: '5550101122', dedupe_name_dob: 'alvarez|ruth|1979-04-12' },
    { id: 'mem_mia', last_name: 'Alvarez', dedupe_email: null, dedupe_phone: '5550101122', dedupe_name_dob: 'alvarez|mia|2015-11-14' },
  ];

  it('prefers an email match above all', () => {
    expect(findMatch(row(), candidates)).toMatchObject({ member_id: 'mem_ruth', reason: 'email' });
  });

  it('falls back to phone when there is no email', () => {
    const result = findMatch(row({ email: null, date_of_birth: null }), candidates);
    expect(result?.reason).toBe('phone');
  });

  it('will not match on a shared household phone across surnames', () => {
    const result = findMatch(
      row({ email: null, date_of_birth: null, last_name: 'Okafor' }),
      candidates,
    );
    expect(result).toBeNull();
  });

  it('matches on name plus date of birth when there is no contact info', () => {
    const result = findMatch(
      row({ email: null, phone: null, first_name: 'Mia', date_of_birth: '2015-11-14' }),
      candidates,
    );
    expect(result).toMatchObject({ member_id: 'mem_mia', reason: 'name_dob' });
  });

  it('does not match two different people who share a surname', () => {
    expect(findMatch(row({ email: null, phone: null, first_name: 'Nobody', date_of_birth: '1990-01-01' }), candidates))
      .toBeNull();
  });

  it('catches duplicates within a single file', () => {
    const duplicates = findInternalDuplicates([row(), row({ first_name: 'Daniel', email: 'daniel@example.org' }), row()]);
    expect(duplicates.get(2)).toBe(0);
    expect(duplicates.has(1)).toBe(false);
  });
});

describe('the pipeline end to end, on the messy file', () => {
  const analysis = analyzeCsv(MESSY_CSV, { now: NOW });

  it('reads every row', () => {
    expect(analysis.summary.total).toBe(6);
  });

  it('rejects only the nameless row', () => {
    expect(analysis.summary.error).toBe(1);
    expect(analysis.rows.find((r) => r.action === 'error')?.raw['Mbr #']).toBe('1005');
  });

  it('skips the in-file duplicate and points at the original row', () => {
    const skipped = analysis.rows.filter((r) => r.action === 'skip');
    expect(skipped).toHaveLength(1);
    expect(skipped[0].duplicate_of_row).toBe(2);
    expect(skipped[0].issues.map((i) => i.code)).toContain('duplicate.in_file');
  });

  it('creates everyone else', () => {
    expect(analysis.summary.create).toBe(4);
  });

  it('numbers rows the way the spreadsheet does', () => {
    expect(analysis.rows[0].row_number).toBe(2);
  });

  it('groups households', () => {
    expect(analysis.households).toEqual(['Alvarez Household', 'Okafor Household']);
  });

  it('normalizes money into cents', () => {
    expect(analysis.rows[0].normalized.share_amount_cents).toBe(42_500);
    expect(analysis.rows[5].normalized.share_amount_cents).toBe(125_050);
  });

  it('lowercases a shouted email so it matches later', () => {
    expect(analysis.rows[5].normalized.email).toBe('samuel.okafor@example.org');
  });

  it('marks a row as an update when it matches an existing member', () => {
    const withExisting = analyzeCsv(MESSY_CSV, {
      now: NOW,
      candidates: [{
        id: 'mem_existing', last_name: 'Okafor',
        dedupe_email: 'samuel.okafor@example.org', dedupe_phone: null, dedupe_name_dob: null,
      }],
    });
    const updates = withExisting.rows.filter((r) => r.action === 'update');
    expect(updates).toHaveLength(1);
    expect(updates[0].matched_member_id).toBe('mem_existing');
    expect(updates[0].match_reason).toBe('email');
    expect(withExisting.summary.create).toBe(3);
  });

  it('reports nothing missing once inference has run', () => {
    expect(analysis.missing_required).toEqual([]);
  });

  it('honors a user-corrected mapping over its own guess', () => {
    const corrected = analyzeCsv(MESSY_CSV, {
      now: NOW,
      mapping: { 'First Name': 'first_name', 'LAST NAME': 'last_name', 'Notes': 'notes' },
    });
    // Email was deliberately left unmapped — it must not leak through.
    expect(corrected.rows[0].normalized.email).toBeNull();
    expect(corrected.rows[0].normalized.notes).toBe('Prefers text, not email');
  });
});
