import { useQuery } from '@tanstack/react-query';
import { api, type Nudge } from '@/lib/api';
import { useNriUserState } from './useNriUserState';
import { shouldAutoOpen } from '@/lib/nri/nudges';

/**
 * useNriSessionEngine — today's nudges.
 *
 * WHAT:  The handful of sentences the ministry should read right now, with a
 *        place to go for each.
 * WHERE: The compass drawer, the dashboard banner.
 * WHY:   The compass tells you how a *member* is doing. A nudge tells you what
 *        *you* should do next. Both are needed; conflating them produces a
 *        dashboard that is either alarming or ignorable.
 *
 * The derivation itself is pure and lives in src/lib/nri/nudges.ts, computed
 * server-side against real counts. This hook is the delivery mechanism and the
 * dismissal layer — deliberately thin, so the rules stay unit-testable without
 * React.
 *
 * Restraint is the feature: at most five nudges, never one for something
 * already handled, and never a nudge that merely restates a number already on
 * screen. An assistant that interrupts for routine work gets closed
 * reflexively, and is then useless on the day it matters.
 */
export function useNriSessionEngine() {
  const { dismissedIds, dismissNudge, isLoading: stateLoading } = useNriUserState();

  const { data, isLoading } = useQuery({
    queryKey: ['nri', 'session'],
    staleTime: 60_000,
    // Ministry work is bursty; a five-minute refresh keeps the board honest
    // without turning the dashboard into a polling loop.
    refetchInterval: 5 * 60_000,
    queryFn: () => api.nri.session(),
  });

  // The server already filters dismissals, but filtering again here means an
  // optimistic dismiss disappears immediately rather than after a round trip.
  const nudges: Nudge[] = (data?.nudges ?? []).filter((n) => !dismissedIds.has(n.id));

  return {
    nudges,
    inputs: data?.inputs ?? {},
    /** True when something genuinely cannot wait — see useNriAutoOpen. */
    shouldSurface: shouldAutoOpen(nudges),
    urgentCount: nudges.filter((n) => n.kind === 'action' && n.confidence >= 0.9).length,
    dismiss: dismissNudge,
    isLoading: isLoading || stateLoading,
  };
}
