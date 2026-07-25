import { BPS } from '../integrity/types';

/**
 * Reference-based pricing.
 *
 * Facility chargemaster prices bear little relationship to cost, and
 * self-funded plans routinely reprice against the Medicare allowable instead —
 * commonly 120–200% of Medicare — achieving 20–50% savings on facility claims
 * while keeping the negotiation data-driven and defensible. Health sharing
 * ministries largely lack the infrastructure to do this at all, which means
 * they share inflated numbers and members carry inflated balances.
 *
 * This is the rare feature that is simultaneously a cost lever for the
 * ministry and a direct reduction in what the member owes. It is also the one
 * place in Auxilium where the software proposes a number a provider will
 * argue with, so every proposal records its basis.
 *
 * All arithmetic stays in integer cents and basis points.
 */

export type RepricingMethod = 'medicare_reference' | 'negotiated' | 'cash_price' | 'manual';

export interface RepricingInput {
  billed_cents: number;
  /** The Medicare allowable for this code and locality. */
  medicare_cents: number;
  /** Basis points of Medicare. 15000 = 150%. */
  multiplier_bps: number;
  method?: RepricingMethod;
}

export interface RepricingResult {
  billed_cents: number;
  medicare_cents: number;
  multiplier_bps: number;
  repriced_cents: number;
  savings_cents: number;
  savings_bps: number;
  method: RepricingMethod;
  /** Billed as a multiple of Medicare — the number that makes the case. */
  billed_multiple_bps: number;
  /** Whether repricing is worth pursuing at all. */
  worthwhile: boolean;
  explanation: string;
}

/** Typical RBP band. Below 100% of Medicare is not a serious offer. */
export const MIN_MULTIPLIER_BPS = 10_000;  // 100%
export const MAX_MULTIPLIER_BPS = 30_000;  // 300%
export const DEFAULT_MULTIPLIER_BPS = 15_000; // 150%

/** Not worth the friction below this. Repricing costs staff time and goodwill. */
const MIN_SAVINGS_CENTS = 25_000; // $250

export function reprice(input: RepricingInput): RepricingResult {
  const method = input.method ?? 'medicare_reference';
  const multiplier = clampMultiplier(input.multiplier_bps);

  // No reference rate means no reprice. Without this guard the arithmetic
  // prices the claim to zero and reports the entire billed amount as a saving
  // — which would have Auxilium proposing $0 to a provider for every claim
  // whose code is missing from the fee schedule.
  if (input.medicare_cents <= 0) {
    return {
      billed_cents: input.billed_cents,
      medicare_cents: 0,
      multiplier_bps: multiplier,
      repriced_cents: input.billed_cents,
      savings_cents: 0,
      savings_bps: 0,
      method,
      billed_multiple_bps: 0,
      worthwhile: false,
      explanation: explain(input.billed_cents, 0, multiplier, input.billed_cents, 0, 0),
    };
  }

  const target = Math.round((input.medicare_cents * multiplier) / BPS);

  // Never propose more than was billed. A "reprice" that raises the bill would
  // be indefensible, and with an unusually low charge or a high multiplier the
  // arithmetic gets there on its own.
  const repriced = Math.min(target, input.billed_cents);
  const savings = Math.max(0, input.billed_cents - repriced);

  const savingsBps = input.billed_cents > 0
    ? Math.round((savings * BPS) / input.billed_cents)
    : 0;

  const billedMultiple = input.medicare_cents > 0
    ? Math.round((input.billed_cents * BPS) / input.medicare_cents)
    : 0;

  return {
    billed_cents: input.billed_cents,
    medicare_cents: input.medicare_cents,
    multiplier_bps: multiplier,
    repriced_cents: repriced,
    savings_cents: savings,
    savings_bps: savingsBps,
    method,
    billed_multiple_bps: billedMultiple,
    worthwhile: savings >= MIN_SAVINGS_CENTS,
    explanation: explain(input.billed_cents, input.medicare_cents, multiplier, repriced, savings, billedMultiple),
  };
}

function clampMultiplier(bps: number): number {
  if (!Number.isFinite(bps)) return DEFAULT_MULTIPLIER_BPS;
  return Math.max(MIN_MULTIPLIER_BPS, Math.min(MAX_MULTIPLIER_BPS, Math.round(bps)));
}

/**
 * The sentence that goes to the provider. It states the basis rather than
 * asserting a number, because that is what makes it a negotiation rather than
 * a refusal to pay.
 */
function explain(
  billed: number,
  medicare: number,
  multiplierBps: number,
  repriced: number,
  savings: number,
  billedMultipleBps: number,
): string {
  const dollars = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  if (medicare <= 0) {
    return 'No Medicare reference rate is on file for this code, so this claim cannot be repriced automatically.';
  }
  if (savings === 0) {
    return `Billed ${dollars(billed)}, at or below ${(multiplierBps / 100).toFixed(0)}% of the Medicare rate. Nothing to reprice.`;
  }

  return (
    `Billed ${dollars(billed)}, which is ${(billedMultipleBps / 100).toFixed(0)}% of the Medicare ` +
    `allowable of ${dollars(medicare)}. At ${(multiplierBps / 100).toFixed(0)}% of Medicare the ` +
    `claim reprices to ${dollars(repriced)}, a reduction of ${dollars(savings)}.`
  );
}

/** Portfolio view: what repricing is actually saving across many claims. */
export interface RepricingSummary {
  claims: number;
  billed_cents: number;
  repriced_cents: number;
  savings_cents: number;
  savings_bps: number;
  /** Claims where the saving cleared the threshold worth pursuing. */
  worthwhile_claims: number;
}

export function summarizeRepricing(results: RepricingResult[]): RepricingSummary {
  const billed = results.reduce((sum, r) => sum + r.billed_cents, 0);
  const repriced = results.reduce((sum, r) => sum + r.repriced_cents, 0);
  const savings = results.reduce((sum, r) => sum + r.savings_cents, 0);

  return {
    claims: results.length,
    billed_cents: billed,
    repriced_cents: repriced,
    savings_cents: savings,
    savings_bps: billed > 0 ? Math.round((savings * BPS) / billed) : 0,
    worthwhile_claims: results.filter((r) => r.worthwhile).length,
  };
}
