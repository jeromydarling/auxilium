import { describe, it, expect } from 'vitest';
import {
  validateIntake, hasBlockingIssue, describeMissing,
  isValidNpi, isValidProcedureCode, isValidDiagnosisCode,
} from './intake';
import { evaluateSla, computeDueAt, buildTracker, isMinistryBlocking } from './sla';
import { reprice, summarizeRepricing, DEFAULT_MULTIPLIER_BPS } from './repricing';
import { assessEligibility } from './eligibility';
import type { GuidelineVersion } from '../integrity/types';

const NOW = '2026-07-25T12:00:00.000Z';
const daysAgo = (n: number) => new Date(Date.parse(NOW) - n * 86_400_000).toISOString();

describe('NPI check digit', () => {
  it('accepts real, correctly-formed NPIs', () => {
    // Verified against the 80840 Luhn algorithm CMS specifies.
    expect(isValidNpi('1234567893')).toBe(true);
    expect(isValidNpi('1245319599')).toBe(true);
  });

  it('rejects a wrong check digit', () => {
    expect(isValidNpi('1234567890')).toBe(false);
  });

  it('rejects transposed digits — the common typo', () => {
    expect(isValidNpi('1234567893')).toBe(true);
    expect(isValidNpi('1234567839')).toBe(false);
  });

  it('rejects anything that is not ten digits', () => {
    expect(isValidNpi('12345')).toBe(false);
    expect(isValidNpi('12345678931')).toBe(false);
    expect(isValidNpi('')).toBe(false);
  });

  it('ignores formatting punctuation', () => {
    expect(isValidNpi('123-456-7893')).toBe(true);
  });
});

describe('procedure and diagnosis codes', () => {
  it('accepts CPT, Category II/III, and HCPCS', () => {
    expect(isValidProcedureCode('99213')).toBe(true);   // office visit
    expect(isValidProcedureCode('0001F')).toBe(true);   // Category II
    expect(isValidProcedureCode('0042T')).toBe(true);   // Category III
    expect(isValidProcedureCode('J1885')).toBe(true);   // HCPCS
  });

  it('rejects free text typed into a code field', () => {
    expect(isValidProcedureCode('office visit')).toBe(false);
    expect(isValidProcedureCode('9921')).toBe(false);
    expect(isValidProcedureCode('')).toBe(false);
  });

  it('accepts ICD-10 with and without a subclassification', () => {
    expect(isValidDiagnosisCode('J45.909')).toBe(true);
    expect(isValidDiagnosisCode('E11')).toBe(true);
    expect(isValidDiagnosisCode('S72.001A')).toBe(true);
  });

  it('rejects a description in the diagnosis field', () => {
    expect(isValidDiagnosisCode('asthma')).toBe(false);
    expect(isValidDiagnosisCode('123.45')).toBe(false);
  });
});

