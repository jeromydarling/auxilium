/**
 * Billing periods.
 *
 * A period is a calendar month in UTC, keyed 'YYYY-MM' so it sorts
 * lexicographically and survives D1's type affinity — the same convention the
 * contributions ledger already uses for its sharing month.
 *
 * Pure, like everything in src/lib. The clock is always an argument. Billing
 * code that reads the wall clock cannot be tested for the two cases that
 * actually matter: the last second of a month, and a period being closed late.
 */

import {
  platformFeeCents,
  blendedRateBps,
  MINIMUM_MONTHLY_CENTS,
} from '../pricing/tiers';

/** 'YYYY-MM' for an instant. */
export function periodKey(at: Date): string {
  const y = at.getUTCFullYear();
  const m = String(at.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** The period before this one. '2026-01' → '2025-12'. */
export function previousPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** Inclusive start and exclusive end of a period, as ISO-8601 UTC strings. */
export function periodBounds(period: string): { start: string; end: string } {
  const [y, m] = period.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * Whether a period is over and can therefore be billed.
 *
 * Deliberately strict: a period is closable only once its final second has
 * passed. Billing a month while payments are still settling into it produces an
 * invoice that is wrong by however much arrived afterwards, and the ministry is
 * the one who notices.
 */
export function isClosable(period: string, now: Date): boolean {
  return now.toISOString() >= periodBounds(period).end;
}

export interface PeriodSettlement {
  period: string;
  /** Gross settled contributions in the period. */
  grossCents: number;
  /** Refunds applied against contributions in the period. */
  refundedCents: number;
  /** Gross minus refunds — the figure the fee is charged on. */
  netVolumeCents: number;
  platformFeeCents: number;
  blendedRateBps: number;
  /** True when the fee is the floor rather than the percentage. */
  atMinimum: boolean;
}

/**
 * Turn a month's settled money into a bill.
 *
 * Refunds are netted before the fee is calculated, not after. Charging a
 * percentage of money that went back to a member would be indefensible, and it
 * is the kind of thing nobody notices until someone reconciles a quarter.
 *
 * A negative net — more refunded than received, which happens in a month where
 * a large prior-period payment is reversed — floors at zero rather than
 * producing a credit. Auxilium does not invoice a negative fee; the minimum
 * applies and the anomaly is visible in the stored gross and refund figures.
 */
export function settlePeriod(
  period: string,
  grossCents: number,
  refundedCents: number,
): PeriodSettlement {
  const netVolumeCents = Math.max(0, grossCents - refundedCents);
  const fee = platformFeeCents(netVolumeCents);

  return {
    period,
    grossCents,
    refundedCents,
    netVolumeCents,
    platformFeeCents: fee,
    blendedRateBps: blendedRateBps(netVolumeCents),
    atMinimum: fee === MINIMUM_MONTHLY_CENTS,
  };
}

/**
 * The identifier stamped onto an invoice so it can be explained later.
 *
 * When the rate card changes, an invoice raised under the old schedule still
 * has to be defensible. Bump this whenever PRICING_BANDS or the minimum change.
 */
export const PRICING_VERSION = 'pricing.v1';
