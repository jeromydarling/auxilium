/**
 * A small RFC 4180 CSV parser.
 *
 * Written by hand rather than pulled from npm for two reasons: it runs inside
 * the Worker where every kilobyte of bundle is real, and messy ministry
 * exports need forgiving behavior that most libraries make hard to reach —
 * BOM stripping, mixed line endings, ragged rows, and duplicate headers all
 * appear in the first real file anyone uploads.
 *
 * Deliberately *not* handled: streaming. V1 caps imports at IMPORT_MAX_ROWS and
 * reads the whole file. When rosters outgrow that, this is the seam where a
 * streaming parser goes, and nothing above it needs to change.
 */

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
  /** Non-fatal problems worth showing the user before they map columns. */
  warnings: string[];
}

const BOM = '﻿';

export function parseCsv(input: string, maxRows = 10_000): ParsedCsv {
  const warnings: string[] = [];
  let text = input;
  if (text.startsWith(BOM)) text = text.slice(1);
  // Normalize line endings so \r\n and lone \r files behave identically.
  text = text.replace(/\r\n?/g, '\n');

  const records = splitRecords(text);
  if (records.length === 0) {
    return { headers: [], rows: [], warnings: ['The file appears to be empty.'] };
  }

  const rawHeaders = records[0].map((h) => h.trim());
  const headers = dedupeHeaders(rawHeaders, warnings);

  const dataRecords = records.slice(1);
  let truncated = false;
  const limited = dataRecords.length > maxRows
    ? (truncated = true, dataRecords.slice(0, maxRows))
    : dataRecords;

  if (truncated) {
    warnings.push(
      `File has ${dataRecords.length} rows; only the first ${maxRows} were read. ` +
      'Split the file and import in batches.',
    );
  }

  const rows: Record<string, string>[] = [];
  let raggedCount = 0;

  for (const record of limited) {
    // A record of one empty cell is a blank line — skip silently.
    if (record.length === 1 && record[0].trim() === '') continue;

    if (record.length !== headers.length) raggedCount++;

    const row: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      row[headers[i]] = (record[i] ?? '').trim();
    }
    rows.push(row);
  }

  if (raggedCount > 0) {
    warnings.push(
      `${raggedCount} row${raggedCount === 1 ? '' : 's'} had a different number of columns than ` +
      'the header. Missing cells were treated as empty.',
    );
  }

  return { headers, rows, warnings };
}

/**
 * Split the document into records of fields, honoring quoted sections that may
 * contain commas and newlines. A doubled quote inside a quoted field is a
 * literal quote, per the spec.
 */
function splitRecords(text: string): string[][] {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      record.push(field);
      field = '';
    } else if (char === '\n') {
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else {
      field += char;
    }
  }

  // Trailing record with no final newline.
  if (field !== '' || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  return records;
}

/**
 * Duplicate and empty headers are common in exported spreadsheets. Rename
 * rather than reject — the user can still map whichever column they meant.
 */
function dedupeHeaders(headers: string[], warnings: string[]): string[] {
  const seen = new Map<string, number>();
  const out: string[] = [];
  let hadEmpty = false;
  let hadDuplicate = false;

  headers.forEach((header, index) => {
    let name = header;
    if (name === '') {
      name = `Column ${index + 1}`;
      hadEmpty = true;
    }
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    if (count > 0) {
      hadDuplicate = true;
      name = `${name} (${count + 1})`;
    }
    out.push(name);
  });

  if (hadEmpty) warnings.push('Some columns had no header and were given placeholder names.');
  if (hadDuplicate) warnings.push('Some column names appeared more than once and were numbered.');

  return out;
}

/** Serialize rows back to CSV — used for the "download rejected rows" affordance. */
export function toCsv(headers: string[], rows: Record<string, unknown>[]): string {
  const escape = (value: unknown): string => {
    const s = value === null || value === undefined ? '' : String(value);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(escape).join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(','));
  }
  return lines.join('\n');
}
