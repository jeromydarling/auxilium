/**
 * Structured claim intake validation.
 *
 * The failure this prevents is specific and common: a claim arrives missing a
 * procedure code or an itemized bill, nobody notices, and it sits in a queue
 * for months while the member believes it is being processed. A Raleigh family
 * carried their newborn's bills for months against a stated 17-day turnaround.
 * Orlando Health sued Liberty HealthShare for $1.1 million and Liberty could
 * not produce patient names, procedures, dates, or account numbers for its own
 * claims.
 *
 * Both are the same failure: nothing enforced completeness at the door.
 *
 * The field set is modeled on the ANSI X12 837 professional claim — the format
 * providers and clearinghouses already speak — so a ministry using this can
 * eventually interoperate rather than re-keying PDFs forever. V1 validates the
 * fields; the 837 parser is the natural next step and nothing here blocks it.
 */

export type IntakeSeverity = 'blocking' | 'warning';

export interface IntakeIssue {
  field: string;
  code: string;
  severity: IntakeSeverity;
  message: string;
}

export interface ClaimIntake {
  member_id?: string | null;
  procedure_code?: string | null;
  diagnosis_code?: string | null;
  provider_npi?: string | null;
  provider_name?: string | null;
  service_date?: string | null;
  billed_cents?: number | null;
  has_itemized_bill?: boolean;
  category?: string | null;
}

/**
 * NPI check-digit validation.
 *
 * The National Provider Identifier carries a Luhn check digit computed over
 * the first nine digits prefixed with the constant 80840. Checking it properly
 * rejects transposed and mistyped numbers at the door instead of discovering
 * them when a payment bounces weeks later — and it costs nothing.
 */
export function isValidNpi(npi: string): boolean {
  const digits = npi.replace(/\D/g, '');
  if (digits.length !== 10) return false;

  const payload = `80840${digits.slice(0, 9)}`;
  const checkDigit = Number(digits[9]);

  let sum = 0;
  // Double every second digit from the right of the payload.
  for (let i = 0; i < payload.length; i++) {
    let value = Number(payload[payload.length - 1 - i]);
    if (i % 2 === 0) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
  }

  return (10 - (sum % 10)) % 10 === checkDigit;
}

/**
 * CPT (5 digits), Category II (4 digits + F), Category III (4 digits + T),
 * or HCPCS Level II (a letter followed by 4 digits).
 */
export function isValidProcedureCode(code: string): boolean {
  const value = code.trim().toUpperCase();
  return (
    /^\d{5}$/.test(value) ||          // CPT Category I
    /^\d{4}[FT]$/.test(value) ||      // CPT Category II / III
    /^[A-V]\d{4}$/.test(value)        // HCPCS Level II
  );
}

/**
 * ICD-10-CM: a letter, two digits, then an optional subclassification after a
 * decimal point. Deliberately permissive about the tail — the point is to
 * catch a free-text description typed into a code field, not to reject a valid
 * code this table has not seen.
 */
export function isValidDiagnosisCode(code: string): boolean {
  return /^[A-TV-Z]\d{2}(\.[A-Z0-9]{1,4})?$/i.test(code.trim());
}

/**
 * Validate a claim at the point of entry.
 *
 * `blocking` means the claim cannot be worked and must not be accepted into
 * the queue — this is the whole mechanism. `warning` means it can proceed with
 * a note. The line between them is: could a reviewer actually act on this
 * claim today? If not, it is blocking, because accepting it would be the
 * silent stall the feature exists to prevent.
 */
