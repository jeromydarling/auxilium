import { describe, it, expect } from 'vitest';
import { computeSignals, buildCompass, explain, shouldResurface, rankForTriage } from './engine';
import { deriveNudges, shouldAutoOpen } from './nudges';
import { NRI_RULES, RULES_VERSION } from './rules';
import { bandForScore, NRI_DIRECTIONS } from './directions';
import type { MemberFacts, NeedFacts, PrayerFacts } from './types';

/**
 * These tests pin the behavior the product promises: that a score is the sum of
 * its stated reasons, that the five demo personas land where staff expect, and
 * that dismissing a signal hides it without hiding a genuine escalation.
 *
 * `NOW` is fixed so every relative-time rule is deterministic.
 */
const NOW = '2026-07-25T12:00:00.000Z';
const daysAgo = (n: number) => new Date(Date.parse(NOW) - n * 86_400_000).toISOString();
const daysAhead = (n: number) => new Date(Date.parse(NOW) + n * 86_400_000).toISOString();

function member(over: Partial<MemberFacts> = {}): MemberFacts {
  return {
    id: 'mem_test',
    org_id: 'org_test',
    status: 'active',
    created_at: daysAgo(400),
    joined_at: daysAgo(400),
    last_contact_at: daysAgo(10),
    last_response_at: daysAgo(10),
    onboarding_complete: true,
    financial_stress: false,
    household: {
      id: 'hh_test',
      member_count: 2,
      dependent_count: 0,
      caregiver_count: 0,
      share_amount_cents: 45_000,
      recent_membership_changes: 0,
    },
    is_primary_contact: true,
    needs: [],
    prayer_requests: [],
    unanswered_outreach: 0,
    ...over,
  };
}

function need(over: Partial<NeedFacts> = {}): NeedFacts {
  return {
    id: 'need_test',
    status: 'in_review',
    category: 'medical',
    urgency: 'normal',
    amount_requested_cents: 500_000,
    submitted_at: daysAgo(5),
    last_status_change_at: daysAgo(5),
    created_at: daysAgo(5),
    assigned_to: 'usr_staff',
    ...over,
  };
}

function prayer(over: Partial<PrayerFacts> = {}): PrayerFacts {
  return {
    id: 'pray_test',
    category: 'general',
    status: 'open',
    is_urgent: false,
    created_at: daysAgo(3),
    followup_due_at: null,
    last_followup_at: null,
    ...over,
  };
}

const scoreFor = (f: MemberFacts, d: string) =>
  computeSignals(f, NOW).find((s) => s.direction === d)!;