describe('claim intake blocks what cannot be worked', () => {
  const complete = {
    member_id: 'mem_1',
    procedure_code: '99213',
    diagnosis_code: 'J45.909',
    provider_npi: '1234567893',
    provider_name: 'Regional Medical Center',
    service_date: daysAgo(10),
    billed_cents: 450_000,
    has_itemized_bill: true,
  };

  it('accepts a complete claim with no issues at all', () => {
    expect(validateIntake(complete, NOW)).toEqual([]);
  });

  it('blocks a claim with no procedure code — the silent-stall case', () => {
    const issues = validateIntake({ ...complete, procedure_code: null }, NOW);
    expect(hasBlockingIssue(issues)).toBe(true);
    expect(issues[0].message).toMatch(/would sit unworked/);
  });

  it('blocks a claim with no itemized bill', () => {
    const issues = validateIntake({ ...complete, has_itemized_bill: false }, NOW);
    expect(issues.find((i) => i.code === 'itemized.missing')?.severity).toBe('blocking');
  });

  it('blocks a mistyped NPI and says why', () => {
    const issues = validateIntake({ ...complete, provider_npi: '1234567839' }, NOW);
    const issue = issues.find((i) => i.code === 'npi.invalid');
    expect(issue?.severity).toBe('blocking');
    expect(issue?.message).toMatch(/transposed/);
  });

  it('warns but does not block on a missing diagnosis code', () => {
    const issues = validateIntake({ ...complete, diagnosis_code: null }, NOW);
    expect(hasBlockingIssue(issues)).toBe(false);
  });

  it('blocks a future date of service', () => {
    const issues = validateIntake({ ...complete, service_date: '2027-01-01' }, NOW);
    expect(issues.find((i) => i.code === 'service_date.future')?.severity).toBe('blocking');
  });

  it('warns on very old services rather than rejecting them', () => {
    const issues = validateIntake({ ...complete, service_date: daysAgo(1500) }, NOW);
    expect(issues.find((i) => i.code === 'service_date.stale')?.severity).toBe('warning');
  });

  it('blocks a zero or missing billed amount', () => {
    expect(hasBlockingIssue(validateIntake({ ...complete, billed_cents: 0 }, NOW))).toBe(true);
  });

  it('names everything still needed in one sentence', () => {
    const issues = validateIntake(
      { ...complete, procedure_code: null, has_itemized_bill: false },
      NOW,
    );
    expect(describeMissing(issues)).toBe('Still needed: the procedure code and an itemized bill.');
  });

  it('says nothing is needed when the claim is complete', () => {
    expect(describeMissing(validateIntake(complete, NOW))).toBeNull();
  });
});

describe('the SLA clock', () => {
  const base = {
    stage: 'in_review' as const,
    submitted_at: daysAgo(5),
    created_at: daysAgo(5),
    sla_due_at: null,
    first_response_at: daysAgo(4),
    last_status_change_at: daysAgo(4),
    sla_days: 17,
  };

  it('computes a due date from the commitment', () => {
    expect(computeDueAt('2026-07-01T00:00:00.000Z', 17)).toBe('2026-07-18T00:00:00.000Z');
  });

  it('reports a fresh claim as on track', () => {
    const state = evaluateSla(base, NOW);
    expect(state.status).toBe('on_track');
    expect(state.needs_escalation).toBe(false);
    expect(state.days_remaining).toBe(12);
  });

  it('warns as the deadline approaches', () => {
    expect(evaluateSla({ ...base, submitted_at: daysAgo(15), first_response_at: daysAgo(14) }, NOW).status)
      .toBe('due_soon');
  });

  it('breaches past the commitment and escalates', () => {
    const state = evaluateSla({ ...base, submitted_at: daysAgo(25), first_response_at: daysAgo(24) }, NOW);
    expect(state.status).toBe('breached');
    expect(state.days_over).toBe(8);
    expect(state.needs_escalation).toBe(true);
    expect(state.member_message).toMatch(/8 days past our commitment/);
  });

  it('escalates severely at twice the window — the Raleigh case', () => {
    const state = evaluateSla({ ...base, submitted_at: daysAgo(90), first_response_at: daysAgo(80) }, NOW);
    expect(state.status).toBe('severely_breached');
    expect(state.member_message).toMatch(/That is our failure/);
  });

  it('escalates an unacknowledged claim before its deadline', () => {
    // Nobody has looked at it in six days of a seventeen-day window. The
    // deadline has not passed, but silence is the thing that becomes a story.
    const state = evaluateSla({ ...base, submitted_at: daysAgo(6), first_response_at: null }, NOW);
    expect(state.status).toBe('on_track');
    expect(state.acknowledged).toBe(false);
    expect(state.needs_escalation).toBe(true);
  });

  it('stops the clock while waiting on the member', () => {
    const state = evaluateSla(
      { ...base, stage: 'needs_info', submitted_at: daysAgo(40), last_status_change_at: daysAgo(5) },
      NOW,
    );
    expect(state.status).toBe('on_track');
    expect(state.needs_escalation).toBe(false);
  });

  it('but chases after two weeks of silence, rather than letting it die there', () => {
    const state = evaluateSla(
      { ...base, stage: 'needs_info', last_status_change_at: daysAgo(30) },
      NOW,
    );
    expect(state.status).toBe('breached');
    expect(state.needs_escalation).toBe(true);
    expect(state.member_message).toMatch(/We will call you/);
  });

  it('closes out terminal claims without escalating', () => {
    const state = evaluateSla({ ...base, stage: 'completed', submitted_at: daysAgo(200) }, NOW);
    expect(state.status).toBe('closed');
    expect(state.needs_escalation).toBe(false);
    expect(state.member_message).toBe('Shared and paid.');
  });

  it('tells a declined member they can appeal', () => {
    expect(evaluateSla({ ...base, stage: 'declined' }, NOW).member_message).toMatch(/can appeal/);
  });

  it('knows which stages are the ministry’s to move', () => {
    expect(isMinistryBlocking('in_review')).toBe(true);
    expect(isMinistryBlocking('needs_info')).toBe(false);
    expect(isMinistryBlocking('completed')).toBe(false);
  });
});

