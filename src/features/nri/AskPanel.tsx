import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ExternalLink, MessageCircleQuestion, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useNriAsk, useNriKnowledgeIndex } from '@/hooks/nri/useNriAsk';
import { useKnowledgeBasePath } from '@/hooks/useKnowledgeBase';

/**
 * Ask NRI.
 *
 * The rendering order here is the argument. An answer is drawn in this order:
 *
 *   1. what is true of *your* account
 *   2. the direct answer
 *   3. what to do
 *   4. what this answer cannot tell you
 *   5. where it came from
 *
 * Account facts lead because a member asking "where is my claim" is asking
 * about *their* claim, and a paragraph about the process in general is a
 * non-answer dressed as one. Limits sit above sources rather than under them
 * because a caveat below a citation reads as boilerplate, and this particular
 * caveat — that nothing here is a decision about whether a need will be shared
 * — is the sentence that stops someone acting on false reassurance.
 *
 * Sources are shown, always, with real links. An answer about what the law
 * requires that a person cannot check is exactly the kind of thing someone
 * relies on and should not.
 */
export function AskPanel({ memberId, onNavigate }: { memberId?: string; onNavigate?: () => void }) {
  const [draft, setDraft] = useState('');
  const { answer, error, isAsking, ask, clear, markUnhelpful, unhelpfulRecorded } = useNriAsk(memberId);
  const { suggested } = useNriKnowledgeIndex();
  const base = useKnowledgeBasePath();

  function submit(question: string) {
    const q = question.trim();
    if (q.length < 3) return;
    setDraft(q);
    ask(q);
  }

  return (
    <div>
      <h3 className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <MessageCircleQuestion className="h-4 w-4" /> Ask
      </h3>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit(draft);
        }}
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask a question…"
            aria-label="Ask a question"
            maxLength={500}
            className="w-full rounded-md border bg-background py-2 pl-8 pr-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <Button type="submit" size="sm" disabled={isAsking || draft.trim().length < 3}>
          {isAsking ? 'Asking…' : 'Ask'}
        </Button>
      </form>

      {!answer && !isAsking && suggested.length > 0 && (
        <ul className="mt-3 space-y-1">
          {suggested.slice(0, 4).map((q) => (
            <li key={q}>
              <button
                type="button"
                onClick={() => submit(q)}
                className="text-left text-sm text-primary hover:underline"
              >
                {q}
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {answer && (
        <div className="mt-4 space-y-3">
          {/* Your own record first. A general paragraph in response to "where is
              my claim" is a non-answer wearing the costume of one. */}
          {answer.aboutYourAccount.length > 0 && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-primary">
                On your account
              </h4>
              <ul className="mt-1.5 space-y-1 text-sm">
                {answer.aboutYourAccount.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}

          {answer.confidence === 'none' ? (
            <p className="text-sm">
              We do not have a good answer to that one. Nothing here matched closely enough, and
              guessing would be worse than saying so.
            </p>
          ) : (
            <p className="text-sm">{answer.lead}</p>
          )}

          {answer.steps.length > 0 && (
            <ol className="space-y-2">
              {answer.steps.map((step, i) => (
                <li key={step.title} className="rounded-lg border p-3">
                  <p className="text-sm font-medium">
                    {i + 1}. {step.title}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
                  {/* A step with no stated reason is the first one skipped. */}
                  {step.because && (
                    <p className="mt-1 text-xs italic text-muted-foreground">{step.because}</p>
                  )}
                </li>
              ))}
            </ol>
          )}

          {/* Above sources, not below: a caveat under a citation reads as
              boilerplate, and this one is load-bearing. */}
          {answer.limits.length > 0 && (
            <div className="rounded-lg border border-dashed p-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                What this does not tell you
              </h4>
              <ul className="mt-1.5 space-y-1 text-sm text-muted-foreground">
                {answer.limits.map((limit) => (
                  <li key={limit}>{limit}</li>
                ))}
              </ul>
            </div>
          )}

          {answer.articles.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Read more
              </h4>
              <ul className="mt-1.5 space-y-1">
                {answer.articles.slice(0, 3).map((a) => (
                  <li key={a.slug}>
                    <Link
                      to={`${base}/${a.slug}`}
                      onClick={onNavigate}
                      className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      {a.title} <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {answer.sources.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Sources
              </h4>
              <ul className="mt-1.5 space-y-1">
                {answer.sources.map((s) => (
                  <li key={s.url}>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-start gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
                    >
                      {s.label} <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Separator />

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                clear();
                setDraft('');
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Ask something else
            </button>
            {/* Volunteered, never inferred. "They asked again" is not evidence
                the answer was wrong, and treating it as such would fill the gap
                report with noise. */}
            <button
              type="button"
              onClick={markUnhelpful}
              disabled={unhelpfulRecorded}
              className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-60"
            >
              {unhelpfulRecorded ? 'Thank you — noted.' : 'This did not help'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
