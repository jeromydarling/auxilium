import { describe, it, expect } from 'vitest';
import { computeIntegrity, auditDenials, bandForIntegrityScore, guidelineInForce } from './engine';
import { INTEGRITY_RULES } from './rules';
import {
  shareRatioBps, formatBps, ratioBand, ratioDriftBps, consecutiveZeroShareperiods,
  combineLedgers, unallocatedCents, overheadRatioBps,
} from './mlr';
import type { IntegrityFacts, PeriodLedger, GuidelineVersion, DenialFacts } from './types';

/**
 * These tests are pinned to the actual numbers from the public record. If a
 * future change to the weights stops flagging Aliera at 16% or Medical Cost
 * Sharing at 3.5%, the rule set has stopped doing the one job it exists for,
 * and these tests should fail loudly.
 */
const NOW = '2026-07-25T12:00:00.000Z';

function ledger(over: Partial<PeriodLedger> = {}): PeriodLedger {
  return {
    period: '2026-07',
    contributions_cents: 10_000_000,   // $100k in
    fees_cents: 0,
    shared_cents: 8_500_000,           // $85k shared — a healthy 85%
    administrative_cents: 1_000_000,
    marketing_cents: 300_000,
    related_party_cents: 0,
    members_shared_with: 40,
    top_payee_name: 'Regional Medical Center',
    top_payee_cents: 400_000,
    ...over,
  };
}

/** Three identical months, newest first. */
function months(over: Partial<PeriodLedger> = {}): PeriodLedger[] {
  return ['2026-07', '2026-06', '2026-05'].map((period) => ledger({ ...over, period }));
}

const GUIDELINE: GuidelineVersion = {
  version: 'v2.0',
  effective_from: '2024-01-01',
  effective_to: null,
  provisions: [
    {
      code: 'preexisting.phase_in',
      statement: 'Pre-existing conditions phase in over 36 months.',
      supports_denial_codes: ['preexisting_within_waiting_period'],
      waiting_period_days: 1095,
    },
    {
      code: 'maternity.day_one',
      statement: 'Maternity is shared from day one of membership.',
      supports_denial_codes: [],
    },
    {
      code: 'elective.excluded',
      statement: 'Elective and cosmetic procedures are not shared.',
      supports_denial_codes: ['elective', 'cosmetic'],
    },
  ],
};

function facts(over: Partial<IntegrityFacts> = {}): IntegrityFacts {
  return {
    org_id: 'org_test',
    ledger: months(),
    target_share_ratio_bps: 8_000,
    denials: [],
    guidelines: [GUIDELINE],
    sla_breaches: [],
    overdue_appeals: 0,
    open_claim_count: 20,
    ...over,
  };
}

function denial(over: Partial<DenialFacts> = {}): DenialFacts {
  return {
    need_id: 'need_1',
    member_id: 'mem_1',
    member_joined_at: '2025-03-01T00:00:00.000Z',
    denied_at: '2026-07-01T00:00:00.000Z',
    denial_reason_code: 'elective',
    denial_guideline_ref: 'elective.excluded',
    amount_requested_cents: 500_000,
    category: 'medical',
    ...over,
  };
}

describe('ratio arithmetic', () => {
  it('computes a share ratio in basis points', () => {
    expect(shareRatioBps(8_500_000, 10_000_000)).toBe(8_500);
    expect(shareRatioBps(0, 10_000_000)).toBe(0);
  });

  it('treats no contributions as zero rather than dividing by zero', () => {
    expect(shareRatioBps(500, 0)).toBe(0);
  });

  it('formats basis points for humans', () => {
    expect(formatBps(8_500)).toBe('85.0%');
    expect(formatBps(1_600)).toBe('16.0%');
  });

  it('bands against the ACA floor', () => {
    expect(ratioBand(8_500)).toBe('healthy');
    expect(ratioBand(8_000)).toBe('healthy');
    expect(ratioBand(7_000)).toBe('watch');
    expect(ratioBand(5_500)).toBe('concern');
    expect(ratioBand(1_600)).toBe('critical');  // Aliera
    expect(ratioBand(350)).toBe('critical');    // Medical Cost Sharing
  });

  it('sums periods into one ledger', () => {
    const combined = combineLedgers(months());
    expect(combined.contributions_cents).toBe(30_000_000);
    expect(combined.shared_cents).toBe(25_500_000);
  });

  it('reports money taken in but not yet allocated anywhere', () => {
    expect(unallocatedCents(ledger())).toBe(200_000);
  });

  it('computes overhead as a share of contributions', () => {
    expect(overheadRatioBps(ledger())).toBe(1_300); // 13%
  });

  it('detects a falling ratio across windows', () => {
    const recent = ['2026-07', '2026-06', '2026-05'].map((period) =>
      ledger({ period, shared_cents: 5_000_000 }),
    );
    const prior = ['2026-04', '2026-03', '2026-02'].map((period) =>
      ledger({ period, shared_cents: 8_500_000 }),
    );
    expect(ratioDriftBps([...recent, ...prior])).toBe(-3_500);
  });

  it('reports no drift without enough history to judge', () => {
    expect(ratioDriftBps(months())).toBe(0);
  });

  it('counts consecutive months that took money and shared nothing', () => {
    const zeroed = ['2026-07', '2026-06'].map((period) => ledger({ period, shared_cents: 0 }));
    expect(consecutiveZeroShareperiods([...zeroed, ledger({ period: '2026-05' })])).toBe(2);
  });
});

