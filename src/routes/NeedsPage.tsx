import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/app/AppShell';
import { api } from '@/lib/api';
import { formatCents } from '@/lib/money';
import { relativeDays, daysBetween, cn } from '@/lib/utils';
import { HeartHandshake } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';

const URGENCY_VARIANT: Record<string, 'destructive' | 'default' | 'secondary' | 'muted'> = {
  critical: 'destructive',
  high: 'default',
  normal: 'secondary',
  low: 'muted',
};

/** A case that has not moved in this long is stalled — the same threshold the Onus rule uses. */
const STALL_DAYS = 14;

export function NeedsPage() {
  const [status, setStatus] = useState('open');
  const [assigned, setAssigned] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['needs', status, assigned],
    queryFn: () => api.needs.list({ status, assigned_to: assigned || undefined }),
  });

  const now = new Date().toISOString();

  return (
    <>
      <PageHeader
        title="Sharing needs"
        description="Cases where the community shares a medical cost."
      />

      <div className="p-6">
        <div className="mb-4 flex flex-wrap gap-2">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-48">
            <option value="open">Open cases</option>
            <option value="all">All cases</option>
            <option value="submitted">Submitted</option>
            <option value="in_review">In review</option>
            <option value="needs_info">Needs info</option>
            <option value="approved">Approved</option>
            <option value="sharing">Sharing</option>
            <option value="completed">Completed</option>
          </Select>
          <Select value={assigned} onChange={(e) => setAssigned(e.target.value)} className="w-48">
            <option value="">Anyone</option>
            <option value="unassigned">Unassigned only</option>
          </Select>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading cases…</p>
        ) : (data?.items.length ?? 0) === 0 ? (
          // "No cases match that filter" is a confusing thing to read when the
          // reason is that no case has ever been submitted. The two need
          // different answers, and only the second one is a setup problem.
          status === 'open' && !assigned ? (
            <EmptyState
              icon={HeartHandshake}
              title="No sharing needs yet"
              body="A need is a request for the community to share a medical cost. Every one that arrives gets a due date immediately, and shows here until it is decided."
              because="Once needs exist, the escalation board watches the ones that stop moving and the integrity report checks that every decline cites a published provision."
              action={{ label: 'Import your roster first', to: '/imports' }}
            />
          ) : (
            <EmptyState
              title="No cases match that filter"
              body="Try a different status, or clear the owner filter."
            />
          )
        ) : (
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Case</TableHead>
                  <TableHead>Member</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Urgency</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Last moved</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.items.map((need) => {
                  const sinceMove = daysBetween(
                    need.last_status_change_at ?? need.created_at,
                    now,
                  );
                  const stalled = sinceMove !== null && sinceMove >= STALL_DAYS;

                  return (
                    <TableRow key={need.id} className={cn(stalled && 'bg-onus/5')}>
                      <TableCell>
                        <span className="font-medium">{need.title}</span>
                        <span className="ml-2 text-xs capitalize text-muted-foreground">
                          {need.category.replace('_', ' ')}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Link to={`/members/${need.member_id}`} className="text-sm hover:underline">
                          {need.first_name} {need.last_name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right font-medium tabular">
                        {formatCents(need.amount_requested_cents)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize">
                          {need.status.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={URGENCY_VARIANT[need.urgency] ?? 'muted'} className="capitalize">
                          {need.urgency}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {need.assignee_name ?? (
                          <span className="text-destructive">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {stalled ? (
                          <span className="inline-flex items-center gap-1 text-onus">
                            <AlertCircle className="h-3.5 w-3.5" />
                            {sinceMove} days
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            {relativeDays(need.last_status_change_at ?? need.created_at)}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </>
  );
}