describe('the member-facing tracker', () => {
  it('marks progress through the stages', () => {
    const steps = buildTracker({
      stage: 'approved',
      submitted_at: daysAgo(10),
      created_at: daysAgo(10),
      first_response_at: daysAgo(8),
    });
    expect(steps.map((s) => s.state)).toEqual(['done', 'done', 'current', 'upcoming', 'upcoming']);
  });

  it('shows a decline as a failed decision, not a failed review', () => {
    // Review happened and finished. What failed is the decision, and marking
    // review as the failure told a declined member the process had broken down
    // and a decision was still coming.
    const steps = buildTracker({
      stage: 'declined', submitted_at: daysAgo(10), created_at: daysAgo(10), first_response_at: daysAgo(8),
    });
    expect(steps[0].state).toBe('done');   // received
    expect(steps[1].state).toBe('done');   // reviewed
    expect(steps[2].state).toBe('failed'); // decided, against them
  });

  it('does not leave payment steps hanging after a decline', () => {
    // "Being paid" and "Paid" sitting there as upcoming steps tell somebody
    // whose need was just refused that money is still on its way. That is the
    // exact false hope this product exists to prevent, so the tracker stops
    // where the claim actually stopped.
    const steps = buildTracker({
      stage: 'declined', submitted_at: daysAgo(10), created_at: daysAgo(10), first_response_at: daysAgo(8),
    });
    expect(steps).toHaveLength(3);
    expect(steps.map((s) => s.key)).not.toContain('completed');

    // A withdrawn claim is over for a different reason, but just as over.
    expect(buildTracker({
      stage: 'withdrawn', submitted_at: daysAgo(10), created_at: daysAgo(10), first_response_at: null,
    })).toHaveLength(3);
  });

  it('parks at review while waiting on information', () => {
    const steps = buildTracker({
      stage: 'needs_info', submitted_at: daysAgo(3), created_at: daysAgo(3), first_response_at: daysAgo(2),
    });
    expect(steps[1].state).toBe('current');
  });
});

