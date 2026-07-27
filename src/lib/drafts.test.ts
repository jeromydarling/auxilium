import { describe, it, expect } from 'vitest';
import { assessDraft, describeAge, draftKey, DRAFT_TTL_MS, type StoredDraft } from './drafts';

const NOW = Date.parse('2026-07-27T12:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();

const draft = (over: Partial<StoredDraft<{ title: string }>> = {}): StoredDraft<{ title: string }> => ({
  value: { title: 'My unsaved title' },
  savedAt: ago(5 * 60_000),
  baseUpdatedAt: '2026-07-27T11:00:00Z',
  ...over,
});

describe('when there is nothing to recover', () => {
  it('says so for a missing draft', () => {
    expect(assessDraft(null, { title: 'x' }, null, NOW)).toEqual({ offer: false, reason: 'none' });
  });

  it('stays quiet when the draft matches what is already loaded', () => {
    // The common case after a successful save. Prompting here would train
    // people to dismiss the prompt, and then the one that matters is dismissed
    // with it.
    const d = draft({ value: { title: 'Same' } });
    expect(assessDraft(d, { title: 'Same' }, '2026-07-27T11:00:00Z', NOW))
      .toEqual({ offer: false, reason: 'identical' });
  });

  it('drops a draft older than a week', () => {
    // "Restore your unsaved changes?" about something from last month reads as
    // the product being confused rather than helpful.
    const d = draft({ savedAt: ago(DRAFT_TTL_MS + 60_000) });
    expect(assessDraft(d, { title: 'server' }, null, NOW)).toEqual({ offer: false, reason: 'expired' });
  });

  it('drops a draft with an unreadable timestamp rather than trusting it', () => {
    const d = draft({ savedAt: 'not-a-date' });
    expect(assessDraft(d, { title: 'server' }, null, NOW)).toEqual({ offer: false, reason: 'expired' });
  });
});

describe('when there is', () => {
  it('offers it, with when', () => {
    const d = draft();
    expect(assessDraft(d, { title: 'server copy' }, '2026-07-27T11:00:00Z', NOW))
      .toEqual({ offer: true, conflict: false, savedAt: d.savedAt });
  });

  it('flags a conflict when the record moved since the draft started', () => {
    // This is the whole reason `baseUpdatedAt` is stored. Without it there is
    // no way to tell "my unsaved work" from "my stale work on top of a page a
    // colleague has since rewritten", and restoring the second reverts their
    // edit with nobody the wiser.
    const verdict = assessDraft(draft(), { title: 'server copy' }, '2026-07-27T11:45:00Z', NOW);
    expect(verdict).toMatchObject({ offer: true, conflict: true });
  });

  it('does not cry conflict when the record has not moved', () => {
    const verdict = assessDraft(draft(), { title: 'server' }, '2026-07-27T11:00:00Z', NOW);
    expect(verdict).toMatchObject({ conflict: false });
  });

  it('does not cry conflict when there is nothing to compare', () => {
    // A record with no updated_at cannot be shown to have moved, and guessing
    // "conflict" would put a scary warning on every ordinary recovery.
    expect(assessDraft(draft({ baseUpdatedAt: null }), { title: 'server' }, null, NOW))
      .toMatchObject({ conflict: false });
  });

  it('never silently restores — every offer is a decision', () => {
    // There is deliberately no verdict that means "just apply it". The person
    // is the only one who can weigh their paragraph against a colleague's.
    const verdict = assessDraft(draft(), { title: 'server' }, '2026-07-27T11:59:00Z', NOW);
    expect(verdict.offer).toBe(true);
    expect(Object.keys(verdict)).not.toContain('apply');
  });
});

describe('the age', () => {
  it('reads the way somebody would say it', () => {
    expect(describeAge(ago(10_000), NOW)).toBe('a moment ago');
    expect(describeAge(ago(60_000), NOW)).toBe('1 minute ago');
    expect(describeAge(ago(45 * 60_000), NOW)).toBe('45 minutes ago');
    expect(describeAge(ago(60 * 60_000), NOW)).toBe('1 hour ago');
    expect(describeAge(ago(5 * 60 * 60_000), NOW)).toBe('5 hours ago');
    expect(describeAge(ago(24 * 60 * 60_000), NOW)).toBe('yesterday');
    expect(describeAge(ago(3 * 24 * 60 * 60_000), NOW)).toBe('3 days ago');
  });

  it('survives a clock that disagrees', () => {
    // A device whose clock is ahead produces a negative age. "in -3 minutes"
    // is worse than a vague truth.
    expect(describeAge(new Date(NOW + 60_000).toISOString(), NOW)).toBe('a moment ago');
    expect(describeAge('rubbish', NOW)).toBe('a moment ago');
  });
});

describe('the storage key', () => {
  it('namespaces by editor and record, so two never collide', () => {
    expect(draftKey('cms-page', 'page_1')).toBe('auxilium:draft:cms-page:page_1');
    expect(draftKey('cms-page', 'page_1')).not.toBe(draftKey('apply-form', 'page_1'));
  });
});
