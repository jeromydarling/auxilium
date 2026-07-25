import { parseCsv } from './csv';
import { inferColumns, toMapping, missingRequiredFields, type InferredColumn } from './infer';
import { normalizeRow } from './normalize';
import { validateRow, hasBlockingError, type RowIssue } from './validate';
import { findMatch, findInternalDuplicates, dedupeKeys, type MatchCandidate, type MatchReason } from './dedupe';
import type { ColumnMapping, NormalizedRow } from './fields';

/**
 * The import pipeline, as one pure orchestration.
 *
 * Stages: parse → infer → map → normalize → validate → dedupe → preview.
 * Nothing here writes anything. The Worker calls `analyze()` to build a
 * preview, persists that preview to import_rows, shows it to a human, and only
 * writes members when the human commits. That ordering is the whole safety
 * story of the feature — an import is never a surprise.
 *
 * XLSX support slots in at exactly one place: replace `parseCsv` with a format
 * dispatch that yields the same `{headers, rows}`. Everything downstream is
 * format-agnostic already.
 */

export type RowAction = 'create' | 'update' | 'skip' | 'error';

export interface PreviewRow {
  row_number: number;
  raw: Record<string, string>;
  normalized: NormalizedRow;
  action: RowAction;
  issues: RowIssue[];
  matched_member_id: string | null;
  match_reason: MatchReason | null;
  /** Set when this row duplicates an earlier row in the same file. */
  duplicate_of_row: number | null;
}

export interface ImportAnalysis {
  headers: string[];
  columns: InferredColumn[];
  mapping: ColumnMapping;
  missing_required: string[];
  warnings: string[];
  rows: PreviewRow[];
  summary: ImportSummary;
  /** Distinct household names seen, in file order. Drives household creation. */
  households: string[];
}

export interface ImportSummary {
  total: number;
  create: number;
  update: number;
  skip: number;
  error: number;
  /** Rows carrying at least one warning. They still import. */
  with_warnings: number;
}

export interface AnalyzeOptions {
  /** Overrides inference. Supplied once the user has confirmed the mapping. */
  mapping?: ColumnMapping;
  /** Existing members that could match, pre-narrowed by an indexed query. */
  candidates?: MatchCandidate[];
  maxRows?: number;
  now?: string;
}

export function analyzeCsv(content: string, options: AnalyzeOptions = {}): ImportAnalysis {
  const { rows: rawRows, headers, warnings } = parseCsv(content, options.maxRows ?? 10_000);
  const columns = inferColumns(headers, rawRows);
  const mapping = options.mapping ?? toMapping(columns);
  return analyzeRows(headers, rawRows, columns, mapping, warnings, options);
}

export function analyzeRows(
  headers: string[],
  rawRows: Record<string, string>[],
  columns: InferredColumn[],
  mapping: ColumnMapping,
  warnings: string[],
  options: AnalyzeOptions = {},
): ImportAnalysis {
  const now = options.now ?? new Date().toISOString();
  const candidates = options.candidates ?? [];

  const normalized = rawRows.map((raw) => normalizeRow(raw, mapping));
  const internalDuplicates = findInternalDuplicates(normalized);

  const rows: PreviewRow[] = normalized.map((norm, index) => {
    const issues = validateRow(norm, now);
    const raw = rawRows[index];
    const rowNumber = index + 2; // +1 for zero-index, +1 for the header row

    if (hasBlockingError(issues)) {
      return {
        row_number: rowNumber, raw, normalized: norm, action: 'error', issues,
        matched_member_id: null, match_reason: null, duplicate_of_row: null,
      };
    }

    const duplicateOf = internalDuplicates.get(index);
    if (duplicateOf !== undefined) {
      return {
        row_number: rowNumber, raw, normalized: norm, action: 'skip',
        issues: [...issues, {
          code: 'duplicate.in_file',
          field: null,
          message: `This person also appears on row ${duplicateOf + 2} of this file. Only the first was kept.`,
          severity: 'warning' as const,
        }],
        matched_member_id: null, match_reason: null, duplicate_of_row: duplicateOf + 2,
      };
    }

    const match = findMatch(norm, candidates);
    if (match) {
      return {
        row_number: rowNumber, raw, normalized: norm, action: 'update',
        issues: [...issues, {
          code: 'duplicate.existing',
          field: null,
          message: `Matches an existing member by ${matchLabel(match.reason)}. Their record will be updated, not duplicated.`,
          severity: 'warning' as const,
        }],
        matched_member_id: match.member_id, match_reason: match.reason, duplicate_of_row: null,
      };
    }

    return {
      row_number: rowNumber, raw, normalized: norm, action: 'create', issues,
      matched_member_id: null, match_reason: null, duplicate_of_row: null,
    };
  });

  const households = [...new Set(
    rows
      .filter((r) => r.action !== 'error')
      .map((r) => r.normalized.household_name)
      .filter((h): h is string => Boolean(h)),
  )];

  return {
    headers,
    columns,
    mapping,
    missing_required: missingRequiredFields(mapping),
    warnings,
    rows,
    summary: summarize(rows),
    households,
  };
}

function matchLabel(reason: MatchReason): string {
  return reason === 'email' ? 'email address'
    : reason === 'phone' ? 'phone number and last name'
    : 'name and date of birth';
}

export function summarize(rows: PreviewRow[]): ImportSummary {
  return {
    total: rows.length,
    create: rows.filter((r) => r.action === 'create').length,
    update: rows.filter((r) => r.action === 'update').length,
    skip: rows.filter((r) => r.action === 'skip').length,
    error: rows.filter((r) => r.action === 'error').length,
    with_warnings: rows.filter((r) => r.issues.some((i) => i.severity === 'warning')).length,
  };
}

/** The dedupe keys to persist alongside a member created from this row. */
export function keysForRow(row: PreviewRow) {
  return dedupeKeys(row.normalized);
}
