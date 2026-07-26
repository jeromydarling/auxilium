import { describe, it, expect } from 'vitest';
import { buildOnboarding, summarizeOnboarding, type OnboardingFacts } from './steps';

/**
 * These pin the two things that make a checklist trustworthy: that status
 * reflects reality rather than a flag, and that it disappears when it should.
 */

const EMPTY: OnboardingFacts = {
  commitment_chosen: false,
  governing_rule_declared: false,
  published_guideline_versions: 0,
  member_count: 0,
  team_member_count: 0,
  has_ledger_entries: false,
  share_ratio_decided: false,
  portal_accounts: 0,
  dismissed: false,
};

const SET_UP: OnboardingFacts = {
  commitment_chosen: true,
  governing_rule_declared: true,
  published_guideline_versions: 2,
  member_count: 40,
  team_member_count: 3,
  has_ledger_entries: true,
  share_ratio_decided: true,
  portal_accounts: 12,
  dismissed: false,
};

describe('ministry setup', () => {
  it('starts with everything outstanding', () => {
    const { done, total, complete } = summarizeOnboarding(EMPTY);
    expect(done).toBe(0);
    expect(total).toBeGreaterThan(4);
    expect(complete).toBe(false);
  });

  it('completes when the ministry is actually set up', () => {
    const s = summarizeOnboarding(SET_UP);
    expect(s.complete).toBe(true);
    expect(s.blocking).toHaveLength(0);
  });

  it('un-ticks a step when the thing it describes goes away', () => {
    // The whole reason status is derived. A ministry that deletes its only
    // guideline version must stop showing a tick next to "publish guidelines" —
    // a recorded boolean would keep claiming it was done.
    const after = summarizeOnboarding({ ...SET_UP, published_guideline_versions: 0 });
    expect(after.complete).toBe(false);
    expect(after.steps.find((s) => s.key === 'guidelines')!.status).toBe('todo');
  });

  it('names the blocking gaps rather than treating every step as equal', () => {
    const { blocking } = summarizeOnboarding(EMPTY);
    const keys = blocking.map((s) => s.key);
    expect(keys).toContain('commitment');
    expect(keys).toContain('roster');
    expect(keys).toContain('guidelines');
    // Adding a colleague is genuinely optional; nothing misreports without it.
    expect(keys).not.toContain('team');
  });

  it('hides itself once complete, without needing to be dismissed', () => {
    expect(summarizeOnboarding(SET_UP).visible).toBe(false);
  });

  it('stays hidden when dismissed, even with work outstanding', () => {
    const s = summarizeOnboarding({ ...EMPTY, dismissed: true });
    expect(s.visible).toBe(false);
    // Dismissed is not done — the gaps are still reported to anything that asks.
    expect(s.complete).toBe(false);
    expect(s.blocking.length).toBeGreaterThan(0);
  });

  it('tells every step what breaks, in specifics', () => {
    for (const step of buildOnboarding(EMPTY)) {
      expect(step.consequence.length, `${step.key} has a thin consequence`).toBeGreaterThan(40);
      // "Recommended" is what a checklist says when it cannot explain itself.
      expect(step.consequence.toLowerCase()).not.toContain('recommended');
      expect(step.route.startsWith('/'), `${step.key} has no route`).toBe(true);
    }
  });

  it('has no duplicate keys', () => {
    const keys = buildOnboarding(EMPTY).map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('the publishing decision', () => {
  it('is outstanding until the ministry answers it either way', () => {
    const steps = buildOnboarding(EMPTY);
    expect(steps.find((s) => s.key === 'publish_ratio')?.status).toBe('todo');
  });

  it('is done whichever way they answered', () => {
    // Choosing not to publish is a complete answer. A checklist that only ticks
    // for "yes" is not asking a question, it is applying pressure.
    const steps = buildOnboarding({ ...EMPTY, share_ratio_decided: true });
    expect(steps.find((s) => s.key === 'publish_ratio')?.status).toBe('done');
  });

  it('does not block, because a ministry that declines is not broken', () => {
    expect(buildOnboarding(EMPTY).find((s) => s.key === 'publish_ratio')?.weight)
      .not.toBe('blocking');
  });

  it('names what stays invisible rather than calling itself recommended', () => {
    const step = buildOnboarding(EMPTY).find((s) => s.key === 'publish_ratio')!;
    expect(step.consequence).toMatch(/invisible/);
    expect(step.consequence.toLowerCase()).not.toContain('recommend');
  });
});
