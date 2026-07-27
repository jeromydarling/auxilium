import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Compass, type Explanation, type Direction } from '@/lib/api';
import { useToast } from '@/components/ui/toast';

/**
 * useNriSignals — the directional signals for one subject.
 *
 * WHAT:  Loads a member's compass and its four explanations, and exposes
 *        dismiss/restore.
 * WHERE: Member detail, the NRI command center's expanded row.
 * WHY:   The explanation object comes from the API fully formed — this hook
 *        never computes a score, a band, or a recommendation. That is the only
 *        way the number on the dashboard and the number on the member page can
 *        be guaranteed to agree.
 */
export function useNriSignals(subjectId: string | undefined) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const key = ['nri', 'signals', subjectId];

  const { data, isLoading, error } = useQuery({
    queryKey: key,
    enabled: Boolean(subjectId),
    staleTime: 60_000,
    queryFn: () => api.nri.signals(subjectId!),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: key });
    // The triage board and the dashboard headline both read the same signals.
    queryClient.invalidateQueries({ queryKey: ['nri', 'triage'] });
    queryClient.invalidateQueries({ queryKey: ['nri', 'summary'] });
  };

  const dismiss = useMutation({
    mutationFn: (direction: Direction) => api.nri.dismiss(subjectId!, direction),
    onSuccess: (_result, direction) => {
      invalidate();
      // Dismissing a signal removes a member from the board somebody is
      // working down, and the row vanishes the moment it is clicked — so a
      // mis-click looks exactly like the thing having been handled. That is
      // the worst shape of mistake this product can produce: the whole
      // argument is that it notices people, and a silent accidental dismiss
      // is it un-noticing one.
      //
      // Cheap to offer, because `restore` already existed as a first-class
      // action: dismissal always meant "I have seen this", never "never show
      // me this member again".
      toast.undo(`Marked as handled.`, async () => {
        await api.nri.restore(subjectId!, direction);
        invalidate();
      });
    },
  });

  const restore = useMutation({
    mutationFn: (direction: Direction) => api.nri.restore(subjectId!, direction),
    onSuccess: invalidate,
  });

  const explanations: Explanation[] = data?.explanations ?? [];

  return {
    compass: (data?.compass ?? null) as Compass | null,
    explanations,
    /** Only the directions actually worth showing — the rest is noise. */
    live: explanations.filter((e) => !e.dismissed && e.score >= 25),
    dismissed: explanations.filter((e) => e.dismissed),
    source: data?.source,
    isLoading,
    error,
    dismiss: dismiss.mutate,
    restore: restore.mutate,
    isDismissing: dismiss.isPending,
  };
}

/** The org-wide triage queue. */
export function useNriTriage(params: { direction?: Direction; minScore?: number; limit?: number } = {}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['nri', 'triage', params.direction ?? 'all', params.minScore ?? 25, params.limit ?? 50],
    staleTime: 60_000,
    queryFn: () =>
      api.nri.triage({
        direction: params.direction,
        min_score: params.minScore,
        limit: params.limit,
      }),
  });

  return {
    items: data?.items ?? [],
    directions: data?.directions ?? {},
    isLoading,
    error,
  };
}

/** Dashboard headline counts. Cached server-side in KV; cheap to poll. */
export function useNriSummary() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['nri', 'summary'],
    staleTime: 120_000,
    queryFn: () => api.nri.summary(),
  });
  return { summary: data ?? null, isLoading, error };
}
