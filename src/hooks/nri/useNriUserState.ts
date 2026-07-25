import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

/**
 * useNriUserState — per-user, per-org NRI interface state.
 *
 * WHAT:  Which nudges are dismissed today, when the compass last auto-opened,
 *        and how far through the guide this user has gotten.
 * WHERE: useNriSessionEngine (dismissals), useNriAutoOpen (cooldown),
 *        useNriGuide (progress).
 * WHY:   This lives in D1, not localStorage, and that is a deliberate cost.
 *        Ministry staff move between a desk and a phone all day; a nudge
 *        dismissed on one device reappearing on the other is exactly the sort
 *        of small betrayal that teaches people to ignore the whole system.
 *
 * Dismissals are scoped to the calendar day. Yesterday's "I've seen this" was
 * about yesterday's work.
 */
export function useNriUserState() {
  const queryClient = useQueryClient();
  const key = ['nri', 'session'];

  const { data, isLoading } = useQuery({
    queryKey: key,
    staleTime: 60_000,
    queryFn: () => api.nri.session(),
  });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.nri.saveState(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  const state = data?.state;

  return {
    dismissedIds: new Set(state?.dismissed_nudge_ids ?? []),
    lastAutoOpenAt: state?.last_auto_open_at ?? null,
    canAutoOpen: state?.can_auto_open ?? false,
    guideSectionsSeen: new Set(state?.guide_sections_seen ?? []),
    guideCompletedAt: state?.guide_completed_at ?? null,
    isLoading,

    dismissNudge: (nudgeId: string) => save.mutate({ dismiss_nudge_id: nudgeId }),
    recordAutoOpen: () => save.mutate({ record_auto_open: true }),
    markGuideSection: (section: string) => save.mutate({ mark_guide_section: section }),
    completeGuide: () => save.mutate({ complete_guide: true }),
    recordPosture: (posture: string) => save.mutate({ posture }),
  };
}
