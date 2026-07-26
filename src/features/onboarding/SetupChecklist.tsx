import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Check, Circle } from 'lucide-react';
import { api, type OnboardingStep } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * Ministry setup, on the dashboard.
 *
 * It is a list, not a wizard, and it does not block anything. A ministry will
 * not have its guidelines ready the afternoon it signs up; software that gates
 * on setup gets abandoned at step three, while a list that says what is missing
 * and lets you work meanwhile gets finished over a fortnight.
 *
 * Each row leads with the consequence rather than the instruction. "Publish
 * your guidelines — recommended" is ignorable; "every decline you record will
 * be flagged as citing no published provision" is a reason. The whole product
 * argues that a system nobody can argue with does not get trusted, and a
 * checklist that cannot say why is the same failure in miniature.
 *
 * It removes itself when complete. Nobody should have to dismiss a finished
 * checklist.
 */
export function SetupChecklist() {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['admin', 'onboarding'],
    queryFn: () => api.admin.onboarding(),
    // Setup progress changes as a side effect of doing other things — importing
    // a roster, adding a guideline — so it is refetched on focus rather than
    // cached until reload. Otherwise the tick lags behind the work by a session.
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  const dismiss = useMutation({
    mutationFn: () => api.admin.dismissOnboarding(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'onboarding'] }),
  });

  if (!data?.visible) return null;

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Finish setting up</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {data.done} of {data.total} done.
              {data.blocking.length > 0 && (
                <>
                  {' '}
                  <span className="text-foreground">
                    {data.blocking.length}{' '}
                    {data.blocking.length === 1 ? 'gap is' : 'gaps are'} affecting how the product
                    behaves right now.
                  </span>
                </>
              )}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => dismiss.mutate()}
            disabled={dismiss.isPending}
          >
            Hide this
          </Button>
        </div>

        {/* Progress as a bar rather than a number alone: a ministry three steps
            in should be able to see it is three steps in without arithmetic. */}
        <div className="mt-3 h-1.5 overflow-hidden rounded bg-muted">
          <div
            className="h-full bg-primary transition-[width]"
            style={{ width: `${Math.round((data.done / data.total) * 100)}%` }}
          />
        </div>

        <ul className="mt-4 space-y-2">
          {data.steps.map((step) => (
            <li key={step.key}>
              <StepRow step={step} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function StepRow({ step }: { step: OnboardingStep }) {
  const done = step.status === 'done';
  const blocking = !done && step.weight === 'blocking';

  return (
    <div
      className={cn(
        'rounded-lg border p-3',
        done && 'opacity-60',
        blocking && 'border-destructive/40',
      )}
    >
      <div className="flex items-start gap-2.5">
        {done ? (
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        ) : blocking ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        ) : (
          <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        )}

        <div className="min-w-0 flex-1">
          <p className={cn('text-sm font-medium', done && 'line-through')}>{step.title}</p>

          {!done && (
            <>
              <p className="mt-0.5 text-sm text-muted-foreground">{step.body}</p>
              {/* The reason, not the nag. */}
              <p
                className={cn(
                  'mt-1 text-sm',
                  blocking ? 'text-destructive' : 'text-muted-foreground',
                )}
              >
                {step.consequence}
              </p>
              <Link
                to={step.route}
                className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                {step.actionLabel} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
