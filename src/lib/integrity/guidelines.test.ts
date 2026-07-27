import { describe, it, expect } from 'vitest';
import { canChange, correctionImpact, usageCount } from './guidelines';

/**
 * The distinction these pin is the whole point of the module: a correction and
 * a new version look identical to a user and have opposite consequences for
 * decisions already made.
 */

const unused = { denials: 0, applications: 0 };
const used = { denials: 11, applications: 3 };

describe('correcting a version', () => {
  it('is always allowed', () => {
    // A ministry that mistyped an effective date must be able to fix it. The
    // version that could not left them publishing a near-duplicate to get
    // around it, which muddles which document binds which members.
    expect(canChange('correction', unused).allowed).toBe(true);
    expect(canChange('correction', used).allowed).toBe(true);
  });

  it('re-scores past decisions, because the wrong text never governed anything', () => {
    expect(canChange('correction', used).rescores).toBe(true);
  });

  it('re-scores nothing when nothing was decided under it', () => {
    expect(canChange('correction', unused).rescores).toBe(false);
  });
});

describe('publishing a new version', () => {
  it('never re-scores', () => {
    // Both documents are real and each governed a period. Re-scoring old
    // declines against the new one would be falsifying the ministry's own
    // history in the one record a regulator would ask for.
    expect(canChange('new_version', used)).toEqual({ allowed: true, rescores: false });
  });
});

describe('withdrawing a version', () => {
  it('is allowed when nothing depends on it', () => {
    expect(canChange('withdrawal', unused).allowed).toBe(true);
  });

  it('is refused the moment anything cites it', () => {
    expect(canChange('withdrawal', { denials: 1, applications: 0 }).allowed).toBe(false);
    expect(canChange('withdrawal', { denials: 0, applications: 1 }).allowed).toBe(false);
  });

  it('says what to do instead, not only no', () => {
    // A ministry told only "you cannot delete this" learns nothing and will
    // publish a near-duplicate version to get around it — worse than the
    // mistake they were working around.
    const reason = canChange('withdrawal', used).reason!;
    expect(reason).toMatch(/Correct it instead/);
    expect(reason).toMatch(/previous text stays on file/);
  });

  it('counts what depends on it in words somebody can check', () => {
    const reason = canChange('withdrawal', { denials: 11, applications: 3 }).reason!;
    expect(reason).toContain('11 declines');
    expect(reason).toContain('3 applications');
  });

  it('gets the singular right', () => {
    // "1 declines already depend on this" is the kind of thing that makes
    // somebody trust the rest of the sentence less.
    const reason = canChange('withdrawal', { denials: 1, applications: 0 }).reason!;
    expect(reason).toContain('1 decline ');
    expect(reason).toContain('depends on this');
  });
});

describe('what a ministry is told before correcting', () => {
  it('names the number rather than warning vaguely', () => {
    // "This will affect past decisions" is ignorable. A count is something
    // somebody can weigh, which is the difference between a confirmation people
    // read and one they click through.
    expect(correctionImpact(used)).toContain('11 declines');
    expect(correctionImpact(used)).toMatch(/re-checked/);
  });

  it('says plainly when nothing is affected', () => {
    expect(correctionImpact(unused)).toMatch(/nothing is re-checked/);
  });

  it('promises the old wording survives', () => {
    // The reason the correction path is safe at all.
    expect(correctionImpact(used)).toMatch(/stays on file/);
  });

  it('counts both kinds of dependant', () => {
    expect(usageCount(used)).toBe(14);
  });
});