describe('reference-based repricing', () => {
  it('reprices against Medicare and reports the saving', () => {
    // $42,000 billed on a $9,000 Medicare allowable — a 467% chargemaster.
    const result = reprice({
      billed_cents: 4_200_000,
      medicare_cents: 900_000,
      multiplier_bps: DEFAULT_MULTIPLIER_BPS,
    });
    expect(result.repriced_cents).toBe(1_350_000);   // 150% of Medicare
    expect(result.savings_cents).toBe(2_850_000);
    expect(result.savings_bps).toBe(6_786);           // ~68% saved
    expect(result.worthwhile).toBe(true);
  });

  it('lands in the 20–50% band documented for RBP deployments', () => {
    const result = reprice({
      billed_cents: 1_000_000, medicare_cents: 500_000, multiplier_bps: 15_000,
    });
    expect(result.savings_bps).toBeGreaterThanOrEqual(2_000);
    expect(result.savings_bps).toBeLessThanOrEqual(5_000);
  });

  it('never proposes more than was billed', () => {
    const result = reprice({
      billed_cents: 100_000, medicare_cents: 900_000, multiplier_bps: 20_000,
    });
    expect(result.repriced_cents).toBe(100_000);
    expect(result.savings_cents).toBe(0);
  });

  it('clamps an absurd multiplier into the defensible band', () => {
    expect(reprice({ billed_cents: 1_000_000, medicare_cents: 100_000, multiplier_bps: 500 }).multiplier_bps)
      .toBe(10_000);
    expect(reprice({ billed_cents: 9_000_000, medicare_cents: 100_000, multiplier_bps: 90_000 }).multiplier_bps)
      .toBe(30_000);
  });

  it('declines to reprice with no Medicare reference on file', () => {
    const result = reprice({ billed_cents: 500_000, medicare_cents: 0, multiplier_bps: 15_000 });
    expect(result.explanation).toMatch(/No Medicare reference rate/);
    expect(result.worthwhile).toBe(false);
  });

  it('calls small savings not worth the friction', () => {
    expect(reprice({ billed_cents: 110_000, medicare_cents: 70_000, multiplier_bps: 15_000 }).worthwhile)
      .toBe(false);
  });

  it('states its basis, so it reads as a negotiation not a refusal', () => {
    const result = reprice({ billed_cents: 4_200_000, medicare_cents: 900_000, multiplier_bps: 15_000 });
    expect(result.explanation).toMatch(/467% of the Medicare allowable/);
    expect(result.explanation).toMatch(/\$13,500\.00/);
  });

  it('summarizes a portfolio', () => {
    const summary = summarizeRepricing([
      reprice({ billed_cents: 4_200_000, medicare_cents: 900_000, multiplier_bps: 15_000 }),
      reprice({ billed_cents: 1_000_000, medicare_cents: 500_000, multiplier_bps: 15_000 }),
      reprice({ billed_cents: 110_000, medicare_cents: 70_000, multiplier_bps: 15_000 }),
    ]);
    expect(summary.claims).toBe(3);
    expect(summary.worthwhile_claims).toBe(2);
    expect(summary.savings_cents).toBe(3_105_000);
  });
});

