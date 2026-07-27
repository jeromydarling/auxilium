import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  assessDraft, draftKey, type DraftVerdict, type StoredDraft,
} from '@/lib/drafts';

/**
 * Keeping unsaved work, and warning before it is lost.
 *
 * Two halves of one promise: nothing you typed disappears without you being
 * told. The judgement about *when a recovered draft is safe to offer* lives in
 * `src/lib/drafts.ts` where it is pure and tested; this is the part that
 * touches `localStorage`, timers, and the browser's unload event.
 *
 * **Everything here fails soft.** `localStorage` throws in private-mode Safari,
 * when a quota is full, and when a browser is configured to block site data.
 * Every access is wrapped, because an editor that cannot open because its
 * safety net is unavailable has made things worse rather than better. With
 * storage broken the editor behaves exactly as it did before any of this
 * existed.
 */

/**
 * How long after the last keystroke a draft is written.
 *
 * Long enough not to write on every character; short enough that the gap
 * between "what I typed" and "what would survive a crash" is never more than a
 * sentence.
 */
const DEBOUNCE_MS = 800;

export interface DraftState<T> {
  /** Whether to show the recovery prompt, and whether to warn about a conflict. */
  verdict: DraftVerdict;
  /** Apply the recovered draft. Clears the prompt. */
  recover: () => T | null;
  /** Throw the stored draft away and keep what is on screen. */
  discard: () => void;
  /** Call after a successful save, so the prompt does not reappear. */
  clear: () => void;
}

export function useDraft<T>(options: {
  /** Which editor. Combined with `id` to namespace the entry. */
  scope: string;
  /** The record being edited. Empty disables storage entirely. */
  id: string | null | undefined;
  /** The live editor value. */
  value: T;
  /** The last-saved server value, for comparison. */
  serverValue: T;
  /** `updated_at` on the server record, for conflict detection. */
  serverUpdatedAt?: string | null;
  /** Only persist while there is something unsaved. */
  dirty: boolean;
}): DraftState<T> {
  const { scope, id, value, serverValue, serverUpdatedAt = null, dirty } = options;
  const key = id ? draftKey(scope, id) : null;

  // Read once per record, not on every render. Re-reading would fight the
  // in-progress edit, and re-assessing on each keystroke would make the prompt
  // flicker as somebody types their way back to the server's text.
  const [stored, setStored] = useState<StoredDraft<T> | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(false);
    setStored(key ? read<T>(key) : null);
  }, [key]);

  // Captured at mount so the verdict is stable. Using `Date.now()` inline would
  // re-evaluate the TTL on every render, and a draft could expire mid-session
  // while somebody was reading the prompt about it.
  const openedAt = useRef(Date.now());

  const verdict = useMemo<DraftVerdict>(() => {
    if (dismissed) return { offer: false, reason: 'none' };
    return assessDraft(stored, serverValue, serverUpdatedAt, openedAt.current);
  }, [dismissed, stored, serverValue, serverUpdatedAt]);

  // Persist, debounced.
  //
  // `baseUpdatedAt` is written from the server record the editing session
  // started against, which is what later distinguishes "my unsaved work" from
  // "my stale work on top of somebody else's edit".
  useEffect(() => {
    if (!key || !dirty) return;
    const timer = setTimeout(() => {
      write(key, { value, savedAt: new Date().toISOString(), baseUpdatedAt: serverUpdatedAt });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [key, dirty, value, serverUpdatedAt]);

  const clear = useCallback(() => {
    if (key) remove(key);
    setStored(null);
    setDismissed(true);
  }, [key]);

  const recover = useCallback(() => {
    const recovered = stored?.value ?? null;
    // Cleared on recovery rather than kept: once it is on screen it is the
    // live value, and it will be written again by the debounce if it stays
    // unsaved. Keeping it would re-offer the same draft on the next reload
    // even after the person accepted it.
    if (key) remove(key);
    setDismissed(true);
    return recovered;
  }, [key, stored]);

  return { verdict, recover, discard: clear, clear };
}

/**
 * The browser's own "leave site?" prompt, while there is unsaved work.
 *
 * Deliberately only `beforeunload` — closing the tab, reloading, following an
 * external link. In-app navigation is not blocked: the draft survives it, so a
 * modal there would be an interruption protecting against nothing. This covers
 * the case the draft cannot, which is somebody closing the browser and never
 * returning to that page.
 *
 * The message is the browser's; every engine has ignored a custom one for a
 * decade. Setting `returnValue` is what triggers it.
 */
export function useUnsavedWarning(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [active]);
}

// ── localStorage, defensively ────────────────────────────────────────────────

function read<T>(key: string): StoredDraft<T> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft<T>;
    // A stored shape from an older version of the editor is discarded rather
    // than half-applied. Restoring a draft missing the fields the form now
    // expects would render a broken editor and look like our bug.
    return parsed && typeof parsed === 'object' && 'value' in parsed && 'savedAt' in parsed
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function write<T>(key: string, draft: StoredDraft<T>): void {
  try {
    localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // Quota exceeded, private mode, or site data blocked. Nothing useful to
    // do and nothing worth interrupting somebody mid-sentence to say — the
    // editor still works, it simply has no net.
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // As above.
  }
}
