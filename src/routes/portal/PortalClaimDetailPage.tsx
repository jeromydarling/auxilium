import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Check, CircleDashed, CircleDot, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * One bill, and every stage it has moved through.
 *
 * Package-tracking UX, on purpose. The thing a member cannot get anywhere else
 * is the sequence with dates on it — not "we're working on it", but which
 * stages happened, when, and what the next one is.
 *
 * If it was declined, the decline is shown with the guideline provision behind
 * it, and the absence of one is shown just as plainly. A decline with no
 * provision cited is the single most reviewable thing that can happen to a
 * member, and hiding that from them would be indefensible in a product that
 * scores the ministry on exactly the same fact.
 */
export function PortalClaimDetailPage() {
  const { id = '' } = useParams();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['member', 'claim', id],
    queryFn: () => api.member.claim(id),
    enabled: id.length > 0,
    retry: false,
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  if (isError || !data) {
    return (
      <div className="space-y-4">
        <p className="text-sm">That bill was not found on your account.</p>
        <Link to="/portal" className="text-sm text-primary hover:underline">Back to your bills</Link>
      </div>
    );
  }

  const { claim, sla, steps } = data;
  const declined = claim.status === 'declined';

  return (
    <div className="space-y-6">
      <Link
        to="/portal"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Your bills
      </Link>

      <div>
        <h1 className="text-2xl font-semibold">{claim.title}</h1>
        <p className="mt-1 text-muted-foreground">
          {formatMoney(claim.amount_requested_cents)}
          {claim.submitted_at && ` · submitted ${formatDate(claim.submitted_at)}`}
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <p className="text-sm">{sla.member_message}</p>
          {sla.due_at && sla.status !== 'closed' && (
            <p className="mt-1 text-sm text-muted-foreground">
              Your ministry&rsquo;s commitment for this bill is {formatDate(sla.due_at)}.
            </p>
          )}
        </CardContent>
      </Card>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Where it has been
        </h2>
        <ol className="mt-3 space-y-3">
          {steps.map((step) => (
            <li key={step.key} className="flex items-start gap-3">
              <StepIcon state={step.state} />
              <div className="min-w-0">
                <p
                  className={cn(
                    'text-sm',
                    step.state === 'upcoming' && 'text-muted-foreground',
                    step.state === 'current' && 'font-medium',
                    step.state === 'failed' && 'font-medium text-destructive',
                  )}
                >
                  {step.label}
                </p>
                {step.at && (
                  <p className="text-xs text-muted-foreground">{formatDate(step.at)}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {declined && (
        <Card className="border-destructive/40">
          <CardContent className="space-y-3 pt-6">
            <h2 className="font-semibold">This need was declined</h2>

            {claim.denial_reason_code && (
              <p className="text-sm">
                Reason given:{' '}
                <span className="font-medium">{humanize(claim.denial_reason_code)}</span>
              </p>
            )}

            {claim.denial_guideline_ref ? (
              <p className="text-sm">
                Guideline cited: <span className="font-medium">{claim.denial_guideline_ref}</span>.
                Ask for the text of that provision, and the version of the guidelines it comes from.
              </p>
            ) : (
              // Shown to the member, not just scored against the ministry.
              <p className="text-sm font-medium">
                No guideline provision was recorded for this decline. That is worth asking about in
                writing: a decision you cannot trace to a published rule is the most reviewable kind
                there is.
              </p>
            )}

            {claim.denial_note && (
              <p className="text-sm text-muted-foreground">{claim.denial_note}</p>
            )}

            {/* The most useful thing anyone can tell a declined member. */}
            <div className="rounded-lg border border-dashed p-3">
              <p className="text-sm">
                Appealing is worth the afternoon it costs. In the one state that requires ministries
                to report these numbers, roughly half of appealed declines were later approved
                &mdash; and fewer than one percent of declines were ever appealed.
              </p>
              <Link
                to="/portal/rights"
                className="mt-2 inline-block text-sm font-medium text-primary hover:underline"
              >
                What you can do next &rarr;
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StepIcon({ state }: { state: 'done' | 'current' | 'upcoming' | 'failed' }) {
  const className = 'mt-0.5 h-4 w-4 shrink-0';
  if (state === 'done') return <Check className={cn(className, 'text-primary')} />;
  if (state === 'current') return <CircleDot className={cn(className, 'text-primary')} />;
  if (state === 'failed') return <X className={cn(className, 'text-destructive')} />;
  return <CircleDashed className={cn(className, 'text-muted-foreground')} />;
}

/** Reason codes are written for the database. Members should not have to read them. */
function humanize(code: string): string {
  return code.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
