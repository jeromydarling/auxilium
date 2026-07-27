import { describe, it, expect } from 'vitest';
import { describeError, NETWORK_ERROR_STATUS, type DescribedError } from './errors';

/**
 * These pin wording, which is unusual for a test suite and deliberate here.
 *
 * An error message is the one piece of copy written while somebody is already
 * having a bad time, and it is the piece most likely to be changed carelessly
 * by whoever is passing through the file. Each assertion below stands for a
 * decision about what a person is owed at that moment.
 */

const err = (status: number, message = 'Request failed.', extra: Record<string, unknown> = {}) =>
  Object.assign(new Error(message), { name: 'ApiError', status, ...extra });

describe('offline', () => {
  it('is not described as a failure', () => {
    const d = describeError(err(NETWORK_ERROR_STATUS, 'Failed to fetch'));
    expect(d.title).toMatch(/offline/i);
    // The fear in this moment is that the typing is gone. Answer it directly.
    expect(d.detail).toMatch(/has been lost|not been lost/i);
    expect(d.retryable).toBe(true);
  });

  it('never claims the write might have landed', () => {
    // We know it did not: the request never left. Saying "this may have gone
    // through" here would send somebody to check a record that cannot exist.
    expect(describeError(err(NETWORK_ERROR_STATUS)).uncertain).toBe(false);
  });
});

describe('our fault', () => {
  it('says so, rather than leaving somebody to assume it was theirs', () => {
    const d = describeError(err(500));
    expect(d.detail).toMatch(/Nothing you did caused this/i);
  });

  it('admits the write may have landed anyway', () => {
    // A 500 can be thrown after the commit. Somebody who assumes it failed
    // enters the record twice, which for a contribution is a real problem.
    expect(describeError(err(500)).uncertain).toBe(true);
  });

  it('offers a retry, because one is genuinely worth trying', () => {
    expect(describeError(err(503)).retryable).toBe(true);
  });
});

describe('their fault, but not really', () => {
  it('names who can do it instead of only refusing', () => {
    const d = describeError(err(403, 'You do not have permission to do that.'));
    expect(d.detail).toMatch(/owner or admin/i);
    // "Nothing was changed" is the fact that stops somebody going to look.
    expect(d.detail).toMatch(/Nothing was changed/i);
  });

  it('does not offer a retry on a permission failure', () => {
    // A retry button that cannot possibly work teaches people that buttons in
    // this product do nothing.
    expect(describeError(err(403)).retryable).toBe(false);
  });

  it('explains a 404 as something that changed underneath them', () => {
    const d = describeError(err(404, 'That page was not found.'));
    expect(d.detail).toMatch(/while this page was open/i);
  });

  it('tells two editors how not to lose each other work', () => {
    const d = describeError(err(409));
    expect(d.detail).toMatch(/neither of you loses work/i);
  });
});

describe('the server sentence', () => {
  it('is preferred when the server wrote a real one', () => {
    expect(describeError(err(400, 'A page needs a title.')).title).toBe('A page needs a title.');
  });

  it('is dropped when it is only the client fallback', () => {
    // "Request failed (403)." next to a considered explanation of what a 403
    // means is worse than the explanation alone.
    const d = describeError(err(403, 'Request failed (403).'));
    expect(d.title).not.toMatch(/Request failed/);
    expect(d.title).toMatch(/permission/i);
  });
});

describe('validation', () => {
  it('passes a single issue through verbatim', () => {
    const d = describeError(
      err(422, 'Some answers need another look.', {
        payload: { issues: [{ path: 'email', message: 'That email address is missing an @.' }] },
      }),
    );
    expect(d.detail).toBe('That email address is missing an @.');
  });

  it('counts them when there are several, and points at the form', () => {
    const d = describeError(
      err(422, 'Some answers need another look.', {
        payload: { issues: [{ message: 'a' }, { message: 'b' }, { message: 'c' }] },
      }),
    );
    expect(d.detail).toMatch(/3 answers/);
    expect(d.detail).toMatch(/marked on the form/i);
  });

  it('never offers a retry — the same submission fails identically', () => {
    expect(describeError(err(422)).retryable).toBe(false);
  });
});

describe('the request id', () => {
  it('survives, because it is what ties a report to the log', () => {
    expect(describeError(err(500, 'x', { requestId: 'req_abc' })).requestId).toBe('req_abc');
  });
});

describe('anything else', () => {
  it('still produces something actionable rather than a stack trace', () => {
    const d = describeError(new TypeError('x.map is not a function'));
    expect(d.detail).toMatch(/Reloading the page/i);
  });

  it('survives being handed rubbish', () => {
    // A `throw 'string'` somewhere must not take the toast down with it.
    for (const rubbish of [null, undefined, 'boom', 42, {}]) {
      const d = describeError(rubbish);
      expect(typeof d.title).toBe('string');
      expect(d.title.length).toBeGreaterThan(0);
    }
  });
});

describe('every description', () => {
  const cases: DescribedError[] = [
    describeError(err(NETWORK_ERROR_STATUS)),
    describeError(err(401)), describeError(err(403)), describeError(err(404)),
    describeError(err(409)), describeError(err(413)), describeError(err(429)),
    describeError(err(500)), describeError(new Error('x')),
  ];

  it('ends its title as a sentence', () => {
    // Half-sentences read as debug output, which is what the old
    // "Request failed (500)" was.
    for (const c of cases) expect(c.title).toMatch(/[.!?]$/);
  });

  it('avoids the words that make software sound like it is covering itself', () => {
    // "An unexpected error occurred" tells somebody nothing and sounds like a
    // legal department. The voice rule for this product is warm, plain, direct.
    for (const c of cases) {
      const all = `${c.title} ${c.detail ?? ''}`;
      expect(all).not.toMatch(/unexpected error|an error occurred|please try again later|oops/i);
    }
  });

  it('never blames the person', () => {
    for (const c of cases) {
      expect(`${c.title} ${c.detail ?? ''}`).not.toMatch(/you must|you failed|invalid input/i);
    }
  });
});