describe('pre-submission eligibility — answering before the bill, not after', () => {
  const guideline: GuidelineVersion = {
    version: 'v2.0',
    effective_from: '2024-01-01',
    effective_to: null,
    provisions: [
      {
        code: 'preexisting.phase_in',
        statement: 'Pre-existing conditions phase in over 36 months of membership.',
        supports_denial_codes: ['preexisting_within_waiting_period'],
        waiting_period_days: 1095,
      },
      {
        code: 'cosmetic.excluded',
        statement: 'Cosmetic procedures are not shared.',
        supports_denial_codes: ['excluded'],
        category: 'cosmetic',
      },
      {
        code: 'annual.limit',
        statement: 'Sharing is limited to $1,000,000 per member per year.',
        supports_denial_codes: ['annual_limit_reached'],
        annual_limit_cents: 100_000_000,
      },
    ],
  };

  const query = {
    category: 'surgical',
    estimated_cents: 4_000_000,
    planned_date: '2026-09-01T00:00:00.000Z',
    member_joined_at: '2020-01-01T00:00:00.000Z',
    is_preexisting: false,
    shared_this_year_cents: 0,
  };

  it('refuses to guess with no guidelines on record', () => {
    const result = assessEligibility(query, null, null, NOW);
    expect(result.verdict).toBe('uncertain');
    expect(result.confidence).toBe(0);
    expect(result.member_guidance).toMatch(/cannot give you a reliable answer/);
  });

  it('states an exclusion plainly rather than softening it', () => {
    const result = assessEligibility({ ...query, category: 'cosmetic' }, guideline, null, NOW);
    expect(result.verdict).toBe('excluded');
    expect(result.member_guidance).toMatch(/not shared/);
    expect(result.next_steps.join(' ')).toMatch(/cash price/);
  });

  it('catches a waiting period before the procedure, not after the bill', () => {
    // The $67,000 kidney-stone case, answered in advance.
    const result = assessEligibility(
      { ...query, is_preexisting: true, member_joined_at: '2025-01-01T00:00:00.000Z' },
      guideline, null, NOW,
    );
    expect(result.verdict).toBe('likely_denied');
    expect(result.factors.map((f) => f.code)).toContain('guideline.waiting_period');
    expect(result.next_steps.join(' ')).toMatch(/days, it would fall inside/);
  });

  it('says so when the guidelines are silent on pre-existing conditions', () => {
    const silent: GuidelineVersion = { ...guideline, provisions: [guideline.provisions[1]] };
    const result = assessEligibility({ ...query, is_preexisting: true }, silent, null, NOW);
    expect(result.verdict).toBe('uncertain');
    expect(result.factors.map((f) => f.code)).toContain('guideline.preexisting_silent');
  });

  it('flags a projected breach of the annual limit', () => {
    const result = assessEligibility(
      { ...query, estimated_cents: 50_000_000, shared_this_year_cents: 60_000_000 },
      guideline, null, NOW,
    );
    expect(result.factors.map((f) => f.code)).toContain('guideline.annual_limit');
    expect(result.verdict).toBe('uncertain');
  });

  it('weighs what the ministry actually does, not what it advertises', () => {
    const result = assessEligibility(query, guideline, {
      category: 'surgical', submitted: 40, denied: 18,
      common_denial_reasons: ['preexisting_within_waiting_period', 'documentation_incomplete'],
    }, NOW);
    expect(result.verdict).toBe('uncertain');
    const factor = result.factors.find((f) => f.code === 'history.high_denial_rate');
    expect(factor?.detail).toMatch(/45%/);
  });

  it('is more confident where the ministry reliably shares', () => {
    const result = assessEligibility(query, guideline, {
      category: 'surgical', submitted: 60, denied: 1, common_denial_reasons: [],
    }, NOW);
    expect(result.verdict).toBe('likely_shared');
    expect(result.confidence).toBeGreaterThan(70);
  });

  it('lowers confidence when there is barely any history', () => {
    const result = assessEligibility(query, guideline, {
      category: 'surgical', submitted: 2, denied: 0, common_denial_reasons: [],
    }, NOW);
    expect(result.confidence).toBeLessThanOrEqual(55);
    expect(result.factors.map((f) => f.code)).toContain('history.thin');
  });

  it('never promises, even at its most positive', () => {
    const result = assessEligibility(query, guideline, {
      category: 'surgical', submitted: 60, denied: 0, common_denial_reasons: [],
    }, NOW);
    expect(result.member_guidance).toMatch(/not a guarantee/);
    expect(result.member_guidance).not.toMatch(/will be (shared|covered)/);
  });

  it('says so plainly when the care has already happened', () => {
    // Run after the fact it still works, but the member is already exposed and
    // should not be given scheduling advice they can no longer act on.
    const result = assessEligibility(
      { ...query, planned_date: daysAgo(30) }, guideline, null, NOW,
    );
    expect(result.next_steps.join(' ')).toMatch(/already happened/);
  });

  it('tells members to get large amounts in writing', () => {
    const result = assessEligibility({ ...query, estimated_cents: 9_400_000 }, guideline, null, NOW);
    expect(result.next_steps.join(' ')).toMatch(/written pre-determination/);
  });
});
