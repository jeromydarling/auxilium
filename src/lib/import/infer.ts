import { FIELD_SPECS, type CanonicalField, type ColumnMapping } from './fields';

/**
 * Column inference — guessing which spreadsheet column is which member field.
 *
 * Two passes, both cheap and both explainable:
 *   1. Header matching against the alias table (exact, then normalized, then
 *      contains). This gets the overwhelming majority of real files.
 *   2. Content sniffing for the columns pass 1 missed — a column of things
 *      shaped like emails is an email column whatever it's labeled.
 *
 * Inference is always a *suggestion*. The UI shows every guess with its
 * confidence and the user confirms before a single row is written. The cost of
 * a wrong guess should be one dropdown change, never a corrupted roster.
 */

export interface InferredColumn {
  header: string;
  field: CanonicalField | null;
  confidence: number;
  /** How the guess was made, shown in the mapping UI. */
  basis: 'exact-header' | 'alias' | 'partial-header' | 'content' | 'none';
  /** First few non-empty values, for the preview table. */
  samples: string[];
}

/** Strip punctuation and collapse whitespace: "PRIMARY E-MAIL:" → "primary e mail". */
export function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/[_\-/\\.]+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Hyphen last in the class so it is a literal, not a range.
const PHONE_RE = /^[\d\s()+.-]{7,}$/;
const DATE_RE = /^(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{1,2}-\d{1,2}-\d{2,4})$/;
const MONEY_RE = /^\(?\$?\s?[\d,]+(\.\d{1,2})?\)?$/;
const ZIP_RE = /^\d{5}(-\d{4})?$/;

export function inferColumns(
  headers: string[],
  rows: Record<string, string>[],
): InferredColumn[] {
  const taken = new Set<CanonicalField>();
  const results: InferredColumn[] = headers.map((header) => ({
    header,
    field: null,
    confidence: 0,
    basis: 'none' as const,
    samples: sampleValues(rows, header),
  }));

  // ── Pass 1: header matching, strongest evidence first ─────────────────────
  // Run the whole corpus at each strength level before dropping to a weaker
  // one, so a weak partial match never claims a field that an exact match on a
  // later column would have wanted.
  for (const strength of ['exact', 'alias', 'partial'] as const) {
    results.forEach((result) => {
      if (result.field) return;
      const normalized = normalizeHeader(result.header);
      if (!normalized) return;

      for (const spec of FIELD_SPECS) {
        if (taken.has(spec.key)) continue;

        if (strength === 'exact' && normalized === normalizeHeader(spec.label)) {
          assign(result, spec.key, 1, 'exact-header', taken);
          return;
        }
        if (strength === 'alias' && spec.aliases.some((a) => normalizeHeader(a) === normalized)) {
          assign(result, spec.key, 0.95, 'alias', taken);
          return;
        }
        if (strength === 'partial') {
          const hit = spec.aliases.find(
            (a) => {
              const alias = normalizeHeader(a);
              return alias.length >= 4 && (normalized.includes(alias) || alias.includes(normalized));
            },
          );
          if (hit) {
            assign(result, spec.key, 0.7, 'partial-header', taken);
            return;
          }
        }
      }
    });
  }

  // ── Pass 2: content sniffing for whatever is still unmapped ───────────────
  results.forEach((result) => {
    if (result.field || result.samples.length === 0) return;
    const guess = sniffContent(result.samples, taken);
    if (guess) assign(result, guess.field, guess.confidence, 'content', taken);
  });

  return results;
}

function assign(
  result: InferredColumn,
  field: CanonicalField,
  confidence: number,
  basis: InferredColumn['basis'],
  taken: Set<CanonicalField>,
): void {
  result.field = field;
  result.confidence = confidence;
  result.basis = basis;
  taken.add(field);
}

function sampleValues(rows: Record<string, string>[], header: string, limit = 5): string[] {
  const out: string[] = [];
  for (const row of rows) {
    const value = row[header];
    if (value && value.trim()) out.push(value.trim());
    if (out.length >= limit) break;
  }
  return out;
}

/** Does at least 80% of the sample match? That's a column, not a coincidence. */
function ratio(samples: string[], test: (v: string) => boolean): number {
  if (samples.length === 0) return 0;
  return samples.filter(test).length / samples.length;
}

function sniffContent(
  samples: string[],
  taken: Set<CanonicalField>,
): { field: CanonicalField; confidence: number } | null {
  const candidates: { field: CanonicalField; score: number }[] = [];

  const consider = (field: CanonicalField, score: number) => {
    if (!taken.has(field) && score >= 0.8) candidates.push({ field, score });
  };

  consider('email', ratio(samples, (v) => EMAIL_RE.test(v)));
  consider('postal_code', ratio(samples, (v) => ZIP_RE.test(v)));
  // Phone must not swallow plain numeric columns — require some real digits.
  consider('phone', ratio(samples, (v) => PHONE_RE.test(v) && digitsOnly(v).length >= 7));
  consider('date_of_birth', ratio(samples, (v) => DATE_RE.test(v)));
  consider('share_amount', ratio(samples, (v) => MONEY_RE.test(v) && /[$.,]/.test(v)));

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  // Content evidence is real but weaker than a matching header — cap it below
  // the alias tier so the UI sorts "please check this" guesses to the top.
  return { field: candidates[0].field, confidence: Math.min(0.6, candidates[0].score * 0.6) };
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

/** Collapse inference results into the mapping the rest of the pipeline consumes. */
export function toMapping(columns: InferredColumn[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  for (const c of columns) mapping[c.header] = c.field;
  return mapping;
}

/**
 * Which required fields the current mapping does not satisfy. The commit button
 * stays disabled while this is non-empty — a roster without names is not a
 * roster.
 */
export function missingRequiredFields(mapping: ColumnMapping): CanonicalField[] {
  const mapped = new Set(Object.values(mapping).filter(Boolean) as CanonicalField[]);
  return FIELD_SPECS.filter((f) => f.required && !mapped.has(f.key)).map((f) => f.key);
}
