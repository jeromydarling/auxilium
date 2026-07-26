/**
 * Platform pricing.
 *
 * Auxilium charges the greater of a small monthly minimum or a **graduated**
 * percentage of settled member contribution volume. Graduated means marginal,
 * like tax brackets: crossing a threshold lowers the rate on the *additional*
 * volume only. It never reprices a ministry's whole book, so growing across a
 * boundary can never increase the bill.
 *
 * Two deliberate choices worth keeping:
 *
 *   • **Tiers are volume, not headcount.** Billing on members invites a
 *     dispute about whether spouses, dependents, inactive members, and
 *     partial-month joiners count. Settled dollars are unambiguous and both
 *     sides can reconcile them against the same ledger.
 *
 *   • **No per-claim fee, ever.** A fee that scales with claims processed
 *     creates a quiet incentive to process fewer of them. For software whose
 *     entire argument is that stalled claims strand families, that would be
 *     self-defeating.
 *
 * This module is pure, like everything else in src/lib. Money is integer cents
 * and rates are basis points, matching the rest of the codebase — a platform
 * fee that drifts by a cent is an invoice a ministry has to query.
 */

/** One marginal band. `upToCents` is the cumulative ceiling; null means open-ended. */
export interface PricingBand {
  /** Cumulative monthly volume this band extends to, or null for the top band. */
  upToCents: number | null;
  rateBps: number;
  label: string;
}

/** $1.25M/month. Roughly the first 5,000 members at typical contribution levels. */
const BAND_1_CEILING_CENTS = 125_000_000;
/** $12.5M/month. Roughly 50,000 members. */
const BAND_2_CEILING_CENTS = 1_250_000_000;

export const PRICING_BANDS: PricingBand[] = [
  { upToCents: BAND_1_CEILING_CENTS, rateBps: 150, label: 'First $1.25M a month' },
  { upToCents: BAND_2_CEILING_CENTS, rateBps: 75, label: 'Next $11.25M a month' },
  { upToCents: null, rateBps: 50, label: 'Above $12.5M a month' },
];

/** The floor. A ministry too small to reach it still gets the whole product. */
export const MINIMUM_MONTHLY_CENTS = 900;

/**
 * The reference figure used to translate volume into an approximate member
 * count on the pricing page.
 *
 * It is an illustration, not a promise, and the page says so — actual
 * contributions vary by household size, plan, and how a ministry structures its
 * share amounts. Billing never uses this number; billing uses settled volume.
 */
export const ILLUSTRATIVE_MONTHLY_CONTRIBUTION_CENTS = 25_000;

/**
 * The platform fee for one month of settled contribution volume.
 *
 * Bands are summed in basis-point space and divided once at the end, so no
 * per-band rounding error accumulates into the invoice.
 */
export function platformFeeCents(volumeCents: number): number {
  if (!Number.isFinite(volumeCents) || volumeCents <= 0) return MINIMUM_MONTHLY_CENTS;

  let remaining = volumeCents;
  let floor = 0;
  let bpsAccumulator = 0;

  for (const band of PRICING_BANDS) {
    if (remaining <= 0) break;
    const ceiling = band.upToCents ?? Infinity;
    const width = Math.min(remaining, ceiling - floor);
    bpsAccumulator += width * band.rateBps;
    remaining -= width;
    floor = ceiling;
  }

  const fee = Math.round(bpsAccumulator / 10_000);
  return Math.max(fee, MINIMUM_MONTHLY_CENTS);
}

/** Twelve times the monthly fee. Stated separately so nobody re-derives it. */
export function annualFeeCents(volumeCents: number): number {
  return platformFeeCents(volumeCents) * 12;
}

/**
 * The blended rate actually paid, in basis points.
 *
 * This is the number a ministry should care about, and the one the pricing page
 * leads with: not the headline band, but what fraction of contributions the
 * platform actually consumed.
 */
export function blendedRateBps(volumeCents: number): number {
  if (volumeCents <= 0) return 0;
  return Math.round((platformFeeCents(volumeCents) / volumeCents) * 10_000 * 100) / 100;
}

/** Approximate monthly volume for a member count, at the illustrative rate. */
export function volumeForMembers(members: number): number {
  return members * ILLUSTRATIVE_MONTHLY_CONTRIBUTION_CENTS;
}

/**
 * How much of the ministry's medical-loss headroom the platform fee consumes.
 *
 * The share ratio measures what fraction of contributions reached medical
 * costs. A platform fee is, unavoidably, part of the fraction that did not — so
 * it is stated in exactly those terms rather than hidden. Against an 80% floor
 * a ministry has roughly 2,000 basis points of room; this reports what share of
 * that room Auxilium takes.
 *
 * Publishing this is the only position consistent with the product's own
 * argument. Software that asks a ministry to measure where every dollar went
 * does not get to be vague about its own.
 */
export function headroomShareBps(volumeCents: number, floorBps: number): number {
  const headroom = 10_000 - floorBps;
  if (headroom <= 0) return 0;
  return Math.round((blendedRateBps(volumeCents) / headroom) * 10_000) / 100;
}

/** "$18,750" — whole dollars, which is how invoices of this size are discussed. */
export function formatDollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}

/**
 * "1.50%" from basis points.
 *
 * The basis points are rounded to a whole number first, because two decimal
 * places of a percentage *is* one basis point — and `toFixed` alone gets the
 * exact halves wrong. A blended 82.5bps is 0.825%, which `(82.5/100).toFixed(2)`
 * renders as "0.82" because 0.825 has no exact binary representation and lands
 * just below the midpoint. Rounding in basis-point space first gives "0.83",
 * which is what the agreed rate card says.
 */
export function formatRate(bps: number): string {
  return `${(Math.round(bps) / 100).toFixed(2)}%`;
}
