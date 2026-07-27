import { describe, it, expect } from 'vitest';
import { parseDsn, parseStack, redactPath } from './sentry-client';

/**
 * The two things worth pinning here are the two that fail silently: a stack
 * parsed in the wrong order reads inside out and nobody notices it is the
 * parser's fault, and a redaction that stops matching starts sending member
 * record ids to a third party with no visible symptom at all.
 */

describe('the DSN', () => {
  it('becomes the envelope endpoint', () => {
    const parsed = parseDsn('https://abc123@o456.ingest.us.sentry.io/789');
    expect(parsed).toEqual({
      publicKey: 'abc123',
      url: 'https://o456.ingest.us.sentry.io/api/789/envelope/',
    });
  });

  it('refuses rather than throws when it is malformed', () => {
    // A typo in configuration must degrade to "reporting is off". This module
    // is loaded to handle failures; it must not become one on boot.
    for (const bad of ['', 'not-a-url', 'https://sentry.io/789', 'https://key@sentry.io']) {
      expect(parseDsn(bad)).toBeNull();
    }
  });
});

describe('the stack', () => {
  it('reads V8', () => {
    const frames = parseStack(
      ['Error: boom', '    at save (https://x/assets/index-ab12.js:10:5)'].join('\n'),
    );
    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({
      function: 'save',
      filename: 'https://x/assets/index-ab12.js',
      lineno: 10,
      colno: 5,
      in_app: true,
    });
  });

  it('reads Firefox and Safari', () => {
    const frames = parseStack('save@https://x/assets/index-ab12.js:10:5');
    expect(frames[0]).toMatchObject({ function: 'save', lineno: 10, colno: 5 });
  });

  it('puts the oldest frame first', () => {
    // Sentry renders oldest-first and a JS stack is newest-first. Getting this
    // backwards puts the throwing line where the entry point belongs, and every
    // stack in the project reads inside out — which looks like a Sentry quirk
    // rather than our bug, so nobody goes looking.
    const frames = parseStack(
      [
        'Error: boom',
        '    at inner (https://x/assets/a.js:3:1)',
        '    at outer (https://x/assets/b.js:9:1)',
      ].join('\n'),
    );
    expect(frames.map((f) => f.function)).toEqual(['outer', 'inner']);
  });

  it('marks other people code as not ours', () => {
    // Otherwise Sentry names a browser extension's content script as the
    // culprit, on exactly the machines where that is hardest to disprove.
    const frames = parseStack('    at f (chrome-extension://abc/inject.js:1:1)');
    expect(frames[0].in_app).toBe(false);
  });

  it('skips what it cannot read rather than guessing', () => {
    // A frame with a wrong line number sends somebody to the wrong place in
    // the file, which is worse than one fewer frame.
    expect(parseStack('Error: boom\n    at <unknown>')).toEqual([]);
  });

  it('survives no stack at all', () => {
    expect(parseStack(undefined)).toEqual([]);
  });
});

describe('the path', () => {
  it('strips prefixed record ids', () => {
    expect(redactPath('/app/members/mem_01H9ZQK4/needs')).toBe('/app/members/:id/needs');
  });

  it('strips long opaque tokens with no prefix', () => {
    expect(redactPath('/app/invite/aVeryLongOpaqueToken123')).toBe('/app/invite/:id');
  });

  it('leaves route names alone', () => {
    // Over-redacting is not free: '/:id/:id' groups unrelated pages together
    // and the URL stops being worth sending.
    expect(redactPath('/app/settings/rules')).toBe('/app/settings/rules');
    expect(redactPath('/app/integrity')).toBe('/app/integrity');
  });

  it('covers every id prefix the product mints', () => {
    // Written against the shape rather than a list of known prefixes, so a new
    // one added to src/lib/ids.ts a year from now cannot start leaking.
    for (const prefix of ['mem', 'need', 'hh', 'app', 'claim', 'alert', 'org', 'imp']) {
      expect(redactPath(`/app/x/${prefix}_01H9ZQK4TR`)).toBe('/app/x/:id');
    }
  });
});
