import { useEffect, useRef } from 'react';
import { useNriSessionEngine } from './useNriSessionEngine';
import { useNriUserState } from './useNriUserState';

/**
 * useNriAutoOpen — lets the compass open itself, rarely.
 *
 * WHAT:  Opens the drawer once per calendar day, and only when something is
 *        genuinely urgent and not already dismissed.
 * WHERE: The compass launcher in the app shell.
 * WHY:   Software that pops open for routine work gets closed reflexively —
 *        and is then closed reflexively on the morning a member is in an ICU.
 *        Spending the interruption budget carefully is what makes it work at
 *        all.
 *
 * Four gates, all of which must pass:
 *   1. Something urgent exists (an action nudge at 0.9+ confidence).
 *   2. It has not already fired today (persisted in D1, cross-device).
 *   3. The user has not already dismissed every live nudge.
 *   4. The drawer is not already open, and this is the first fire this mount.
 */
export function useNriAutoOpen(isOpen: boolean, setOpen: (open: boolean) => void): void {
  const { nudges, shouldSurface, isLoading } = useNriSessionEngine();
  const { canAutoOpen, dismissedIds, recordAutoOpen, isLoading: stateLoading } = useNriUserState();
  const hasFired = useRef(false);

  useEffect(() => {
    if (isOpen || isLoading || stateLoading || hasFired.current) return;
    if (!shouldSurface || !canAutoOpen) return;
    if (nudges.length === 0) return;
    if (nudges.every((n) => dismissedIds.has(n.id))) return;

    // Let the page paint first — an overlay that appears mid-render reads as a
    // glitch rather than an intention.
    const timer = setTimeout(() => {
      hasFired.current = true;
      recordAutoOpen();
      setOpen(true);
    }, 700);

    return () => clearTimeout(timer);
  }, [
    isOpen, isLoading, stateLoading, shouldSurface, canAutoOpen,
    nudges, dismissedIds, recordAutoOpen, setOpen,
  ]);
}

/**
 * useNriGlow — a quiet pulse on the launcher when urgent work lands.
 *
 * The gentler sibling of auto-open: it says "there is something here" without
 * taking the screen. Self-extinguishes, and never competes with an open
 * drawer.
 */
export function useNriGlow(drawerOpen: boolean): boolean {
  const { urgentCount } = useNriSessionEngine();
  const previousCount = useRef<number | null>(null);
  const glowUntil = useRef(0);

  useEffect(() => {
    // First load is not "new" — a glow on every page open is just decoration.
    if (previousCount.current === null) {
      previousCount.current = urgentCount;
      return;
    }
    if (urgentCount > previousCount.current) {
      glowUntil.current = Date.now() + 30_000;
    }
    previousCount.current = urgentCount;
  }, [urgentCount]);

  if (drawerOpen) return false;
  return Date.now() < glowUntil.current;
}
