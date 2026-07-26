import { describe, it, expect } from 'vitest';
import {
  periodKey,
  previousPeriod,
  periodBounds,
  isClosable,
  settlePeriod,
} from './period';
import { MINIMUM_MONTHLY_CENTS } from '../pricing/tiers';

/**
 * Billing period tests.
 *
 * The failure modes here are all quiet ones: a month boundary off by an hour, a
 * refund credited to the wrong period, a period billed before its money has
 * finished arriving. None of them throw — they just produce an invoice that is
 * wrong, and the ministry is the one who finds out.
 */

const M = (dollars: number) => Math.round(dollars * 100);

describe('period keys', () => {
  it('keys a month in UTC', () => {
    expect(periodKey(new Date('2026-07-26T00:12:00Z'))).toBe('2026-07');
    expect(periodKey(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01');
  });

  it('does not drift across a local midnight', () => {
    // 23:30 UTC on the last day of the month is still that month, whatever
    // timezone the runtime thinks it is in.
    expect(periodKey(new Date('2026-07-31T23:30:00Z'))).toBe('2026-07');
    expect(periodKey(new Date('2026-08-01T00:30:00Z'))).toBe('2026-08');
  });

  it('walks backwards over a year boundary', () => {
    expect(previousPeriod('2026-01')).toBe('2025-12');
    expect(previousPeriod('2026-07')).toBe('2026-06');
  });

  it('bounds a month half-open, so no second belongs to two periods', () => {
    const july = periodBounds('2026-07');
    expect(july.start).toBe('2026-07-01T00:00:00.000Z');
    expect(july.end).toBe('2026-08-01T00:00:00.000Z');

    const august = periodBounds('2026-08');
    expect(august.start).toBe(july.end);
  });

  it('bounds December into the next year', () => {
    expect(periodBounds('2026-12').end).toBe('2027-01-01T00:00:00.000Z');
  });
});

describe('closing a period', () => {
  it('refuses to close a month that has not ended', () => {
    // Billing mid-month invoices before the rest of the month's money lands.
    expect(isClosable('2026-07', new Date('2026-07-31T23:59:59Z'))).toBe(false);
  });

  it('closes once the month is genuinely over', () => {
    expect(isClosable('2026-07', new Date('2026-08-01T00:00:00Z'))).toBe(true);
    expect(isClosable('2026-07', new Date('2026-08-01T06:00:00Z'))).toBe(true);
  });

  it('still closes a period that was missed months ago', () => {
    expect(isClosable('2026-02', new Date('2026-07-26T00:00:00Z'))).toBe(true);
  });
});

describe('settlement', () => {
  it('charges on volume net of refunds, not gross', () => {
    // $1.25M gross with $250k refunded is a $1M month. Charging the gross
    // would bill a percentage of money that went back to a member.
    const s = settlePeriod('2026-07', M(1_250_000), M(250_000));
    expect(s.netVolumeCents).toBe(M(1_000_000));
    expect(s.platformFeeCents).toBe(M(15_000)); // 1.50% of $1M
  });

  it('falls to the minimum for a month with almost nothing in it', () => {
    const s = settlePeriod('2026-07', M(200), 0);
    expect(s.platformFeeCents).toBe(MINIMUM_MONTHLY_CENTS);
    expect(s.atMinimum).toBe(true);
  });

  it('floors a net-negative month at zero rather than crediting', () => {
    // More refunded than received happens when a large prior-period payment is
    // reversed. It must not produce a negative invoice.
    const s = settlePeriod('2026-07', M(1_000), M(5_000));
    expect(s.netVolumeCents).toBe(0);
    expect(s.platformFeeCents).toBe(MINIMUM_MONTHLY_CENTS);
    // The anomaly stays visible in the stored figures rather than being erased.
    expect(s.grossCents).toBe(M(1_000));
    expect(s.refundedCents).toBe(M(5_000));
  });

  it('reports the blended rate on the net figure', () => {
    const s = settlePeriod('2026-07', M(2_500_000), 0);
    expect(s.platformFeeCents).toBe(M(28_125));
    expect(s.blendedRateBps).toBeCloseTo(112.5, 1);
    expect(s.atMinimum).toBe(false);
  });

  it('never charges more on a smaller net month', () => {
    let previous = Infinity;
    for (const refund of [0, 100_000, 500_000, 1_000_000]) {
      const s = settlePeriod('2026-07', M(2_000_000), M(refund));
      expect(s.platformFeeCents).toBeLessThanOrEqual(previous);
      previous = s.platformFeeCents;
    }
  });
});
