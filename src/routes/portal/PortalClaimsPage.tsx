import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Clock } from 'lucide-react';
import { api, type MemberClaim } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * Your bills.
 *
 * The design question here is what a worried person needs to see in the first
 * two seconds, and the answer is not the amount. It is whether anything is
 * moving. The most common experience in this category is not being told no —
 * it is not being told anything, which from the outside is indistinguishable
 * from being forgotten.
 *
 * So each row leads with the state and the clock, and the ministry's own
 * commitment is shown as a date rather than a vibe. `member_message` comes
 * straight from the SLA engine so the wording a member reads is derived from
 * the same computation the staff escalation board runs on. There is no separate
 * member-facing story that can drift from the operational one.
 */
export function PortalClaimsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['member', 'claims'],
    queryFn: () => api.member.claims(),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading your bills…</p>;

  const claims = data?.claims ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Your bills</h1>
        <p className="mt-1 text-muted-foreground">
          Everything you have submitted, and where each one currently stands.
        </p>
      </div>

      {claims.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm">
              You have nothing submitted right now. When a bill is submitted for sharing it will
              appear here with its due date, and you will be able to see every stage it moves
              through.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {claims.map((item) => (
            <li key={item.claim.id}>
              <ClaimRow item={item} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ClaimRow({ item }: { item: MemberClaim }) {
  const { claim, sla } = item;
  const late = sla.status === 'breached' || sla.status === 'severely_breached';

  return (
    <Link to={`/portal/claims/${claim.id}`} className="block">
      <Card className={cn('transition hover:border-primary/50', late && 'border-destructive/40')}>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium">{claim.title}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {formatMoney(claim.amount_requested_cents)}
                {claim.submitted_at && ` · submitted ${formatDate(claim.submitted_at)}`}
              </p>
            </div>
            <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
          </div>

          {/* The sentence the SLA engine produced, verbatim. */}
          <p className={cn('mt-3 text-sm', late && 'font-medium text-destructive')}>
            {late && <AlertTriangle className="mr-1 inline h-4 w-4 align-[-2px]" />}
            {sla.member_message}
          </p>

          {/* A claim nobody has opened is worse than a slow one: the member
              cannot tell "being worked" from "lost", and assumes the former. */}
          {!sla.acknowledged && sla.status !== 'closed' && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded bg-muted px-2 py-1 text-xs">
              <Clock className="h-3.5 w-3.5" />
              Nobody has opened this yet
              {sla.days_unacknowledged > 0 && ` — ${sla.days_unacknowledged} days`}
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