describe('rule set integrity', () => {
  it('has unique codes', () => {
    const codes = INTEGRITY_RULES.map((r) => r.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('records the real-world failure behind every rule', () => {
    for (const rule of INTEGRITY_RULES) {
      expect(rule.provenance.length).toBeGreaterThan(60);
    }
  });
});

describe('a healthy ministry', () => {
  const report = computeIntegrity(facts(), NOW);

  it('scores healthy with no findings', () => {
    expect(report.band).toBe('healthy');
    expect(report.score).toBe(100);
    expect(report.reason_codes).toEqual([]);
  });

  it('clears both its own commitment and the ACA floor', () => {
    expect(report.benchmark.meets_ministry_target).toBe(true);
    expect(report.benchmark.meets_aca_individual).toBe(true);
  });

  it('says so plainly', () => {
    expect(report.summary).toMatch(/85\.0%/);
    expect(report.summary).toMatch(/nothing in the ledger/i);
  });

  it('recommends nothing when there is nothing to do', () => {
    expect(report.recommended_actions).toEqual([]);
  });
});

describe('the Aliera pattern: 16 cents of every dollar reaching care', () => {
  // California alleged Aliera retained ~84% of contributions.
  const report = computeIntegrity(
    facts({
      ledger: months({ shared_cents: 1_600_000, administrative_cents: 3_000_000, marketing_cents: 2_000_000, related_party_cents: 3_400_000 }),
    }),
    NOW,
  );

  it('is critical', () => {
    expect(report.band).toBe('critical');
    expect(report.score).toBeLessThan(50);
  });

  it('reports the ratio that made it critical', () => {
    expect(report.trailing_share_ratio_bps).toBe(1_600);
    expect(report.reason_codes.map((r) => r.code)).toContain('integrity.share_ratio_critical');
  });

  it('flags that overhead exceeded sharing', () => {
    expect(report.reason_codes.map((r) => r.code)).toContain('integrity.overhead_exceeds_sharing');
  });

  it('flags the related-party payments', () => {
    expect(report.reason_codes.map((r) => r.code)).toContain('integrity.related_party_payments');
  });

  it('fails both benchmarks', () => {
    expect(report.benchmark.meets_aca_individual).toBe(false);
    expect(report.benchmark.meets_ministry_target).toBe(false);
  });

  it('tells the board what to do about it', () => {
    expect(report.recommended_actions.join(' ')).toMatch(/related-party/i);
  });
});

describe('the Medical Cost Sharing pattern: collect, share nothing', () => {
  // $7.5M collected, $245,982 shared (3.5%), and zero distributed for months.
  const report = computeIntegrity(
    facts({
      ledger: months({ shared_cents: 0, administrative_cents: 2_000_000, related_party_cents: 4_000_000 }),
    }),
    NOW,
  );

  it('is critical', () => {
    expect(report.band).toBe('critical');
  });

  it('flags the run of months with nothing shared', () => {
    const reason = report.reason_codes.find((r) => r.code === 'integrity.zero_share_periods');
    expect(reason).toBeDefined();
    expect(reason!.weight).toBe(60);
    expect(reason!.detail).toMatch(/3 consecutive months/);
  });

  it('treats a single quiet month far more gently than a run', () => {
    const oneMonth = computeIntegrity(
      facts({ ledger: [ledger({ shared_cents: 0 }), ledger({ period: '2026-06' }), ledger({ period: '2026-05' })] }),
      NOW,
    );
    const reason = oneMonth.reason_codes.find((r) => r.code === 'integrity.zero_share_periods');
    expect(reason!.weight).toBe(15);
  });

  it('leads with the diversion action', () => {
    expect(report.recommended_actions[0]).toMatch(/no funds were disbursed/i);
  });
});

describe('a ministry sliding rather than collapsing', () => {
  it('catches the drift before the level becomes critical', () => {
    const sliding = computeIntegrity(
      facts({
        ledger: [
          ...['2026-07', '2026-06', '2026-05'].map((period) => ledger({ period, shared_cents: 6_800_000 })),
          ...['2026-04', '2026-03', '2026-02'].map((period) => ledger({ period, shared_cents: 8_500_000 })),
        ],
      }),
      NOW,
    );
    const codes = sliding.reason_codes.map((r) => r.code);
    expect(codes).toContain('integrity.ratio_falling');
    expect(codes).toContain('integrity.share_ratio_below_target');
    // Still above 50%, so the critical rule must not fire.
    expect(codes).not.toContain('integrity.share_ratio_critical');
    expect(sliding.band).not.toBe('healthy');
  });

  it('ignores ordinary month-to-month noise', () => {
    const noisy = computeIntegrity(
      facts({
        ledger: [
          ...['2026-07', '2026-06', '2026-05'].map((period) => ledger({ period, shared_cents: 8_300_000 })),
          ...['2026-04', '2026-03', '2026-02'].map((period) => ledger({ period, shared_cents: 8_500_000 })),
        ],
      }),
      NOW,
    );
    expect(noisy.reason_codes.map((r) => r.code)).not.toContain('integrity.ratio_falling');
  });
});

describe('scores are the sum of their stated deductions', () => {
  it('subtracts exactly the weights it reports', () => {
    const report = computeIntegrity(
      facts({ ledger: months({ shared_cents: 1_600_000, related_party_cents: 3_400_000 }) }),
      NOW,
    );
    const deductions = report.reason_codes.reduce((sum, r) => sum + r.weight, 0);
    expect(report.score).toBe(Math.max(0, 100 - deductions));
  });

  it('never goes below zero or above one hundred', () => {
    const awful = computeIntegrity(
      facts({
        ledger: months({ shared_cents: 0, related_party_cents: 9_000_000 }),
        guidelines: [],
        denials: [denial({ denial_guideline_ref: null })],
        sla_breaches: [{ need_id: 'n1', days_over: 120 }],
        overdue_appeals: 9,
      }),
      NOW,
    );
    expect(awful.score).toBe(0);
    expect(computeIntegrity(facts(), NOW).score).toBe(100);
  });

  it('is deterministic', () => {
    const f = facts({ ledger: months({ shared_cents: 3_000_000 }) });
    expect(JSON.stringify(computeIntegrity(f, NOW))).toBe(JSON.stringify(computeIntegrity(f, NOW)));
  });

  it('bands on the published thresholds', () => {
    expect(bandForIntegrityScore(100)).toBe('healthy');
    expect(bandForIntegrityScore(85)).toBe('healthy');
    expect(bandForIntegrityScore(70)).toBe('watch');
    expect(bandForIntegrityScore(50)).toBe('concern');
    expect(bandForIntegrityScore(49)).toBe('critical');
  });
});

describe('guideline consistency — the pattern behind every case', () => {
  it('accepts a denial that cites a provision authorizing that reason', () => {
    expect(auditDenials(facts({ denials: [denial()] }))).toEqual([]);
  });

  it('flags a denial citing nothing at all', () => {
    const findings = auditDenials(facts({ denials: [denial({ denial_guideline_ref: null })] }));
    expect(findings[0].code).toBe('denial.no_guideline');
    expect(findings[0].severity).toBe('serious');
  });

  it('flags a denial citing a provision that does not exist', () => {
    const findings = auditDenials(
      facts({ denials: [denial({ denial_guideline_ref: 'invented.rule' })] }),
    );
    expect(findings[0].code).toBe('denial.unknown_guideline');
  });

  it('flags a guideline applied retroactively to a member who never agreed to it', () => {
    // The signature pattern: rules published in 2026 used against a 2025 member.
    const findings = auditDenials(
      facts({
        guidelines: [{ ...GUIDELINE, version: 'v3.0', effective_from: '2026-01-01' }],
        denials: [denial({ member_joined_at: '2025-03-01T00:00:00.000Z' })],
      }),
    );
    expect(findings[0].code).toBe('denial.retroactive');
    expect(findings[0].severity).toBe('serious');
    expect(findings[0].message).toMatch(/never agreed/);
  });

  it('does not flag a time-of-service ministry following its own published rule', () => {
    // The correction that matters most here. Four governing-version rules are in
    // force across the category. Treating "newer than the join date" as per se
    // wrong would raise a finding every time a time-of-service ministry behaved
    // correctly — and a rule that fires on correct behaviour gets the whole
    // report dismissed.
    const findings = auditDenials(
      facts({
        governing_version_rule: 'date_of_service',
        guidelines: [{ ...GUIDELINE, version: 'v3.0', effective_from: '2026-01-01' }],
        denials: [denial({
          member_joined_at: '2025-03-01T00:00:00.000Z',
          service_date: '2026-04-02T00:00:00.000Z',
        })],
      }),
    );
    expect(findings).toEqual([]);
  });

  it('still flags a time-of-service ministry reaching past the date of service', () => {
    const findings = auditDenials(
      facts({
        governing_version_rule: 'date_of_service',
        guidelines: [{ ...GUIDELINE, version: 'v3.0', effective_from: '2026-01-01' }],
        denials: [denial({
          member_joined_at: '2025-03-01T00:00:00.000Z',
          service_date: '2025-11-14T00:00:00.000Z',
        })],
      }),
    );
    expect(findings[0].code).toBe('denial.retroactive');
    expect(findings[0].message).toMatch(/care was delivered/);
  });

  it('says nothing when the governing date is missing rather than guessing', () => {
    // Cannot-tell is not a finding. Scoring a denial whose anchor date we never
    // received would put an accusation on the record built out of a gap in the
    // data.
    const findings = auditDenials(
      facts({
        governing_version_rule: 'date_submitted',
        guidelines: [{ ...GUIDELINE, version: 'v3.0', effective_from: '2026-01-01' }],
        denials: [denial({ member_joined_at: '2025-03-01T00:00:00.000Z', submitted_at: null })],
      }),
    );
    expect(findings).toEqual([]);
  });

  it('falls back to the join date when the ministry has not declared a policy', () => {
    // The strictest of the four, and the right default: a ministry that has not
    // said which version binds gets measured against the reading most
    // protective of the member.
    const findings = auditDenials(
      facts({
        guidelines: [{ ...GUIDELINE, version: 'v3.0', effective_from: '2026-01-01' }],
        denials: [denial({
          member_joined_at: '2025-03-01T00:00:00.000Z',
          service_date: '2026-04-02T00:00:00.000Z',
        })],
      }),
    );
    expect(findings[0].code).toBe('denial.retroactive');
    expect(findings[0].message).toMatch(/member joined/);
  });

  it('flags "covered from day one" denied on exactly that basis', () => {
    // maternity.day_one supports no denial codes at all — denying under it is
    // precisely the marketing-versus-practice gap in the research.
    const findings = auditDenials(
      facts({
        denials: [denial({
          denial_guideline_ref: 'maternity.day_one',
          denial_reason_code: 'preexisting_within_waiting_period',
        })],
      }),
    );
    expect(findings[0].code).toBe('denial.reason_unsupported');
    expect(findings[0].message).toMatch(/does not\s+authorize that reason/);
  });

  it('flags a denial with a provision but no reason code', () => {
    const findings = auditDenials(
      facts({ denials: [denial({ denial_reason_code: null })] }),
    );
    expect(findings[0].code).toBe('denial.no_reason_code');
  });

  it('ranks serious findings first, then by dollars at stake', () => {
    const findings = auditDenials(
      facts({
        denials: [
          denial({ need_id: 'small', denial_reason_code: null, amount_requested_cents: 100_000 }),
          denial({ need_id: 'big', denial_guideline_ref: null, amount_requested_cents: 9_400_000 }),
          denial({ need_id: 'mid', denial_guideline_ref: null, amount_requested_cents: 200_000 }),
        ],
      }),
    );
    expect(findings.map((f) => f.need_id)).toEqual(['big', 'mid', 'small']);
  });

  it('rolls per-denial findings up into org-level rules', () => {
    const report = computeIntegrity(
      facts({ denials: [denial({ denial_guideline_ref: null }), denial({ need_id: 'n2', denial_guideline_ref: null })] }),
      NOW,
    );
    expect(report.reason_codes.map((r) => r.code)).toContain('integrity.denials_without_guideline');
  });

  it('flags a ministry with no published guidelines at all', () => {
    const report = computeIntegrity(facts({ guidelines: [] }), NOW);
    expect(report.reason_codes.map((r) => r.code)).toContain('integrity.no_published_guidelines');
  });

  it('finds the version in force on a given date', () => {
    const versions: GuidelineVersion[] = [
      { ...GUIDELINE, version: 'v1', effective_from: '2023-01-01', effective_to: '2023-12-31' },
      { ...GUIDELINE, version: 'v2', effective_from: '2024-01-01', effective_to: null },
    ];
    expect(guidelineInForce(versions, '2023-06-01')?.version).toBe('v1');
    expect(guidelineInForce(versions, '2026-06-01')?.version).toBe('v2');
    expect(guidelineInForce(versions, '2020-01-01')).toBeNull();
  });
});

describe('small ministries are not scored like Aliera', () => {
  // The calibration failure this guards: rate rules on tiny samples. "1 of 1
  // denials" is a 100% rate and almost no information, and a score that cannot
  // tell a small ministry's bad week from systemic diversion is one nobody
  // will trust twice.
  it('scores a single unbacked denial by count, not by rate', () => {
    const report = computeIntegrity(
      facts({ denials: [denial({ denial_guideline_ref: null })] }),
      NOW,
    );
    const reason = report.reason_codes.find((r) => r.code === 'integrity.denials_without_guideline');
    expect(reason!.weight).toBe(10);
  });

  it('applies the full rate weight once there is a real sample', () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      denial({ need_id: `n${i}`, denial_guideline_ref: i < 4 ? null : 'elective.excluded' }),
    );
    const report = computeIntegrity(facts({ denials: many }), NOW);
    const reason = report.reason_codes.find((r) => r.code === 'integrity.denials_without_guideline');
    expect(reason!.weight).toBe(40);
  });

  it('scores a couple of late claims out of four by count', () => {
    const report = computeIntegrity(
      facts({
        open_claim_count: 4,
        sla_breaches: [{ need_id: 'n1', days_over: 3 }, { need_id: 'n2', days_over: 6 }],
      }),
      NOW,
    );
    const reason = report.reason_codes.find((r) => r.code === 'integrity.sla_breach_rate');
    expect(reason!.weight).toBe(16);
  });

  it('keeps a financially exemplary ministry out of the critical band', () => {
    // 85% share ratio, one unbacked denial, three of four claims late, one
    // overdue appeal. That is a ministry with real operational problems and a
    // clean ledger — it must not read the same as one keeping 84% of the pool.
    const report = computeIntegrity(
      facts({
        denials: [denial({ denial_guideline_ref: null })],
        open_claim_count: 4,
        sla_breaches: [
          { need_id: 'n1', days_over: 27 }, { need_id: 'n2', days_over: 5 }, { need_id: 'n3', days_over: 2 },
        ],
        overdue_appeals: 1,
      }),
      NOW,
    );
    expect(report.band).not.toBe('critical');
    expect(report.benchmark.meets_aca_individual).toBe(true);
    // Still flagged — the point is proportion, not silence.
    expect(report.reason_codes.length).toBeGreaterThan(0);
  });
});

describe('claims that stop moving', () => {
  it('flags a breach rate and names the worst case', () => {
    const report = computeIntegrity(
      facts({
        open_claim_count: 10,
        sla_breaches: [
          { need_id: 'n1', days_over: 5 },
          { need_id: 'n2', days_over: 31 },
          { need_id: 'n3', days_over: 12 },
        ],
      }),
      NOW,
    );
    const reason = report.reason_codes.find((r) => r.code === 'integrity.sla_breach_rate');
    expect(reason!.detail).toMatch(/worst: 31 days over/);
  });

  it('separately flags claims months past commitment', () => {
    const report = computeIntegrity(
      facts({ open_claim_count: 10, sla_breaches: [{ need_id: 'n1', days_over: 95 }] }),
      NOW,
    );
    expect(report.reason_codes.map((r) => r.code)).toContain('integrity.severe_sla_breach');
  });

  it('flags overdue appeals', () => {
    const report = computeIntegrity(facts({ overdue_appeals: 6 }), NOW);
    const reason = report.reason_codes.find((r) => r.code === 'integrity.overdue_appeals');
    expect(reason!.weight).toBe(30);
  });

  it('says nothing when claims are moving on time', () => {
    expect(computeIntegrity(facts(), NOW).reason_codes).toEqual([]);
  });
});
