/**
 * The migration manifest: metadata about what is moving, never the payment
 * data itself.
 *
 * A ministry uploads a manifest so Auxilium can check the migration will work
 * *before* the ten-day round trip, and so every member can be tracked from
 * "listed" to "charged successfully" afterwards. What the manifest contains is
 * deliberately boring: a legacy customer id, an email, a last four, an expiry,
 * a wallet flag. That is enough to reconcile and to spot trouble, and it is
 * categorically not enough to charge anyone.
 *
 * The most important function in this file is `containsCardData`. It exists
 * because the failure it prevents is silent: a well-meaning administrator
 * exports "everything" from their old processor and uploads it here, and now
 * primary account numbers are sitting in a system that was never designed to
 * hold them. Refusing the file is the only correct response, and it has to
 * happen before anything is stored.
 */

export type WalletType = 'none' | 'apple_pay' | 'google_pay' | 'other_wallet';

export interface ManifestRow {
  /** The old processor's identifier. The join key for everything downstream. */
  legacy_customer_id: string;
  email?: string;
  member_number?: string;
  last4?: string;
  exp_month?: number;
  exp_year?: number;
  /** 'card' or 'bank'. Bank mandates migrate more reliably than cards. */
  method?: 'card' | 'bank' | 'unknown';
  wallet?: WalletType;
  /** Monthly contribution in integer cents, for rebuilding the subscription. */
  amount_cents?: number;
  /** Day of month the member is currently billed on. Preserved so nobody is double-charged. */
  billing_day?: number;
}

export type IssueLevel = 'blocking' | 'warning' | 'info';

export interface ManifestIssue {
  level: IssueLevel;
  code: string;
  message: string;
  /** Row index, when the issue belongs to one row. */
  row?: number;
}

export interface ManifestReport {
  total: number;
  /** Rows that can proceed as-is. */
  ready: number;
  /** Rows that will migrate but need a human to look at something. */
  flagged: number;
  /** Rows that cannot migrate and need the member contacted. */
  manual: number;
  issues: ManifestIssue[];
  /** Counts by wallet type — the segment Stripe's import cannot fully cover. */
  wallets: Record<WalletType, number>;
  byMethod: { card: number; bank: number; unknown: number };
}

/**
 * Does this text contain something that looks like a card number?
 *
 * Any run of 13–19 digits that passes the Luhn check, allowing for spaces and
 * dashes because that is how they appear in a spreadsheet export. Luhn matters:
 * without it every long member ID and phone number trips the alarm, the alarm
 * gets ignored, and it stops protecting anything.
 *
 * Deliberately conservative in the safe direction — a false positive costs an
 * administrator one confused minute, a false negative puts card numbers in a
 * database that has no business holding them.
 */
export function containsCardData(text: string): boolean {
  const candidates = text.match(/\d[\d -]{11,22}\d/g);
  if (!candidates) return false;

  for (const candidate of candidates) {
    const digits = candidate.replace(/[^\d]/g, '');
    if (digits.length < 13 || digits.length > 19) continue;
    if (luhn(digits)) return true;
  }
  return false;
}

function luhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * Check a manifest before anybody commits to a ten-day round trip.
 *
 * Blocking issues stop the migration request. Warnings let it proceed but name
 * the members who will need a phone call. The distinction matters: a manifest
 * that is 98% clean should not be rejected wholesale, because the 2% is exactly
 * the list staff need to work through.
 */
