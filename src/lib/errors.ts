/**
 * Turning a failure into words somebody can act on.
 *
 * Pure, and here rather than in the toast component, for the same reason the
 * NRI rules are pure: what a product says to somebody at the moment it has
 * failed them is an opinion worth pinning in a test, not an incidental string
 * inside a `catch`.
 *
 * Before this there were three different fallback sentences — "That did not
 * work.", "That did not save.", and `Request failed (500).` — chosen by
 * whichever file the author happened to be in. None of them said what to do
 * next, and the third is not a sentence at all. This is software people open on
 * the worst day of a family's year; an error that only says *that* something
 * broke leaves somebody guessing whether the thing they were doing for a member
 * happened or not.
 *
 * Three rules the wording follows:
 *
 * **Say whether their work survived.** The single most useful fact in a failure
 * is whether the thing was saved. "Nothing was saved" and "this may already
 * have gone through" lead to opposite next actions, and getting it wrong is
 * worse than saying nothing.
 *
 * **Never blame the person for our fault.** A 500 gets "nothing you did caused
 * this". Staff who believe they broke something stop using the feature.
 *
 * **Offline is not an error.** It is a temporary condition with an obvious
 * remedy, and dressing it up as a failure sends somebody looking for a problem
 * in the product.
 */

export interface DescribedError {
  /** One line. What happened, in plain words. */
  title: string;
  /** What to do next. Absent when there is genuinely nothing to suggest. */
  detail?: string;
  /**
   * Whether trying the same thing again is reasonable. Drives whether the
   * toast offers a retry — offering one on a 403 teaches people the button
   * does nothing.
   */
  retryable: boolean;
  /**
   * Whether the write may have landed despite the error. Only ever true when
   * we genuinely cannot tell, because "it may have worked" is an unhelpful
   * thing to say when we know perfectly well that it did not.
   */
  uncertain: boolean;
  /** Correlates with the server log and the Sentry event. Shown, not hidden. */
  requestId?: string | null;
  /** For grouping and for the bug report. Not shown to the user. */
  status?: number;
  /**
   * The raw underlying message, when it was too technical to show. Never
   * rendered; carried so a bug report and a Sentry event say what actually
   * happened rather than the sentence we showed instead.
   */
  technical?: string;
}

/** Mirrors the shape `ApiError` carries, without importing the client. */
interface ApiErrorLike {
  name?: string;
  message?: string;
  status?: number;
  requestId?: string | null;
  payload?: unknown;
}

/**
 * Status 0 means the request never reached the Worker — DNS, offline, a
 * captive portal, a cancelled navigation. It is deliberately distinct from a
 * 5xx: one of those means the server failed, and the other means we never got
 * to ask it.
 */
export const NETWORK_ERROR_STATUS = 0;

