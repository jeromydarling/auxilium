import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, AlertTriangle, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/app/AppShell';
import { api, type EscalationItem, type AppealRecord } from '@/lib/api';
import { formatCents } from '@/lib/money';
import { relativeDays, cn } from '@/lib/utils';

/**
 * The escalation desk.
 *
 * Every claim past its commitment and every claim nobody has acknowledged, on
 * one screen, worst first. The failure this prevents is not slowness — it is
 * a claim going quiet with nobody noticing until the member calls a news
 * station.
 */
export function EscalationsPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['claims', 'escalations'],
    queryFn: () => api.claims.escalations(),
    refetchInterval: 5 * 60_000,
  });

  const { data: appeals } = useQuery({
    queryKey: ['claims', 'appeals'],
    queryFn: () => api.claims.appeals({ status: 'open' }),
  });

  const acknowledge = async (id: string) => {
    await api.claims.acknowledge(id);
    queryClient.invalidateQueries({ queryKey: ['claims'] });
    queryClient.invalidateQueries({ queryKey: ['nri'] });
  };

  const overdueAppeals = (appeals?.items ?? []).filter((a) => a.overdue === 1);

  return (
    <>
      <PageHeader
        title="Escalations"
        description={
          data
            ? `Claims past the ministry's ${data.sla_days}-day commitment, and claims nobody has answered.`
            : 'Claims needing attention right now.'
        }
      />

      <div className="p-6">
        {data && data.items.length > 0 && (
          <p className="mb-4 rounded border-l-2 border-destructive bg-destructive/5 px-4 py-3 text-sm">
            <strong className="tabular">{formatCents(data.total_at_stake_cents)}</strong>{' '}
            across {data.items.length} claim{data.items.length === 1 ? '' : 's'} needing attention
            today.
          </p>
        )}

        <Tabs defaultValue="claims">
          <TabsList>
            <TabsTrigger value="claims">Claims ({data?.items.length ?? 0})</TabsTrigger>
            <TabsTrigger value="appeals">
              Appeals ({appeals?.items.length ?? 0}
              {overdueAppeals.length > 0 ? `, ${overdueAppeals.length} overdue` : ''})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="claims">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Checking the clock…</p>
            ) : (data?.items.length ?? 0) === 0 ? (
              <div className="rounded-lg border border-dashed p-10 text-center">
                <p className="font-medium">Everything is within commitment.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  No claim is past its turnaround date, and every claim has been acknowledged.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {data!.items.map((item) => (
                  <EscalationRow key={item.claim.id} item={item} onAcknowledge={acknowledge} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="appeals">
            {(appeals?.items.length ?? 0) === 0 ? (
              <div className="rounded-lg border border-dashed p-10 text-center">
                <p className="font-medium">No open appeals.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {appeals!.items.map((appeal) => (
                  <AppealRow key={appeal.id} appeal={appeal} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

function EscalationRow({
  item, onAcknowledge,
}: {
  item: EscalationItem;
  onAcknowledge: (id: string) => void;
}) {
  const { claim, sla } = item;
  const severe = sla.status === 'severely_breached';

  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-4',
        severe ? 'border-destructive/50' : sla.status === 'breached' && 'border-onus/50',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/members/${claim.member_id}`} className="font-medium hover:underline">
              {claim.first_name} {claim.last_name}
            </Link>
            <Badge variant={severe ? 'destructive' : 'muted'} className="capitalize">
              {claim.status.replace('_', ' ')}
            </Badge>
            {!sla.acknowledged && (
              <Badge variant="destructive">
                <EyeOff className="mr-1 h-3 w-3" /> Never opened
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{claim.title}</p>
          <p className={cn('mt-1.5 text-sm', severe ? 'text-destructive' : 'text-onus')}>
            {sla.days_over > 0 ? (
              <>
                <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
                {sla.days_over} days past commitment
              </>
            ) : (
              <>
                <Clock className="mr-1 inline h-3.5 w-3.5" />
                No response in {sla.days_unacknowledged} days
              </>
            )}
            {claim.assignee_name ? ` · ${claim.assignee_name}` : ' · unassigned'}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="font-semibold tabular">{formatCents(claim.amount_requested_cents)}</p>
          <p className="text-xs text-muted-foreground">
            submitted {relativeDays(claim.submitted_at)}
          </p>
          {!sla.acknowledged && (
            <Button variant="outline" size="sm" className="mt-2" onClick={() => onAcknowledge(claim.id)}>
              I&rsquo;m on it
            </Button>
          )}
        </div>
      </div>

      {/* What the member sees. Keeping it visible to staff keeps the two honest. */}
      <p className="mt-3 rounded bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        The member sees: &ldquo;{sla.member_message}&rdquo;
      </p>
    </div>
  );
}

function AppealRow({ appeal }: { appeal: AppealRecord }) {
  return (
    <div className={cn('rounded-lg border bg-card p-4', appeal.overdue === 1 && 'border-destructive/50')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Link to={`/members/${appeal.member_id}`} className="font-medium hover:underline">
              {appeal.first_name} {appeal.last_name}
            </Link>
            <Badge variant={appeal.overdue === 1 ? 'destructive' : 'muted'} className="capitalize">
              {appeal.overdue === 1 ? 'Overdue' : appeal.status.replace('_', ' ')}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {appeal.claim_title}
            {appeal.denial_reason_code && ` · denied for ${appeal.denial_reason_code}`}
          </p>
          {/* The member's own words, verbatim. Paraphrasing this away is how
              ministries lose the thread of what actually happened. */}
          <blockquote className="mt-2 border-l-2 border-border pl-3 text-sm italic">
            {appeal.member_statement}
          </blockquote>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-semibold tabular">{formatCents(appeal.amount_requested_cents)}</p>
          <p className="text-xs text-muted-foreground">
            due {relativeDays(appeal.due_at)}
          </p>
        </div>
      </div>
    </div>
  );
}