export function validateManifest(rows: ManifestRow[], rawText?: string): ManifestReport {
  const issues: ManifestIssue[] = [];
  const wallets: Record<WalletType, number> = {
    none: 0,
    apple_pay: 0,
    google_pay: 0,
    other_wallet: 0,
  };
  const byMethod = { card: 0, bank: 0, unknown: 0 };

  // Before anything else. If the raw upload carries card numbers, nothing about
  // this file is safe to keep, and no per-row analysis should run on it.
  if (rawText && containsCardData(rawText)) {
    return {
      total: 0,
      ready: 0,
      flagged: 0,
      manual: 0,
      wallets,
      byMethod,
      issues: [
        {
          level: 'blocking',
          code: 'card_data_present',
          message:
            'This file appears to contain full card numbers. Auxilium will not store it, and it ' +
            'has not been saved. Card data must go from your current processor to Stripe ' +
            'directly — the manifest uploaded here should only contain the last four digits. ' +
            'Re-export without the full number and try again.',
        },
      ],
    };
  }

  if (rows.length === 0) {
    issues.push({ level: 'blocking', code: 'empty', message: 'The manifest has no rows in it.' });
  }

  const seen = new Set<string>();
  let ready = 0;
  let flagged = 0;
  let manual = 0;

  rows.forEach((row, index) => {
    let rowManual = false;
    let rowFlagged = false;

    // The join key. Without it the returned mapping cannot be matched to anyone.
    if (!row.legacy_customer_id?.trim()) {
      issues.push({
        level: 'blocking',
        code: 'missing_legacy_id',
        message: 'No identifier from the old processor, so this member cannot be matched afterwards.',
        row: index,
      });
      rowManual = true;
    } else if (seen.has(row.legacy_customer_id)) {
      issues.push({
        level: 'warning',
        code: 'duplicate_legacy_id',
        message: `Identifier "${row.legacy_customer_id}" appears more than once.`,
        row: index,
      });
      rowFlagged = true;
    } else {
      seen.add(row.legacy_customer_id);
    }

    // Something to match on. member_number is the ministry's own ID and is the
    // most reliable; email is the fallback.
    if (!row.email?.trim() && !row.member_number?.trim()) {
      issues.push({
        level: 'warning',
        code: 'unmatchable',
        message:
          'Neither an email nor a member number, so this row will need to be matched to a ' +
          'member by hand after the import.',
        row: index,
      });
      rowFlagged = true;
    }

    const method = row.method ?? 'unknown';
    byMethod[method] += 1;

    const wallet = row.wallet ?? 'none';
    wallets[wallet] += 1;

    // The one segment Stripe's infrastructure genuinely cannot cover.
    if (wallet === 'google_pay') {
      issues.push({
        level: 'warning',
        code: 'google_pay_unmigratable',
        message:
          'Google Pay tokens cannot be migrated between processors at all. This member will ' +
          'need to add a payment method again, whatever else happens.',
        row: index,
      });
      rowManual = true;
    } else if (wallet === 'apple_pay') {
      issues.push({
        level: 'warning',
        code: 'apple_pay_separate_request',
        message:
          'Apple Pay tokens need a separate device-token migration request and are not covered ' +
          'by the standard card import.',
        row: index,
      });
      rowFlagged = true;
    }

    // An expired card will not migrate usefully. Better to know now.
    if (method === 'card' && row.exp_year && row.exp_month) {
      if (!isPlausibleExpiry(row.exp_month, row.exp_year)) {
        issues.push({
          level: 'warning',
          code: 'implausible_expiry',
          message: `Expiry ${row.exp_month}/${row.exp_year} does not look valid.`,
          row: index,
        });
        rowFlagged = true;
      }
    }

    if (row.amount_cents !== undefined && row.amount_cents <= 0) {
      issues.push({
        level: 'warning',
        code: 'no_amount',
        message: 'No contribution amount, so a subscription cannot be rebuilt automatically.',
        row: index,
      });
      rowFlagged = true;
    }

    if (row.billing_day !== undefined && (row.billing_day < 1 || row.billing_day > 31)) {
      issues.push({
        level: 'warning',
        code: 'bad_billing_day',
        message: `Billing day ${row.billing_day} is not a day of the month.`,
        row: index,
      });
      rowFlagged = true;
    }

    if (rowManual) manual += 1;
    else if (rowFlagged) flagged += 1;
    else ready += 1;
  });

  // Said once, at the top, rather than per row — this is a planning fact about
  // the whole migration, not a defect in anybody's record.
  if (byMethod.bank > 0) {
    issues.push({
      level: 'info',
      code: 'bank_mandates',
      message:
        `${byMethod.bank} members pay by bank draft. Those authorizations are already verified, ` +
        'so Stripe can accept them without asking anyone to confirm microdeposits again.',
    });
  }

  return { total: rows.length, ready, flagged, manual, issues, wallets, byMethod };
}

