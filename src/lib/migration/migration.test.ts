import { describe, it, expect } from 'vitest';
import {
  containsCardData,
  validateManifest,
  reconcile,
  nextBillingDate,
  type ManifestRow,
} from './manifest';
import { PROCESSORS, processorByKey, requestTemplate, expectations } from './processors';

/**
 * Processor migration tests.
 *
 * Two groups carry nearly all the risk. The card-data guard is the only thing
 * standing between a well-meaning "export everything" and primary account
 * numbers in this database. And reconciliation decides which family's bank
 * account gets debited — a wrong match there is not a duplicate somebody
 * notices later, it is a stranger's money.
 */

describe('the card-data guard', () => {
  it('catches a real card number', () => {
    // Standard test numbers. Each is Luhn-valid, which is the point.
    expect(containsCardData('4242424242424242')).toBe(true);
    expect(containsCardData('5555555555554444')).toBe(true);
    expect(containsCardData('378282246310005')).toBe(true);
  });

  it('catches one buried in a CSV row', () => {
    const row = 'cus_881,jane@example.org,4242 4242 4242 4242,12,2029,card';
    expect(containsCardData(row)).toBe(true);
  });

  it('catches one written with dashes', () => {
    expect(containsCardData('card on file: 4242-4242-4242-4242 exp 12/29')).toBe(true);
  });

  it('does not fire on a manifest that only has last four', () => {
    const manifest =
      'legacy_customer_id,email,last4,exp_month,exp_year,method\n' +
      'cus_881,jane@example.org,4242,12,2029,card\n' +
      'cus_882,sam@example.org,4444,03,2028,card';
    expect(containsCardData(manifest)).toBe(false);
  });

  it('does not fire on long member numbers or phone numbers', () => {
    // Without the Luhn check every one of these would trip the alarm, the alarm
    // would be ignored, and it would stop protecting anything.
    expect(containsCardData('member 100000000000001')).toBe(false);
    expect(containsCardData('+1 555 010 9999, ext 12345678')).toBe(false);
    expect(containsCardData('2026-07-26T01:00:00.000Z')).toBe(false);
  });

  it('refuses the whole file rather than importing part of it', () => {
    const rows: ManifestRow[] = [{ legacy_customer_id: 'cus_1', email: 'a@example.org' }];
    const report = validateManifest(rows, 'cus_1,a@example.org,4242424242424242');

    expect(report.issues[0].code).toBe('card_data_present');
    expect(report.issues[0].level).toBe('blocking');
    // Nothing is counted as ready — the file is not partially usable.
    expect(report.total).toBe(0);
    expect(report.ready).toBe(0);
  });
});

describe('manifest validation', () => {
  const good: ManifestRow[] = [
    { legacy_customer_id: 'cus_1', email: 'a@example.org', member_number: 'M-1', method: 'card', last4: '4242', exp_month: 12, exp_year: 2029, amount_cents: 25_000, billing_day: 5 },
    { legacy_customer_id: 'cus_2', email: 'b@example.org', member_number: 'M-2', method: 'bank', amount_cents: 30_000, billing_day: 15 },
  ];

  it('passes a clean manifest', () => {
    const report = validateManifest(good);
    expect(report.total).toBe(2);
    expect(report.ready).toBe(2);
    expect(report.manual).toBe(0);
    expect(report.issues.filter((i) => i.level === 'blocking')).toHaveLength(0);
  });

  it('blocks a row with no identifier from the old processor', () => {
    const report = validateManifest([{ legacy_customer_id: '  ', email: 'a@example.org' }]);
    expect(report.issues.some((i) => i.code === 'missing_legacy_id')).toBe(true);
    expect(report.manual).toBe(1);
  });

  it('flags a row with nothing to match a member on', () => {
    const report = validateManifest([{ legacy_customer_id: 'cus_9' }]);
    expect(report.issues.some((i) => i.code === 'unmatchable')).toBe(true);
    expect(report.flagged).toBe(1);
  });

  it('treats Google Pay as unmigratable rather than merely awkward', () => {
    // Stripe cannot move these at all, whatever the processor does.
    const report = validateManifest([
      { legacy_customer_id: 'cus_3', email: 'g@example.org', wallet: 'google_pay' },
    ]);
    expect(report.issues.some((i) => i.code === 'google_pay_unmigratable')).toBe(true);
    expect(report.manual).toBe(1);
    expect(report.wallets.google_pay).toBe(1);
  });

  it('flags Apple Pay as needing a separate request, not as hopeless', () => {
    const report = validateManifest([
      { legacy_customer_id: 'cus_4', email: 'a@example.org', wallet: 'apple_pay' },
    ]);
    expect(report.issues.some((i) => i.code === 'apple_pay_separate_request')).toBe(true);
    expect(report.flagged).toBe(1);
    expect(report.manual).toBe(0);
  });

  it('notices a duplicate legacy identifier', () => {
    const report = validateManifest([
      { legacy_customer_id: 'cus_1', email: 'a@example.org' },
      { legacy_customer_id: 'cus_1', email: 'b@example.org' },
    ]);
    expect(report.issues.some((i) => i.code === 'duplicate_legacy_id')).toBe(true);
  });

  it('counts bank mandates and says they are the easy ones', () => {
    const report = validateManifest(good);
    expect(report.byMethod.bank).toBe(1);
    expect(report.issues.some((i) => i.code === 'bank_mandates')).toBe(true);
  });

  it('does not reject a mostly-clean manifest over a few bad rows', () => {
    // The 2% is the list staff need to work through, not a reason to throw out
    // the 98%.
    const report = validateManifest([...good, { legacy_customer_id: 'cus_x' }]);
    expect(report.ready).toBe(2);
    expect(report.flagged).toBe(1);
    expect(report.issues.filter((i) => i.level === 'blocking')).toHaveLength(0);
  });
});

