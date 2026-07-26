import { describe, it, expect } from 'vitest';
import { readableBy } from './search';
import type { Audience } from './types';

/**
 * Who may read what.
 *
 * Pinned separately from the retrieval tests because this is a permission, not
 * a ranking preference, and it is asymmetric in a way that is easy to
 * "simplify" into symmetry by someone who reads the rule without the reason.
 */
describe('audience isolation', () => {
  const AUDIENCES: Audience[] = ['staff', 'member', 'both'];

  it('never lets a member reach staff operations material', () => {
    expect(readableBy('staff', 'member')).toBe(false);
  });

  it('lets staff read everything a member is told', () => {
    // Someone on the phone with a frightened member needs to see exactly what
    // that member has been told about appeals and deadlines. Hiding it would
    // mean the people answering the questions cannot read the answers.
    expect(readableBy('member', 'staff')).toBe(true);
  });

  it('shows shared articles to both', () => {
    expect(readableBy('both', 'staff')).toBe(true);
    expect(readableBy('both', 'member')).toBe(true);
  });

  it('is asymmetric, and that is the point', () => {
    // If this ever becomes symmetric, one of the two directions has been broken
    // — and only one of them is a security problem, which is why both are
    // pinned rather than just the member one.
    expect(readableBy('staff', 'member')).not.toBe(readableBy('member', 'staff'));
  });

  it('lets every audience read its own material', () => {
    for (const a of AUDIENCES) expect(readableBy(a, a === 'both' ? 'staff' : a)).toBe(true);
  });
});