export function describeError(error: unknown): DescribedError {
  const api = asApiError(error);

  if (api?.status === NETWORK_ERROR_STATUS) {
    return {
      title: 'You appear to be offline.',
      // Named explicitly because the fear in this moment is that the typing is
      // gone. On the editors it genuinely is not — the draft is local.
      detail: 'Nothing was sent, and nothing you have typed has been lost. Try again when you are back on.',
      retryable: true,
      uncertain: false,
      status: api.status,
    };
  }

  switch (api?.status) {
    case 401:
      return {
        title: 'You have been signed out.',
        detail: 'Sign in again — this page will still be here.',
        retryable: false,
        uncertain: false,
        requestId: api.requestId,
        status: api.status,
      };

    case 403:
      return {
        title: message(api) ?? 'You do not have permission to do that.',
        // Names who *does*, because the useful next step is asking them rather
        // than retrying and failing again.
        detail: 'An owner or admin at your ministry can. Nothing was changed.',
        retryable: false,
        uncertain: false,
        requestId: api.requestId,
        status: api.status,
      };

    case 404:
      return {
        title: message(api) ?? 'That is no longer there.',
        detail: 'It may have been removed while this page was open. Refreshing will show what is current.',
        retryable: false,
        uncertain: false,
        requestId: api.requestId,
        status: api.status,
      };

    case 409:
      return {
        title: message(api) ?? 'Somebody else changed this first.',
        detail: 'Refresh to see their version before saving yours, so neither of you loses work.',
        retryable: false,
        uncertain: false,
        requestId: api.requestId,
        status: api.status,
      };

    case 413:
      return {
        title: message(api) ?? 'That is too large to send.',
        detail: 'Try a smaller file, or split the roster into more than one upload.',
        retryable: false,
        uncertain: false,
        requestId: api.requestId,
        status: api.status,
      };

    case 422:
      return {
        title: message(api) ?? 'Some answers need another look.',
        // No "try again" — the fields say what is wrong, and a retry without
        // changing anything fails identically.
        detail: fieldSummary(api.payload),
        retryable: false,
        uncertain: false,
        requestId: api.requestId,
        status: api.status,
      };

    case 429:
      return {
        title: message(api) ?? 'That has been tried too many times just now.',
        detail: 'Wait a minute and try again. If it is urgent, telephone rather than waiting.',
        retryable: true,
        uncertain: false,
        requestId: api.requestId,
        status: api.status,
      };

    default:
      break;
  }

  if (api?.status && api.status >= 500) {
    return {
      title: 'Something on our side failed.',
      // The apology is doing real work: staff who think they broke it stop
      // using the feature, and then the thing this product exists to notice
      // goes unnoticed.
      detail: 'Nothing you did caused this. It is worth trying once more — and if it keeps happening, report it and we will see the same error you did.',
      retryable: true,
      // A 500 can be thrown after a write has committed. Saying so is the
      // honest answer and stops somebody entering the same record twice.
      uncertain: true,
      requestId: api?.requestId,
      status: api.status,
    };
  }

  if (api?.status && api.status >= 400) {
    return {
      title: message(api) ?? 'That did not go through.',
      retryable: false,
      uncertain: false,
      requestId: api.requestId,
      status: api.status,
    };
  }

  // Not an API failure at all — a bug in our own browser code.
  //
  // The message is deliberately *not* used as the title here, unlike every
  // branch above. A thrown runtime error says things like "x.map is not a
  // function", which is a sentence about our code addressed to us; putting it
  // in front of a ministry staff member tells them nothing and reads as the
  // product having come apart. It is kept in `technical` instead, where the bug
  // report and Sentry can carry it to somebody it means something to.
  return {
    title: 'Something went wrong.',
    detail: 'Nothing you did caused this. Reloading the page usually clears it.',
    retryable: false,
    uncertain: true,
    technical: api?.message?.trim() || undefined,
  };
}

function asApiError(error: unknown): ApiErrorLike | null {
  if (!error || typeof error !== 'object') return null;
  return error as ApiErrorLike;
}

/**
 * The server's own sentence, when it wrote one worth showing.
 *
 * Generic filler produced by the client's own fallback is dropped: showing
 * "Request failed (403)." next to a considered explanation of what a 403 means
 * is worse than showing the explanation alone.
 */
function message(api: ApiErrorLike | null): string | undefined {
  const text = api?.message?.trim();
  if (!text) return undefined;
  if (/^Request failed \(\d+\)\.?$/.test(text)) return undefined;
  return text;
}

/**
 * Validation issues, summarised.
 *
 * The fields themselves carry the per-field messages; this exists so the toast
 * says *how many* and *where*, which is what tells somebody whether to look up
 * the page or down it.
 */
function fieldSummary(payload: unknown): string | undefined {
  const issues = (payload as { issues?: { path?: string; message?: string }[] } | null)?.issues;
  if (!Array.isArray(issues) || issues.length === 0) return undefined;

  if (issues.length === 1) {
    const only = issues[0];
    return only?.message ? `${only.message}` : undefined;
  }
  return `${issues.length} answers need changing. They are marked on the form.`;
}