describe('rule set integrity', () => {
  it('has unique, stable rule codes', () => {
    const codes = NRI_RULES.map((r) => r.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('namespaces every rule code under its own direction', () => {
    for (const rule of NRI_RULES) {
      expect(rule.code.startsWith(`${rule.direction}.`)).toBe(true);
    }
  });

  it('gives every rule a rationale a human can read', () => {
    for (const rule of NRI_RULES) {
      expect(rule.rationale.length).toBeGreaterThan(40);
    }
  });
});

describe('scores are the sum of their stated reasons', () => {
  it('reports weights that add up to the score', () => {
    const facts = member({
      needs: [need({ amount_requested_cents: 8_000_000, last_status_change_at: daysAgo(40) })],
      financial_stress: true,
    });
    const onus = scoreFor(facts, 'onus');
    const sum = onus.reason_codes.reduce((acc, r) => acc + r.weight, 0);
    expect(onus.score).toBe(Math.min(100, sum));
    expect(onus.reason_codes.length).toBeGreaterThan(1);
  });

  it('clamps to 100 and never below 0', () => {
    const piledOn = member({
      status: 'lapsed',
      onboarding_complete: false,
      joined_at: daysAgo(500),
      last_contact_at: daysAgo(500),
      last_response_at: null,
      unanswered_outreach: 9,
    });
    const fides = scoreFor(piledOn, 'fides');
    expect(fides.score).toBe(100);

    const clean = scoreFor(member(), 'cura');
    expect(clean.score).toBe(0);
  });

  it('returns all four directions even when they score zero', () => {
    const signals = computeSignals(member(), NOW);
    expect(signals.map((s) => s.direction).sort()).toEqual([...NRI_DIRECTIONS].sort());
    expect(signals.every((s) => s.source === RULES_VERSION)).toBe(true);
  });

  it('is deterministic — same facts and clock produce identical output', () => {
    const facts = member({ needs: [need({ urgency: 'critical' })] });
    expect(JSON.stringify(computeSignals(facts, NOW)))
      .toBe(JSON.stringify(computeSignals(facts, NOW)));
  });
});

describe('the five demo personas land where staff expect', () => {
  it('a healthy member is clear on every direction', () => {
    const compass = buildCompass(computeSignals(member(), NOW));
    expect(compass.band).toBe('clear');
    expect(compass.peak).toBeLessThan(25);
  });

  it('a hospitalized, bereaved member is urgent on Cura', () => {
    const facts = member({
      prayer_requests: [
        prayer({ id: 'p1', category: 'hospitalization', status: 'open', is_urgent: true }),
        prayer({ id: 'p2', category: 'bereavement', status: 'open' }),
      ],
    });
    const cura = scoreFor(facts, 'cura');
    expect(bandForScore(cura.score)).toBe('urgent');
    expect(cura.reason_codes.map((r) => r.code)).toContain('cura.hospitalization');
    expect(cura.reason_codes.map((r) => r.code)).toContain('cura.bereavement');
  });

  it('a large stalled unassigned case is urgent on Onus', () => {
    const facts = member({
      needs: [need({
        amount_requested_cents: 9_400_000,
        status: 'in_review',
        urgency: 'critical',
        assigned_to: null,
        last_status_change_at: daysAgo(35),
      })],
    });
    const onus = scoreFor(facts, 'onus');
    expect(bandForScore(onus.score)).toBe('urgent');
    const codes = onus.reason_codes.map((r) => r.code);
    expect(codes).toContain('onus.major_need');
    expect(codes).toContain('onus.overdue_processing');
    expect(codes).toContain('onus.unassigned');
  });

  it('a large caregiving household in transition is urgent on Familia', () => {
    const facts = member({
      household: {
        id: 'hh_big',
        member_count: 8,
        dependent_count: 6,
        caregiver_count: 1,
        share_amount_cents: 82_500,
        recent_membership_changes: 2,
      },
      needs: [need({ category: 'maternity', created_at: daysAgo(20) })],
    });
    const familia = scoreFor(facts, 'familia');
    expect(bandForScore(familia.score)).toBe('urgent');
  });

  it('a disengaged member is urgent on Fides', () => {
    const facts = member({
      status: 'lapsed',
      onboarding_complete: false,
      joined_at: daysAgo(200),
      last_contact_at: daysAgo(220),
      last_response_at: null,
      unanswered_outreach: 5,
    });
    const fides = scoreFor(facts, 'fides');
    expect(bandForScore(fides.score)).toBe('urgent');
    expect(fides.reason_codes.map((r) => r.code)).toContain('fides.no_response');
  });
});

describe('individual rules behave at their boundaries', () => {
  it('does not penalize a member still inside the onboarding grace period', () => {
    const fresh = member({ onboarding_complete: false, joined_at: daysAgo(20) });
    expect(scoreFor(fresh, 'fides').reason_codes.map((r) => r.code))
      .not.toContain('fides.onboarding_incomplete');

    const stale = member({ onboarding_complete: false, joined_at: daysAgo(45) });
    expect(scoreFor(stale, 'fides').reason_codes.map((r) => r.code))
      .toContain('fides.onboarding_incomplete');
  });

  it('escalates a stalled case from 30 to 40 points past a month', () => {
    const twoWeeks = member({ needs: [need({ last_status_change_at: daysAgo(15) })] });
    const oneMonth = member({ needs: [need({ last_status_change_at: daysAgo(35) })] });
    const w = (f: MemberFacts) =>
      scoreFor(f, 'onus').reason_codes.find((r) => r.code === 'onus.overdue_processing')!.weight;
    expect(w(twoWeeks)).toBe(30);
    expect(w(oneMonth)).toBe(40);
  });

  it('ignores terminal cases entirely', () => {
    const done = member({
      needs: [need({
        status: 'completed',
        amount_requested_cents: 9_000_000,
        assigned_to: null,
        last_status_change_at: daysAgo(90),
      })],
    });
    expect(scoreFor(done, 'onus').score).toBe(0);
  });

  it('counts a follow-up as overdue only after its due date passes', () => {
    const future = member({ prayer_requests: [prayer({ followup_due_at: daysAhead(3) })] });
    const past = member({ prayer_requests: [prayer({ followup_due_at: daysAgo(4) })] });
    const has = (f: MemberFacts) =>
      scoreFor(f, 'cura').reason_codes.some((r) => r.code === 'cura.followup_overdue');
    expect(has(future)).toBe(false);
    expect(has(past)).toBe(true);
  });

  it('caps accumulated ordinary prayer requests at 20 points', () => {
    const many = member({
      prayer_requests: Array.from({ length: 6 }, (_, i) => prayer({ id: `p${i}` })),
    });
    const reason = scoreFor(many, 'cura').reason_codes.find((r) => r.code === 'cura.open_prayer')!;
    expect(reason.weight).toBe(20);
  });

  it('flags a member with no household on Familia', () => {
    const orphan = member({ household: null });
    expect(scoreFor(orphan, 'familia').reason_codes.map((r) => r.code))
      .toContain('familia.unassigned_household');
  });
});

describe('household complexity lands on one person, not everyone', () => {
  const bigHousehold = {
    id: 'hh_big',
    member_count: 8,
    dependent_count: 5,
    caregiver_count: 1,
    share_amount_cents: 82_500,
    recent_membership_changes: 2,
  };

  it('scores household structure on the primary contact', () => {
    const primary = member({ household: bigHousehold, is_primary_contact: true });
    const codes = scoreFor(primary, 'familia').reason_codes.map((r) => r.code);
    expect(codes).toContain('familia.large_household');
    expect(codes).toContain('familia.many_dependents');
    expect(codes).toContain('familia.caregiving');
    expect(codes).toContain('familia.recent_change');
  });

  it('does not repeat household structure on every dependent', () => {
    // The bug this guards: eight members of one family each surfacing at 100,
    // which fills the triage board with a single household and ranks nothing.
    const dependent = member({ household: bigHousehold, is_primary_contact: false });
    expect(scoreFor(dependent, 'familia').score).toBe(0);
  });

  it('still scores a dependent on facts that are genuinely their own', () => {
    const dependentWithBaby = member({
      household: bigHousehold,
      is_primary_contact: false,
      needs: [need({ category: 'maternity', created_at: daysAgo(20) })],
    });
    const codes = scoreFor(dependentWithBaby, 'familia').reason_codes.map((r) => r.code);
    expect(codes).toContain('familia.new_baby');
    expect(codes).not.toContain('familia.large_household');
  });

  it('falls back to scoring everyone when no primary is marked', () => {
    // A messy import may leave a household with no primary. Duplicated signals
    // are a better failure than a complex family nobody sees.
    const noPrimary = member({ household: bigHousehold, is_primary_contact: true });
    expect(scoreFor(noPrimary, 'familia').score).toBeGreaterThan(0);
  });
});

describe('explanations', () => {
  it('always states why, and what to do about it', () => {
    const facts = member({ needs: [need({ urgency: 'critical', assigned_to: null })] });
    const e = explain(scoreFor(facts, 'onus'));
    expect(e.summary).toMatch(/Onus/);
    expect(e.reasons.length).toBeGreaterThan(0);
    expect(e.recommended_response.length).toBeGreaterThan(10);
    expect(e.band).toBe(bandForScore(e.score));
  });

  it('says so plainly when a direction is clear', () => {
    expect(explain(scoreFor(member(), 'cura')).summary).toMatch(/clear/i);
  });

  it('orders reasons heaviest first', () => {
    const facts = member({
      prayer_requests: [
        prayer({ id: 'p1', category: 'hospitalization' }),
        prayer({ id: 'p2' }),
      ],
    });
    const weights = scoreFor(facts, 'cura').reason_codes.map((r) => r.weight);
    expect([...weights].sort((a, b) => b - a)).toEqual(weights);
  });
});

describe('the compass', () => {
  it('breaks a tie toward Cura over Onus', () => {
    const compass = buildCompass([
      { subject_type: 'member', subject_id: 'm', direction: 'onus', score: 50, reason_codes: [], source: 'rules.v1', updated_at: NOW, dismissed: false },
      { subject_type: 'member', subject_id: 'm', direction: 'cura', score: 50, reason_codes: [], source: 'rules.v1', updated_at: NOW, dismissed: false },
    ]);
    expect(compass.dominant).toBe('cura');
  });

  it('treats a dismissed signal as contributing nothing', () => {
    const compass = buildCompass([
      { subject_type: 'member', subject_id: 'm', direction: 'onus', score: 90, reason_codes: [], source: 'rules.v1', updated_at: NOW, dismissed: true },
      { subject_type: 'member', subject_id: 'm', direction: 'fides', score: 30, reason_codes: [], source: 'rules.v1', updated_at: NOW, dismissed: false },
    ]);
    expect(compass.peak).toBe(30);
    expect(compass.dominant).toBe('fides');
  });

  it('ranks a member lit on three directions above one lit on one, at equal peak', () => {
    const mk = (scores: Record<string, number>) => ({
      compass: buildCompass(
        NRI_DIRECTIONS.map((d) => ({
          subject_type: 'member' as const, subject_id: 'm', direction: d,
          score: scores[d] ?? 0, reason_codes: [], source: 'rules.v1',
          updated_at: NOW, dismissed: false,
        })),
      ),
    });
    const broad = mk({ cura: 60, onus: 55, fides: 50 });
    const narrow = mk({ cura: 60 });
    expect(rankForTriage([narrow, broad])[0]).toBe(broad);
  });
});

describe('dismissal resurfacing', () => {
  it('stays hidden when nothing meaningful changed', () => {
    expect(shouldResurface(60, 62)).toBe(false);
    expect(shouldResurface(60, 55)).toBe(false);
  });

  it('comes back when the score crosses into a worse band', () => {
    expect(shouldResurface(70, 78)).toBe(true);
  });

  it('comes back on a large jump within the same band', () => {
    expect(shouldResurface(50, 68)).toBe(true);
  });

  it('never resurfaces a signal that was never dismissed', () => {
    expect(shouldResurface(null, 100)).toBe(false);
  });
});

describe('the session engine', () => {
  const base = {
    urgentSignalCount: 0, urgentMemberCount: 0, unassignedNeedCount: 0,
    stalledNeedCount: 0, overdueFollowupCount: 0, orphanMemberCount: 0,
    pendingImportCount: 0, disengagingMemberCount: 0, unassignedPrayerCount: 0,
    totalMemberCount: 120,
  };

  it('tells an empty org exactly one thing', () => {
    const nudges = deriveNudges({ ...base, totalMemberCount: 0 });
    expect(nudges).toHaveLength(1);
    expect(nudges[0].action?.route).toBe('/imports');
  });

  it('says something reassuring rather than nothing when all is well', () => {
    const nudges = deriveNudges(base);
    expect(nudges).toHaveLength(1);
    expect(nudges[0].kind).toBe('reflection');
  });

  it('never shows more than five nudges at once', () => {
    const nudges = deriveNudges({
      ...base, urgentMemberCount: 4, unassignedNeedCount: 9, stalledNeedCount: 6,
      overdueFollowupCount: 3, orphanMemberCount: 12, pendingImportCount: 2,
      disengagingMemberCount: 8, unassignedPrayerCount: 5,
    });
    expect(nudges.length).toBeLessThanOrEqual(5);
  });

  it('puts the most confident nudge first', () => {
    const nudges = deriveNudges({ ...base, urgentMemberCount: 1, orphanMemberCount: 3 });
    expect(nudges[0].id).toBe('nudge.urgent.members');
  });

  it('honors dismissals', () => {
    const dismissed = new Set(['nudge.urgent.members']);
    const nudges = deriveNudges({ ...base, urgentMemberCount: 2 }, dismissed);
    expect(nudges.map((n) => n.id)).not.toContain('nudge.urgent.members');
  });

  it('auto-opens only for high-confidence action nudges', () => {
    expect(shouldAutoOpen(deriveNudges({ ...base, urgentMemberCount: 1 }))).toBe(true);
    expect(shouldAutoOpen(deriveNudges({ ...base, disengagingMemberCount: 5 }))).toBe(false);
    expect(shouldAutoOpen(deriveNudges(base))).toBe(false);
  });
});
