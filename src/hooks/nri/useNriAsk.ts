import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, type KnowledgeAnswer } from '@/lib/api';

/**
 * Asking NRI a question.
 *
 * The seventh hook, and the one that closes the loop the other six open. The
 * compass tells you *that* something needs attention; this answers *what to do
 * about it* — and, for a member, *what is happening to me*.
 *
 * Three deliberate choices:
 *
 *   • **Nothing is asked until a person asks it.** No prefetch on open, no
 *     speculative query as you type. A knowledge lookup fired on every
 *     keystroke would put a row in `kb_questions` for every half-formed
 *     thought, and the gap report — which is the whole reason questions are
 *     recorded — would fill with noise and stop being read.
 *   • **The answer is kept until it is replaced.** Someone reading an answer
 *     about their declined claim should not have it vanish because a
 *     background refetch decided it was stale. This is a document, not a
 *     dashboard.
 *   • **"Unhelpful" is volunteered, never inferred.** Asking again is not
 *     evidence the answer was wrong.
 */
export function useNriAsk(memberId?: string) {
  const [answer, setAnswer] = useState<KnowledgeAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ask = useMutation({
    mutationFn: (question: string) => api.knowledge.ask(question, memberId),
    onSuccess: (result) => {
      setAnswer(result);
      setError(null);
    },
    onError: (e: Error) => {
      // The question is worth keeping on screen when the request fails — the
      // person asked something real and retyping it is a small insult.
      setError(e.message || 'That question could not be answered right now.');
    },
  });

  const markUnhelpful = useMutation({
    mutationFn: () =>
      api.knowledge.unhelpful(answer?.question ?? '', answer?.articles[0]?.slug),
  });

  return {
    answer,
    error,
    isAsking: ask.isPending,
    ask: (question: string) => ask.mutate(question),
    clear: () => {
      setAnswer(null);
      setError(null);
    },
    markUnhelpful: () => markUnhelpful.mutate(),
    unhelpfulRecorded: markUnhelpful.isSuccess,
  };
}

/**
 * The starting questions, and the browsable index behind them.
 *
 * Suggested questions differ by audience because the anxious questions differ.
 * Staff want to know how to do something correctly; members want to know what
 * is happening to them and whether they have any say in it. The server decides
 * which set to send from the session, so a member can never be shown the staff
 * operations vocabulary.
 */
export function useNriKnowledgeIndex(enabled = true) {
  const { data, isLoading } = useQuery({
    queryKey: ['knowledge', 'index'],
    queryFn: () => api.knowledge.index(),
    enabled,
    staleTime: 1000 * 60 * 30,
  });

  return {
    categories: data?.categories ?? [],
    suggested: data?.suggested ?? [],
    audience: data?.audience,
    isLoading,
  };
}
