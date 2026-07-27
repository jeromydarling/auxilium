import { describe, it, expect } from 'vitest';
import { validateReport, summariseReport, describeAttachments, MAX_BODY } from './report';

describe('what gets rejected', () => {
  it('is essentially only an empty report', () => {
    // The failure mode of a reporting channel is silence, not bad reports. A
    // ministry told their description is too short does not write a longer one
    // — they close the panel, work around the bug, and we never find out.
    expect(validateReport({ kind: 'bug', body: 'x' })).toEqual([]);
    expect(validateReport({ kind: 'bug', body: 'broken' })).toEqual([]);
    expect(validateReport({ kind: 'idea', body: '?' })).toEqual([]);
  });

  it('never asks for a minimum length', () => {
    const issue = validateReport({ kind: 'bug', body: '   ' })[0];
    expect(issue.message).not.toMatch(/at least|minimum|characters long|too short/i);
    // Says what to do, and promises what happens next.
    expect(issue.message).toMatch(/Tell us what happened/i);
  });

  it('catches an empty body whatever the whitespace', () => {
    for (const body of ['', '   ', '\n\t ']) {
      expect(validateReport({ kind: 'bug', body })).toHaveLength(1);
    }
  });

  it('refuses a body that would not fit, and says which part to keep', () => {
    const issue = validateReport({ kind: 'bug', body: 'x'.repeat(MAX_BODY + 1) })[0];
    expect(issue.path).toBe('body');
    expect(issue.message).toMatch(/what you were doing/i);
  });

  it('handles being given nothing at all', () => {
    expect(validateReport(null)).toHaveLength(1);
    expect(validateReport(undefined)).toHaveLength(1);
  });
});

describe('the subject line', () => {
  it('is the first sentence when there is one', () => {
    expect(summariseReport('The members page will not load. It spins forever.'))
      .toBe('The members page will not load.');
  });

  it('never cuts mid-word', () => {
    // "Members page will not lo" in an inbox reads as a broken system rather
    // than a report about one.
    const summary = summariseReport('a'.repeat(3) + ' ' + 'verylongwordindeed '.repeat(10), 40);
    expect(summary.endsWith('…')).toBe(true);
    expect(summary).not.toMatch(/verylongwordin…$/);
  });

  it('collapses the whitespace somebody pasted in', () => {
    expect(summariseReport('Line one\n\n   Line two')).toBe('Line one Line two');
  });

  it('says something rather than nothing when handed nothing', () => {
    expect(summariseReport('   ')).toBe('No description');
  });
});

describe('what the reporter is shown before sending', () => {
  const draft = {
    kind: 'bug' as const,
    body: 'It broke.',
    route: '/app/members/:id',
    requestId: 'req_abc',
    recentErrors: [
      { at: '2026-07-27T10:00:00Z', message: 'boom', route: '/app/members/:id', status: 500 },
      { at: '2026-07-27T10:00:01Z', message: 'bang', route: '/app/members/:id' },
    ],
  };

  it('lists the page, the build, and the errors', () => {
    const lines = describeAttachments(draft).join('\n');
    expect(lines).toContain('/app/members/:id');
    expect(lines).toMatch(/version of Auxilium/i);
    expect(lines).toMatch(/last 2 errors/i);
  });

  it('states plainly that no member data goes', () => {
    // The thing somebody is actually wondering about. A report that silently
    // attaches diagnostics is one they would be right to hesitate over.
    const lines = describeAttachments(draft);
    expect(lines[lines.length - 1]).toMatch(/No member names, records/i);
  });

  it('gets the singular right for one error', () => {
    const lines = describeAttachments({ ...draft, recentErrors: [draft.recentErrors[0]] });
    expect(lines.join('\n')).toContain('The error that just happened');
  });

  it('says nothing about errors when there were none', () => {
    const lines = describeAttachments({ ...draft, recentErrors: [] }).join('\n');
    expect(lines).not.toMatch(/error/i);
  });

  it('never promises to attach a route it does not have', () => {
    const lines = describeAttachments({ kind: 'idea', body: 'x' }).join('\n');
    expect(lines).not.toMatch(/The page you are on/);
  });
});
