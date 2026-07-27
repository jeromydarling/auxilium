/**
 * Deciding whether to offer somebody their unsaved work back.
 *
 * Pure, and separate from the hook that stores it, because the interesting part
 * is not "write to localStorage" — it is the judgement about *when a recovered
 * draft is safe to offer*, which has a wrong answer that quietly destroys a
 * colleague's work.
 *
 * The failure this exists to prevent is ordinary and common: a ministry
 * administrator spends twenty minutes rewriting the page that explains what is
 * and is not shared, the laptop sleeps, the session cookie is fine but the tab
 * is reloaded, and every sentence is gone. There is no version of that which is
 * the user's fault.
 *
 * **Why local and not server autosave.** Saving a site page republishes it —
 * that is deliberate, because edits sitting invisibly as drafts on a live site
 * is how a ministry ends up believing it has corrected something it has not. So
 * an autosave straight to the server would push half-written sentences onto a
 * public website between keystrokes. The draft stays on the device until
 * somebody presses Save.
 */

export interface StoredDraft<T> {
  /** What they had typed. */
  value: T;
  /** When it was last touched, ISO-8601. */
  savedAt: string;
  /**
   * `updated_at` of the server record the draft was started from.
   *
   * This is the field that makes recovery safe rather than dangerous. Without
   * it there is no way to tell "my own unsaved work" from "my stale work, on
   * top of a page a colleague has since rewritten" — and restoring the second
   * silently reverts their edit.
   */
  baseUpdatedAt: string | null;
}

export type DraftVerdict =
  /** Nothing stored, or it matches what is already on screen. */
  | { offer: false; reason: 'none' | 'identical' | 'expired' }
  /** Safe: the server record has not moved since the draft was started. */
  | { offer: true; conflict: false; savedAt: string }
  /**
   * Offer it, but say that somebody else has saved since. Never silently
   * restore — the person needs to decide which version survives, and they are
   * the only one who can.
   */
  | { offer: true; conflict: true; savedAt: string };

/**
 * How long a draft is worth keeping.
 *
 * Seven days. Long enough to cover a weekend and a forgotten tab; short enough
 * that "restore your unsaved changes?" never refers to something from a
 * previous month, which reads as the product being confused rather than
 * helpful.
 */
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function assessDraft<T>(
  stored: StoredDraft<T> | null,
  serverValue: T,
  serverUpdatedAt: string | null,
  now: number,
): DraftVerdict {
  if (!stored) return { offer: false, reason: 'none' };

  const savedMs = Date.parse(stored.savedAt);
  if (!Number.isFinite(savedMs) || now - savedMs > DRAFT_TTL_MS) {
    return { offer: false, reason: 'expired' };
  }

  // The overwhelmingly common case: they saved, and the draft is now a copy of
  // what the server already has. Offering it would train people to dismiss a
  // prompt that occasionally matters.
  if (equivalent(stored.value, serverValue)) return { offer: false, reason: 'identical' };

  // The server has moved since this draft was started. Almost always a
  // colleague; occasionally the same person on another device. Either way,
  // restoring without saying so would revert an edit nobody knows about.
  const conflict = Boolean(
    stored.baseUpdatedAt && serverUpdatedAt && serverUpdatedAt !== stored.baseUpdatedAt,
  );

  return { offer: true, conflict, savedAt: stored.savedAt };
}

/**
 * Structural comparison via JSON.
 *
 * Adequate and deliberately simple: these values are plain data that came from
 * `JSON.parse` on one side and a React state object built from the same shape
 * on the other, so key order is stable in practice. A false "they differ" costs
 * one dismissible prompt; a false "they match" costs somebody their work — so
 * where this is imprecise, it is imprecise in the safe direction.
 */
function equivalent<T>(a: T, b: T): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/** Namespaced so two editors, or two records, never collide. */
export function draftKey(scope: string, id: string): string {
  return `auxilium:draft:${scope}:${id}`;
}

/**
 * "2 minutes ago", for the recovery prompt.
 *
 * Relative rather than a timestamp, because the question somebody is answering
 * is "is this the thing I was just working on?" and "17:42" does not answer it
 * without arithmetic.
 */
export function describeAge(savedAt: string, now: number): string {
  const ms = now - Date.parse(savedAt);
  if (!Number.isFinite(ms) || ms < 0) return 'a moment ago';

  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'a moment ago';
  if (minutes === 1) return '1 minute ago';
  if (minutes < 60) return `${minutes} minutes ago`;

  const hours = Math.floor(minutes / 60);
  if (hours === 1) return '1 hour ago';
  if (hours < 24) return `${hours} hours ago`;

  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}