/** A month/year that is a real month and not absurdly far out. */
function isPlausibleExpiry(month: number, year: number): boolean {
  if (month < 1 || month > 12) return false;
  if (year < 2000 || year > 2100) return false;
  return true;
}

// ── Reconciliation ───────────────────────────────────────────────────────────

/** One line of the mapping file Stripe returns once the import completes. */
export interface StripeMappingRow {
  legacy_customer_id: string;
  stripe_customer_id: string;
  stripe_payment_method_id?: string;
}

/** A roster member, reduced to what matching needs. */
export interface MatchableMember {
  id: string;
  email: string | null;
  member_number: string | null;
}

export type MatchMethod = 'member_number' | 'email' | 'unmatched';

export interface ReconciledRow {
  legacy_customer_id: string;
  stripe_customer_id: string;
  stripe_payment_method_id?: string;
  member_id: string | null;
  match_method: MatchMethod;
}

export interface ReconciliationReport {
  matched: number;
  unmatched: number;
  rows: ReconciledRow[];
}

/**
 * Match Stripe's returned mapping to the ministry's roster.
 *
 * Two match methods, tried in order of how much they can be trusted: the
 * ministry's own member number first, then email.
 *
 * **No fuzzy matching, for the same reason the roster importer has none.**
 * Attaching a payment method to the wrong member does not produce a duplicate
 * that somebody notices later — it charges the wrong family. An unmatched row
 * is a name on a short list for a human to resolve; a wrongly matched row is a
 * phone call from someone whose bank account was debited for a stranger.
 */
export function reconcile(
  manifest: ManifestRow[],
  mapping: StripeMappingRow[],
  members: MatchableMember[],
): ReconciliationReport {
  const byNumber = new Map<string, string>();
  const byEmail = new Map<string, string>();

  for (const member of members) {
    if (member.member_number) {
      const key = member.member_number.trim();
      // An ambiguous key is worse than no key: mark it poisoned rather than
      // letting last-write-wins pick a member arbitrarily.
      byNumber.set(key, byNumber.has(key) ? '' : member.id);
    }
    if (member.email) {
      const key = member.email.trim().toLowerCase();
      byEmail.set(key, byEmail.has(key) ? '' : member.id);
    }
  }

  const manifestByLegacyId = new Map(manifest.map((r) => [r.legacy_customer_id, r]));

  const rows: ReconciledRow[] = mapping.map((entry) => {
    const source = manifestByLegacyId.get(entry.legacy_customer_id);

    let memberId: string | null = null;
    let method: MatchMethod = 'unmatched';

    if (source?.member_number) {
      const hit = byNumber.get(source.member_number.trim());
      if (hit) {
        memberId = hit;
        method = 'member_number';
      }
    }

    if (!memberId && source?.email) {
      const hit = byEmail.get(source.email.trim().toLowerCase());
      if (hit) {
        memberId = hit;
        method = 'email';
      }
    }

    return {
      legacy_customer_id: entry.legacy_customer_id,
      stripe_customer_id: entry.stripe_customer_id,
      stripe_payment_method_id: entry.stripe_payment_method_id,
      member_id: memberId,
      match_method: method,
    };
  });

  return {
    matched: rows.filter((r) => r.member_id).length,
    unmatched: rows.filter((r) => !r.member_id).length,
    rows,
  };
}

/**
 * The next billing date to anchor a rebuilt subscription to.
 *
 * Preserving the member's existing billing day is the whole point. Get it wrong
 * by charging early and a household is overdrawn; get it wrong by charging late
 * and the ministry has a gap in its sharing pool.
 *
 * Days past the end of a short month clamp to the last day rather than rolling
 * into the next one — a member billed on the 31st should be billed in February,
 * not skipped.
 */
export function nextBillingDate(billingDay: number, from: Date): Date {
  const day = Math.min(Math.max(Math.trunc(billingDay), 1), 31);
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth();

  const clampToMonth = (y: number, m: number) => {
    const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return new Date(Date.UTC(y, m, Math.min(day, lastDay)));
  };

  const thisMonth = clampToMonth(year, month);
  if (thisMonth.getTime() > from.getTime()) return thisMonth;

  return clampToMonth(month === 11 ? year + 1 : year, month === 11 ? 0 : month + 1);
}