describe('reconciliation', () => {
  const members = [
    { id: 'mem_1', email: 'jane@example.org', member_number: 'M-1' },
    { id: 'mem_2', email: 'sam@example.org', member_number: 'M-2' },
  ];

  it('matches on the ministry member number first', () => {
    const result = reconcile(
      [{ legacy_customer_id: 'cus_1', member_number: 'M-1', email: 'someone-else@example.org' }],
      [{ legacy_customer_id: 'cus_1', stripe_customer_id: 'cus_stripe_1', stripe_payment_method_id: 'pm_1' }],
      members,
    );
    expect(result.rows[0].member_id).toBe('mem_1');
    expect(result.rows[0].match_method).toBe('member_number');
  });

  it('falls back to email', () => {
    const result = reconcile(
      [{ legacy_customer_id: 'cus_2', email: 'SAM@Example.ORG' }],
      [{ legacy_customer_id: 'cus_2', stripe_customer_id: 'cus_stripe_2' }],
      members,
    );
    expect(result.rows[0].member_id).toBe('mem_2');
    expect(result.rows[0].match_method).toBe('email');
  });

  it('leaves a row unmatched rather than guessing', () => {
    // The whole discipline of this module. An unmatched row is a short list for
    // a human; a wrongly matched row debits a stranger.
    const result = reconcile(
      [{ legacy_customer_id: 'cus_9', email: 'nobody@example.org' }],
      [{ legacy_customer_id: 'cus_9', stripe_customer_id: 'cus_stripe_9' }],
      members,
    );
    expect(result.rows[0].member_id).toBeNull();
    expect(result.rows[0].match_method).toBe('unmatched');
    expect(result.unmatched).toBe(1);
  });

  it('refuses to match an ambiguous member number', () => {
    // Two members sharing a number is a data problem. Picking one at random
    // resolves it silently and wrongly.
    const ambiguous = [
      { id: 'mem_a', email: 'a@example.org', member_number: 'DUP' },
      { id: 'mem_b', email: 'b@example.org', member_number: 'DUP' },
    ];
    const result = reconcile(
      [{ legacy_customer_id: 'cus_d', member_number: 'DUP' }],
      [{ legacy_customer_id: 'cus_d', stripe_customer_id: 'cus_stripe_d' }],
      ambiguous,
    );
    expect(result.rows[0].member_id).toBeNull();
  });

  it('does not match a mapping row with no manifest entry behind it', () => {
    const result = reconcile([], [{ legacy_customer_id: 'cus_ghost', stripe_customer_id: 'cus_x' }], members);
    expect(result.rows[0].member_id).toBeNull();
    expect(result.matched).toBe(0);
  });
});

describe('billing anchors', () => {
  it('keeps the member on their existing day', () => {
    const next = nextBillingDate(15, new Date('2026-07-01T00:00:00Z'));
    expect(next.toISOString().slice(0, 10)).toBe('2026-07-15');
  });

  it('rolls to next month when the day has already passed', () => {
    const next = nextBillingDate(5, new Date('2026-07-20T00:00:00Z'));
    expect(next.toISOString().slice(0, 10)).toBe('2026-08-05');
  });

  it('clamps the 31st into February rather than skipping the month', () => {
    // Rolling forward instead of clamping would miss a member's February
    // contribution entirely.
    const next = nextBillingDate(31, new Date('2026-02-01T00:00:00Z'));
    expect(next.toISOString().slice(0, 10)).toBe('2026-02-28');
  });

  it('crosses a year boundary', () => {
    const next = nextBillingDate(3, new Date('2026-12-20T00:00:00Z'));
    expect(next.toISOString().slice(0, 10)).toBe('2027-01-03');
  });
});

describe('processor guidance', () => {
  it('covers every processor with a usable profile', () => {
    for (const p of PROCESSORS) {
      expect(p.label.length).toBeGreaterThan(2);
      expect(p.requestNotes.length).toBeGreaterThan(0);
    }
  });

  it('generates a request that never asks for data to be sent to us', () => {
    const template = requestTemplate({
      processor: processorByKey('braintree')!,
      ministryName: 'Example Ministry',
    });
    expect(template).toContain('directly to Stripe');
    expect(template).toContain('not asking for this data to be sent to us');
    expect(template.toLowerCase()).toContain('network transaction id');
  });

  it('warns when a processor will not release network transaction IDs', () => {
    const { warnings } = expectations(processorByKey('authorize_net')!);
    expect(warnings.some((w) => w.includes('re-authentication') || w.includes('confirm the first charge'))).toBe(true);
  });

  it('is honest that an in-house setup has nothing to migrate', () => {
    const { warnings } = expectations(processorByKey('in_house')!);
    expect(warnings.some((w) => w.includes('no vault'))).toBe(true);
  });

  it('quotes a range rather than a confident date', () => {
    const { estimatedDays } = expectations(processorByKey('recurly')!);
    expect(estimatedDays.high).toBeGreaterThan(estimatedDays.low);
  });
});
