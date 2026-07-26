import { describe, it, expect } from 'vitest';
import {
  platformFeeCents,
  annualFeeCents,
  blendedRateBps,
  volumeForMembers,
  headroomShareBps,
  formatDollars,
  formatRate,
  PRICING_BANDS,
  MINIMUM_MONTHLY_CENTS,
} from './tiers';
import { ACA_MLR_INDIVIDUAL_BPS } from '../integrity/types';

/**
 * Pricing tests.
 *
 * These pin the agreed commercial model to the arithmetic. A pricing bug is not
 * a rendering bug — it is an invoice a ministry disputes, or revenue quietly
 * left on the table — so every figure from the agreed schedule is asserted
 * rather than trusted.
 */

const M = (dollars: number) => Math.round(dollars * 100);

describe('the graduated schedule', () => {
  it('charges the minimum when there is no volume at all', () => {
    expect(platformFeeCents(0)).toBe(MINIMUM_MONTHLY_CENTS);
    expect(platformFeeCents(-1)).toBe(MINIMUM_MONTHLY_CENTS);
  });

  it('charges the minimum for a ministry too small to reach it', () => {
    // $9 is reached at $600/month of volume at 1.50%. Below that, the floor.
    expect(platformFeeCents(M(100))).toBe(MINIMUM_MONTHLY_CENTS);
    expect(platformFeeCents(M(500))).toBe(MINIMUM_MONTHLY_CENTS);
  });

  it('crosses from the minimum to the percentage at $600 a month', () => {
    expect(platformFeeCents(M(600))).toBe(MINIMUM_MONTHLY_CENTS);
    expect(platformFeeCents(M(700))).toBe(M(10.5));
  });

  it('bills the first band at 1.50%', () => {
    expect(platformFeeCents(M(1_250_000))).toBe(M(18_750));
  });

  it('bills the second band at 0.75% on the marginal dollars only', () => {
    // $2.5M: $1.25M at 1.50% + $1.25M at 0.75%.
    expect(platformFeeCents(M(2_500_000))).toBe(M(28_125));
  });

  it('bills the third band at 0.50% on the marginal dollars only', () => {
    // $25M: 18,750 + 84,375 + 62,500.
    expect(platformFeeCents(M(25_000_000))).toBe(M(165_625));
  });

  it('never increases the bill for growing across a threshold', () => {
    // The defining property of a marginal schedule. Worth asserting directly:
    // a flat-rate mistake here would penalise a ministry for growing.
    let previous = 0;
    for (let dollars = 0; dollars <= 20_000_000; dollars += 250_000) {
      const fee = platformFeeCents(M(dollars));
      expect(fee).toBeGreaterThanOrEqual(previous);
      previous = fee;
    }
  });

  it('matches every figure in the agreed schedule', () => {
    const expected: [members: number, monthly: number, annual: number][] = [
      [100, 375, 4_500],
      [500, 1_875, 22_500],
      [1_000, 3_750, 45_000],
      [2_500, 9_375, 112_500],
      [5_000, 18_750, 225_000],
      [10_000, 28_125, 337_500],
      [25_000, 56_250, 675_000],
      [50_000, 103_125, 1_237_500],
      [100_000, 165_625, 1_987_500],
      [200_000, 290_625, 3_487_500],
      [300_000, 415_625, 4_987_500],
    ];

    for (const [members, monthly, annual] of expected) {
      const volume = volumeForMembers(members);
      expect(platformFeeCents(volume), `${members} members, monthly`).toBe(M(monthly));
      expect(annualFeeCents(volume), `${members} members, annual`).toBe(M(annual));
    }
  });

  it('reports the blended rate falling as a ministry grows', () => {
    expect(blendedRateBps(volumeForMembers(1_000))).toBeCloseTo(150, 1);
    expect(blendedRateBps(volumeForMembers(10_000))).toBeCloseTo(112.5, 1);
    expect(blendedRateBps(volumeForMembers(50_000))).toBeCloseTo(82.5, 1);
    expect(blendedRateBps(volumeForMembers(300_000))).toBeCloseTo(55.42, 1);
  });

  it('never blends above the headline rate once the percentage governs', () => {
    // Above the $600/month crossover the schedule is what is charged, and the
    // blended rate can only fall from there.
    for (const members of [50, 5_000, 50_000, 500_000]) {
      expect(blendedRateBps(volumeForMembers(members))).toBeLessThanOrEqual(150.01);
    }
  });

  it('is honest that the minimum can exceed the headline rate at tiny volume', () => {
    // A floor is a floor: below the crossover, $9 is worth more than 1.50% of
    // volume, so the effective rate is higher. At one member that is 3.60%.
    // This is asserted rather than glossed over, because the pricing page says
    // it out loud and the two must not drift apart.
    expect(blendedRateBps(volumeForMembers(1))).toBeCloseTo(360, 0);
    expect(platformFeeCents(volumeForMembers(1))).toBe(MINIMUM_MONTHLY_CENTS);
  });
});

describe('bands', () => {
  it('ascends and ends open', () => {
    expect(PRICING_BANDS[PRICING_BANDS.length - 1].upToCents).toBeNull();
    const ceilings = PRICING_BANDS.slice(0, -1).map((b) => b.upToCents as number);
    expect([...ceilings].sort((a, b) => a - b)).toEqual(ceilings);
  });

  it('gets cheaper at every step, never more expensive', () => {
    const rates = PRICING_BANDS.map((b) => b.rateBps);
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i]).toBeLessThan(rates[i - 1]);
    }
  });
});

describe('honesty about our own cost', () => {
  it('states the platform fee as a share of medical-loss headroom', () => {
    // Against the 80% floor a ministry has ~2,000bps of room. At 1.50% the
    // platform takes 7.5% of it. If this is ever silently wrong, the pricing
    // page is misrepresenting the product's own effect on the share ratio.
    const small = headroomShareBps(volumeForMembers(1_000), ACA_MLR_INDIVIDUAL_BPS);
    expect(small).toBeCloseTo(7.5, 1);

    const large = headroomShareBps(volumeForMembers(300_000), ACA_MLR_INDIVIDUAL_BPS);
    expect(large).toBeLessThan(small);
  });
});

describe('formatting', () => {
  it('renders whole dollars with separators', () => {
    expect(formatDollars(M(415_625))).toBe('$415,625');
    expect(formatDollars(MINIMUM_MONTHLY_CENTS)).toBe('$9');
  });

  it('renders rates to two decimals', () => {
    expect(formatRate(150)).toBe('1.50%');
    expect(formatRate(50)).toBe('0.50%');
  });

  it('renders every blended rate exactly as the agreed rate card states it', () => {
    // 82.5bps is the one that matters: naive toFixed renders it "0.82" because
    // 0.825 sits just below the midpoint in binary, while the rate card says
    // 0.83. Each of these is a figure a ministry could hold us to.
    const expected: [members: number, rate: string][] = [
      [1_000, '1.50%'],
      [5_000, '1.50%'],
      [10_000, '1.13%'],
      [25_000, '0.90%'],
      [50_000, '0.83%'],
      [100_000, '0.66%'],
      [200_000, '0.58%'],
      [300_000, '0.55%'],
    ];
    for (const [members, rate] of expected) {
      expect(formatRate(blendedRateBps(volumeForMembers(members))), `${members} members`).toBe(rate);
    }
  });
});
