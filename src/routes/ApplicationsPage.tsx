import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Clock, Inbox } from 'lucide-react';
import { api, type ApplicationSummary } from '@/lib/api';
import { PageHeader } from '@/app/AppShell';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/EmptyState';
import { cn } from '@/lib/utils';

/**
 * The applications board.
 *
 * Oldest first, always. An applications inbox sorted newest-first quietly
 * buries the person who has been waiting longest, which is the exact failure
 * this product exists to notice — the same shape as a claim nobody opened.
 *
 * The second tab is the low-confidence one. It is not a spam folder and nothing
 * is deleted from it: those are real applications a human still reads, sorted
 * out of the way so a genuine applicant is not behind forty bot submissions.
 * The distinction matters because the cost of being wrong is a family's
 * membership.
 */
export function ApplicationsPage() {
  const [tab, setTab] = useState('open');

  const open = useQuery({
    queryKey: ['applications', 'open'],
    queryFn: () => api.applications.list(),
  });
  const flagged = useQuery({
    queryKey: ['applications', 'flagged'],
    queryFn: () => api.applications.list({ suspicious: true }),
  });

  return (
    <>
      <PageHeader
        title="Applications"
        description="People asking to join, oldest first — because the longest wait is the one that matters."
      />

      <div className="space-y-6 p-6">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="open">Waiting ({open.data?.items.length ?? 0})</TabsTrigger>
            <TabsTrigger value="flagged">
              Low confidence ({flagged.data?.items.length ?? 0})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="open">
            {open.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (open.data?.items.length ?? 0) === 0 ? (
              <EmptyState
                icon={Inbox}
                title="No applications waiting"
                body="When somebody applies through your public form, they appear here with how long they have been waiting."
                because="Accepting an application creates the household and everyone on it, so a roster never has to be retyped."
                action={{ label: 'Set up your form', to: '/settings' }}
              />
            ) : (
              <ul className="space-y-2">
                {open.data!.items.map((item) => (
                  <li key={item.id}><Row item={item} /></li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="flagged">
            <p className="mb-3 text-sm text-muted-foreground">
              These scored high on automated checks &mdash; a hidden field filled in, a submission
              faster than the form can be read, links in the free text. Nothing has been deleted and
              nothing has been decided. If one of these is a real family, it is still a real
              application.
            </p>
            {(flagged.data?.items.length ?? 0) === 0 ? (
              <EmptyState title="Nothing flagged" body="No submissions have tripped the automated checks." />
            ) : (
              <ul className="space-y-2">
                {flagged.data!.items.map((item) => (
                  <li key={item.id}><Row item={item} /></li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

function Row({ item }: { item: ApplicationSummary }) {
  const waitingDays = Math.floor(
    (Date.now() - Date.parse(item.submitted_at)) / 86_400_000,
  );
  const unopened = !item.first_opened_at;
  const stale = waitingDays >= 14;

  return (
    <Link to={`/applications/${item.id}`} className="block">
      <Card className={cn('transition hover:border-primary/50', stale && 'border-destructive/40')}>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium">
                {item.first_name} {item.last_name}
                {item.household.length > 0 && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    +{item.household.length} {item.household.length === 1 ? 'other' : 'others'}
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {item.email}
                {item.requested_start_date && ` · wants to start ${item.requested_start_date}`}
              </p>
            </div>
            <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className={cn(stale && 'font-medium text-destructive')}>
              {stale && <AlertTriangle className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />}
              Waiting {waitingDays} {waitingDays === 1 ? 'day' : 'days'}
            </span>

            {/* Same reason claims track this. An application nobody has opened
                is worse than a slow one: the applicant cannot tell "being
                considered" from "lost", and assumes the first until it is too
                late to assume anything. */}
            {unopened && (
              <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5">
                <Clock className="h-3 w-3" /> Nobody has opened this
              </span>
            )}

            {item.status !== 'submitted' && (
              <span className="rounded bg-muted px-2 py-0.5">{item.status.replace('_', ' ')}</span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
