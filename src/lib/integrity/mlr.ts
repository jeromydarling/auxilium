import { BPS, ACA_MLR_INDIVIDUAL_BPS, type PeriodLedger, type IntegrityBand } from './types';

/**
 * Share-ratio arithmetic — Auxilium's equivalent of a medical loss ratio.
 *
 * The ratio is simple and the simplicity is the point: of every dollar members
 * contributed, how many cents went to sharing their medical costs? Aliera kept
 * roughly 84 cents. Medical Cost Sharing shared 3.5 cents. Both were selling
 * the same story as ministries doing this honestly, and from the outside,
 * before the lawsuits, they were nearly indistinguishable.
 *
 * Everything stays in basis points and integer cents. A ratio that drifts by a
 * rounding error is a ratio a board will stop trusting.
 */

/** Cents shared ÷ cents contributed, in basis points. */
export function shareRatioBps(sharedCents: number, contributionsCents: number): number {
  if (contributionsCents <= 0) return 0;
  return Math.round((sharedCents * BPS) / contributionsCents);
}

/** 8000 → "80.0%" */
export function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(1)}%`;
}

/**
 * Administrative overhead as a share of contributions. Not the inverse of the
 * share ratio: money can sit unspent, which is its own signal — a ministry
 * collecting steadily and disbursing nothing is the MCS pattern exactly.
 */
export function overheadRatioBps(ledger: PeriodLedger): number {
  const overhead =
    ledger.administrative_cents + ledger.marketing_cents + ledger.related_party_cents;
  return shareRatioBps(overhead, ledger.contributions_cents);
}

/**
 * Money in that has not gone anywhere. Positive is normal — reserves are
 * prudent. Persistently large and rising, with no sharing, is not.
 */
export function unallocatedCents(ledger: PeriodLedger): number {
  return (
    ledger.contributions_cents -
    ledger.shared_cents -
    ledger.administrative_cents -
    ledger.marketing_cents -
    ledger.related_party_cents
  );
}

/**
 * Bands for the share ratio itself.
 *
 * Anchored to the ACA floor rather than invented: 80% is the number a
 * regulated individual-market plan must hit, so it is the number a ministry
 * gets compared to whether or not it is bound by it.
 */
export function ratioBand(bps: number): IntegrityBand {
  if (bps >= ACA_MLR_INDIVIDUAL_BPS) return 'healthy';   // ≥ 80%
  if (bps >= 6_500) return 'watch';                      // 65–79%
  if (bps >= 5_000) return 'concern';                    // 50–64%
  return 'critical';                                     // < 50% — Aliera at 16%
}

/** Sum several periods into one ledger. Used for trailing-window ratios. */
export function combineLedgers(periods: PeriodLedger[]): PeriodLedger {
  if (periods.length === 0) {
    return emptyLedger('');
  }

  const combined = periods.reduce<PeriodLedger>(
    (acc, p) => ({
      period: acc.period,
      contributions_cents: acc.contributions_cents + p.contributions_cents,
      fees_cents: acc.fees_cents + p.fees_cents,
      shared_cents: acc.shared_cents + p.shared_cents,
      administrative_cents: acc.administrative_cents + p.administrative_cents,
      marketing_cents: acc.marketing_cents + p.marketing_cents,
      related_party_cents: acc.related_party_cents + p.related_party_cents,
      members_shared_with: Math.max(acc.members_shared_with, p.members_shared_with),
      top_payee_name: p.top_payee_cents > acc.top_payee_cents ? p.top_payee_name : acc.top_payee_name,
      top_payee_cents: Math.max(acc.top_payee_cents, p.top_payee_cents),
    }),
    emptyLedger(`${periods[periods.length - 1].period}..${periods[0].period}`),
  );

  return combined;
}

export function emptyLedger(period: string): PeriodLedger {
  return {
    period,
    contributions_cents: 0,
    fees_cents: 0,
    shared_cents: 0,
    administrative_cents: 0,
    marketing_cents: 0,
    related_party_cents: 0,
    members_shared_with: 0,
    top_payee_name: null,
    top_payee_cents: 0,
  };
}

/**
 * Ratio movement between the recent window and the one before it, in basis
 * points. Negative means the ratio is falling — less of each member dollar
 * reaching medical costs than before.
 *
 * Drift matters more than level for early warning. A ministry does not go from
 * 82% to 16% in a month; it slides, and each individual month looks defensible.
 */
export function ratioDriftBps(ledger: PeriodLedger[], windowSize = 3): number {
  if (ledger.length < windowSize * 2) return 0;

  const recent = combineLedgers(ledger.slice(0, windowSize));
  const prior = combineLedgers(ledger.slice(windowSize, windowSize * 2));

  if (prior.contributions_cents === 0 || recent.contributions_cents === 0) return 0;

  return (
    shareRatioBps(recent.shared_cents, recent.contributions_cents) -
    shareRatioBps(prior.shared_cents, prior.contributions_cents)
  );
}

/**
 * Consecutive most-recent periods that took money in and shared nothing.
 *
 * Medical Cost Sharing distributed zero dollars to members from February 2021
 * onward while continuing to collect. A single such month is a quiet month; a
 * run of them is the loudest signal this system can produce.
 */
export function consecutiveZeroShareperiods(ledger: PeriodLedger[]): number {
  let count = 0;
  for (const period of ledger) {
    if (period.contributions_cents > 0 && period.shared_cents === 0) count++;
    else break;
  }
  return count;
}