export function validateIntake(
  claim: ClaimIntake,
  now: string = new Date().toISOString(),
): IntakeIssue[] {
  const issues: IntakeIssue[] = [];

  if (!claim.member_id) {
    issues.push({
      field: 'member_id',
      code: 'member.missing',
      severity: 'blocking',
      message: 'A claim has to belong to a member.',
    });
  }

  // ── Procedure ─────────────────────────────────────────────────────────────
  if (!claim.procedure_code) {
    issues.push({
      field: 'procedure_code',
      code: 'procedure.missing',
      severity: 'blocking',
      message:
        'We need the procedure code (CPT or HCPCS) from the bill. Without it nobody can price ' +
        'or review this claim, and it would sit unworked.',
    });
  } else if (!isValidProcedureCode(claim.procedure_code)) {
    issues.push({
      field: 'procedure_code',
      code: 'procedure.invalid',
      severity: 'blocking',
      message:
        `"${claim.procedure_code}" is not a valid CPT or HCPCS code. CPT codes are five digits; ` +
        'HCPCS codes are a letter followed by four digits.',
    });
  }

  // ── Diagnosis ─────────────────────────────────────────────────────────────
  if (!claim.diagnosis_code) {
    issues.push({
      field: 'diagnosis_code',
      code: 'diagnosis.missing',
      severity: 'warning',
      message: 'No diagnosis code. Eligibility review will be slower without it.',
    });
  } else if (!isValidDiagnosisCode(claim.diagnosis_code)) {
    issues.push({
      field: 'diagnosis_code',
      code: 'diagnosis.invalid',
      severity: 'warning',
      message: `"${claim.diagnosis_code}" does not look like an ICD-10 code (for example, J45.909).`,
    });
  }

  // ── Provider ──────────────────────────────────────────────────────────────
  if (!claim.provider_npi) {
    issues.push({
      field: 'provider_npi',
      code: 'npi.missing',
      severity: 'blocking',
      message:
        'We need the provider\'s NPI. Without it the ministry cannot verify the provider or pay them.',
    });
  } else if (!isValidNpi(claim.provider_npi)) {
    issues.push({
      field: 'provider_npi',
      code: 'npi.invalid',
      severity: 'blocking',
      message:
        `NPI "${claim.provider_npi}" fails its check digit — it is usually a typo or two ` +
        'transposed digits. Please re-check it against the bill.',
    });
  }

  if (!claim.provider_name) {
    issues.push({
      field: 'provider_name',
      code: 'provider.missing',
      severity: 'warning',
      message: 'No provider name recorded.',
    });
  }

  // ── Service date ──────────────────────────────────────────────────────────
  if (!claim.service_date) {
    issues.push({
      field: 'service_date',
      code: 'service_date.missing',
      severity: 'blocking',
      message:
        'We need the date of service. It decides which sharing guidelines apply to this claim.',
    });
  } else {
    const service = Date.parse(claim.service_date);
    if (Number.isNaN(service)) {
      issues.push({
        field: 'service_date',
        code: 'service_date.invalid',
        severity: 'blocking',
        message: 'The date of service could not be read.',
      });
    } else if (service > Date.parse(now)) {
      issues.push({
        field: 'service_date',
        code: 'service_date.future',
        severity: 'blocking',
        message: 'The date of service is in the future.',
      });
    } else if (Date.parse(now) - service > 3 * 365.25 * 86_400_000) {
      issues.push({
        field: 'service_date',
        code: 'service_date.stale',
        severity: 'warning',
        message: 'This service is more than three years old and may fall outside the sharing window.',
      });
    }
  }

  // ── Amount ────────────────────────────────────────────────────────────────
  if (claim.billed_cents === null || claim.billed_cents === undefined || claim.billed_cents <= 0) {
    issues.push({
      field: 'billed_cents',
      code: 'amount.missing',
      severity: 'blocking',
      message: 'We need the billed amount from the provider.',
    });
  }

  // ── Documentation ─────────────────────────────────────────────────────────
  if (!claim.has_itemized_bill) {
    issues.push({
      field: 'has_itemized_bill',
      code: 'itemized.missing',
      severity: 'blocking',
      message:
        'An itemized bill is required. A summary statement cannot be repriced or checked line ' +
        'by line, and claims submitted without one are the ones that stall.',
    });
  }

  return issues;
}

export function hasBlockingIssue(issues: IntakeIssue[]): boolean {
  return issues.some((i) => i.severity === 'blocking');
}

/**
 * A single sentence naming what is still needed, for the member-facing tracker.
 * "Missing: the procedure code and an itemized bill" beats a validation table.
 */
export function describeMissing(issues: IntakeIssue[]): string | null {
  const blocking = issues.filter((i) => i.severity === 'blocking');
  if (blocking.length === 0) return null;

  const names: Record<string, string> = {
    member_id: 'the member',
    procedure_code: 'the procedure code',
    diagnosis_code: 'the diagnosis code',
    provider_npi: "the provider's NPI",
    provider_name: 'the provider name',
    service_date: 'the date of service',
    billed_cents: 'the billed amount',
    has_itemized_bill: 'an itemized bill',
  };

  const missing = [...new Set(blocking.map((i) => names[i.field] ?? i.field))];
  const list =
    missing.length === 1 ? missing[0]
    : missing.length === 2 ? `${missing[0]} and ${missing[1]}`
    : `${missing.slice(0, -1).join(', ')}, and ${missing[missing.length - 1]}`;

  return `Still needed: ${list}.`;
}
