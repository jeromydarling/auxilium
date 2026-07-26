import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { api, type DisclosureIssue } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

/**
 * Health disclosure, in the portal.
 *
 * The second half of joining, and the reason the public application asks
 * nothing medical. A member answers this signed in, about themselves.
 *
 * Three things shape the page:
 *
 * **The lookback window is in the question, not a footnote.** "Have you had any
 * of the following" means something different over two years and over three,
 * and the difference decides whether a need is shared. A member cannot answer
 * honestly without knowing which one they are being asked.
 *
 * **A yes always asks what.** A bare yes is not something a ministry can act on
 * and not something a member can be held to — an answer that looks like a
 * disclosure and functions as nothing.
 *
 * **It says plainly that nothing here decides anything.** Members under-report
 * on medical forms when they believe an answer will disqualify them, and
 * under-reporting is precisely what produces a decline years later. Saying that
 * a person reads every answer is not reassurance; it is how you get accurate
 * answers.
 */
export function PortalHealthPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['member', 'health'],
    queryFn: () => api.member.healthDisclosure(),
  });

  const [answers, setAnswers] = useState<Record<string, { answer: boolean; detail?: string }>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data?.disclosure) setAnswers(data.disclosure.answers);
  }, [data?.disclosure]);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!data) return null;

  const { form, disclosure } = data;
  const submitted = Boolean(disclosure?.completed_at);

  async function save(submit: boolean) {
    setBusy(true);
    setErrors({});
    try {
      await api.member.saveHealthDisclosure({ answers, submit });
      queryClient.invalidateQueries({ queryKey: ['member', 'health'] });
      setStatus(submit ? 'Sent. Thank you — that is the last of it.' : 'Saved. You can come back to this.');
      setTimeout(() => setStatus(null), 5000);
    } catch (err) {
      const issues = (err as { payload?: { issues?: DisclosureIssue[] } })?.payload?.issues;
      if (issues?.length) {
        setErrors(Object.fromEntries(issues.map((i) => [i.path, i.message])));
        document.getElementById(`q-${issues[0].path}`)?.scrollIntoView({ block: 'center' });
      } else {
        setErrors({ _form: err instanceof Error ? err.message : 'That did not save.' });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">About your health</h1>
        <p className="mt-1 text-muted-foreground">
          Asked once, about you, and read by a person.
        </p>
      </div>

      {submitted && (
        <Card className="border-primary/40">
          <CardContent className="pt-6">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Check className="h-4 w-4 text-primary" /> You have already sent this
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              If something has changed, or you remembered something afterwards, you can update it
              below. Your original answers are kept alongside the correction &mdash; nothing is
              erased, and remembering something later is not held against you.
            </p>
          </CardContent>
        </Card>
      )}

      {form.intro && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm">{form.intro}</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {form.questions.map((q) => {
          const given = answers[q.key];
          return (
            <Card key={q.key} id={`q-${q.key}`}>
              <CardContent className="space-y-3 pt-6">
                <div>
                  <p className="font-medium">{q.prompt}</p>
                  {/* The window, in the question. */}
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Thinking about {form.lookbackLabel}.
                    {form.extended.length > 0 &&
                      ` For ${form.extended.map((e) => `${e.label.toLowerCase()} (${e.months / 12} years)`).join(', ')}, please go back further.`}
                  </p>
                  {q.help && <p className="mt-1 text-sm text-muted-foreground">{q.help}</p>}
                </div>

                <div className="flex gap-2">
                  {[
                    { label: 'No', value: false },
                    { label: 'Yes', value: true },
                  ].map((option) => (
                    <Button
                      key={option.label}
                      type="button"
                      size="sm"
                      variant={given?.answer === option.value ? 'default' : 'outline'}
                      aria-pressed={given?.answer === option.value}
                      onClick={() =>
                        setAnswers({ ...answers, [q.key]: { ...given, answer: option.value } })
                      }
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>

                {/* Only on yes. Asking everyone to explain a no would turn this
                    into an interrogation, and the honest answer to most of
                    these is no. */}
                {given?.answer === true && (
                  <div className="space-y-1.5">
                    <label htmlFor={`d-${q.key}`} className="text-sm font-medium">
                      What, roughly, and when?
                    </label>
                    <textarea
                      id={`d-${q.key}`}
                      rows={3}
                      value={given.detail ?? ''}
                      onChange={(e) =>
                        setAnswers({ ...answers, [q.key]: { ...given, detail: e.target.value } })
                      }
                      placeholder="A sentence is plenty. Dates help more than medical terms."
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                )}

                {errors[q.key] && <p className="text-sm text-destructive">{errors[q.key]}</p>}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Said out loud, and not as a caveat at the bottom of a wall of text.
          People under-report when they think an answer disqualifies them, and
          under-reporting is exactly what produces a decline years later. */}
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            Nothing here decides anything on its own. These answers are read by a person, and being
            straightforward now is what prevents a disagreement later &mdash; a condition nobody
            knew about is the single most common reason a need is declined years after somebody
            joined.
          </p>
        </CardContent>
      </Card>

      {errors._form && <p className="text-sm text-destructive">{errors._form}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => save(true)} disabled={busy}>
          {submitted ? 'Send the correction' : 'Send this'}
        </Button>
        <Button variant="outline" onClick={() => save(false)} disabled={busy}>
          Save and finish later
        </Button>
        {status && <span className="text-sm text-muted-foreground">{status}</span>}
      </div>
    </div>
  );
}
