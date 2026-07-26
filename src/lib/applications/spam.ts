import type { ApplicationSubmission } from './schema';

/**
 * Spam scoring for the public application endpoint.
 *
 * This is the second unauthenticated write path in the product. The first is
 * the Stripe webhook, which is defended by a signature — there is no equivalent
 * here, because the whole point is that a stranger who found the ministry can
 * apply.
 *
 * The governing constraint shapes everything below: **a false positive costs a
 * family their membership application.** Somebody filling this in may be doing
 * it on a phone, in a hospital car park, having been told their insurance
 * lapsed. Losing that submission to a spam filter is far worse than a ministry
 * deleting a junk row.
 *
 * So nothing here rejects. It scores, the score is stored, and a high score
 * sorts the application to a "probably junk" tab that a human still sees. A
 * silent drop is the one behaviour this must never have — the applicant would
 * be told their application was sent, and it would not exist.
 *
 * No CAPTCHA either. It taxes every legitimate applicant, fails hardest for
 * people on poor connections and screen readers, and is defeated cheaply.
 *
 * Pure: signals in, score out. No network, no clock beyond what is passed.
 */

export interface SpamSignals {
  /**
   * A field no human sees, so anything in it came from something filling every
   * input it found. The single highest-signal, lowest-cost check there is.
   */
  honeypot?: string;
  /** Milliseconds between the form rendering and it being submitted. */
  fillMs?: number;
  /** Submissions from the same address in the last hour. */
  recentFromSameIp?: number;
  /** Applications already on file for this email address. */
  existingForEmail?: number;
}

export interface SpamVerdict {
  /** 0–100. Higher is more suspicious. Never a decision on its own. */
  score: number;
  /** Named reasons, so a reviewer can see why something was sorted low. */
  reasons: string[];
  /** Sort into the low-confidence tab. Still stored, still visible, still answerable. */
  suspicious: boolean;
}

/** Below this, a human could not have read the form, let alone filled it in. */
const MIN_PLAUSIBLE_FILL_MS = 4_000;

/** Free-text bodies get checked for the shape of link spam. */
const LINK = /https?:\/\/|www\.[a-z]/gi;
const BBCODE = /\[url[=\]]|<a\s+href=/i;

export function scoreSubmission(
  submission: ApplicationSubmission,
  signals: SpamSignals = {},
): SpamVerdict {
  const reasons: string[] = [];
  let score = 0;

  if (signals.honeypot && signals.honeypot.trim() !== '') {
    score += 60;
    reasons.push('Filled in a field that is not shown to people.');
  }

  // Only scored when we actually have the timing. A missing value means the
  // page did not report it, which is not evidence of anything.
  if (typeof signals.fillMs === 'number' && signals.fillMs >= 0 && signals.fillMs < MIN_PLAUSIBLE_FILL_MS) {
    score += 35;
    reasons.push('Submitted faster than the form can be read.');
  }

  if ((signals.recentFromSameIp ?? 0) >= 5) {
    score += 30;
    reasons.push('Several applications from the same connection within the hour.');
  } else if ((signals.recentFromSameIp ?? 0) >= 3) {
    score += 15;
    reasons.push('A few applications from the same connection within the hour.');
  }

  // Worth flagging, never worth blocking: a household legitimately re-applies
  // after a decline, and a spouse may apply from a shared address.
  if ((signals.existingForEmail ?? 0) > 0) {
    score += 10;
    reasons.push('An application already exists for this email address.');
  }

  const freeText = Object.values(submission.answers ?? {})
    .flatMap((section) => Object.values(section))
    .filter((v): v is string => typeof v === 'string')
    .join(' ');

  const links = freeText.match(LINK)?.length ?? 0;
  if (links >= 2) {
    score += 30;
    reasons.push('Links in the free-text answers.');
  } else if (links === 1) {
    score += 10;
    reasons.push('A link in the free-text answers.');
  }

  if (BBCODE.test(freeText)) {
    score += 25;
    reasons.push('Markup in the free-text answers.');
  }

  // A name that is a URL, or a household of one repeated character. Cheap, and
  // it catches the generated submissions that get every other check right.
  const name = `${submission.spine?.first_name ?? ''} ${submission.spine?.last_name ?? ''}`;
  if (LINK.test(name)) {
    score += 40;
    reasons.push('The name field contains a link.');
  }

  return {
    score: Math.min(100, score),
    reasons,
    // Set high on purpose. This threshold decides which tab a real family's
    // application lands in, and the cost of being wrong is not symmetric.
    suspicious: score >= 60,
  };
}
