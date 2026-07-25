/**
 * Money is integer cents, everywhere, always. There is no float currency in
 * this codebase and there should never be one — a share amount that drifts by a
 * cent is a member calling to ask why their statement is wrong.
 */

/** Format cents for display: 125000 → "$1,250.00". */
export function formatCents(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

/** Compact form for dense tables and signal chips: 125000 → "$1.25K". */
export function formatCentsCompact(cents: number): string {
  const dollars = cents / 100;
  if (Math.abs(dollars) >= 1000) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
      maximumFractionDigits: 2,
    }).format(dollars);
  }
  return formatCents(cents);
}

/**
 * Parse a human-entered or CSV-sourced amount into integer cents.
 * Accepts "$1,250.00", "1250", "1250.5", "(1,250.00)" (accounting negative).
 * Returns null when the input is not a usable amount — callers decide whether
 * that is a validation error or simply an absent value.
 */
export function parseCents(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined || input === '') return null;
  if (typeof input === 'number') {
    return Number.isFinite(input) ? Math.round(input * 100) : null;
  }

  let s = input.trim();
  if (!s) return null;

  // Accounting-style negatives: (1,250.00)
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  }

  s = s.replace(/[$\s,]/g, '');
  if (!/^\d*\.?\d*$/.test(s) || s === '' || s === '.') return null;

  const value = Number(s);
  if (!Number.isFinite(value)) return null;

  // Round rather than truncate: 10.005 → 1001, not 1000.
  const cents = Math.round(value * 100);
  return negative ? -cents : cents;
}
