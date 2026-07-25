import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Phone, Mail, Home, ArrowLeft, PhoneCall } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/app/AppShell';
import { SignalExplanation } from '@/features/nri/SignalExplanation';
import { BandBadge } from '@/features/nri/DirectionChip';
import { useNriSignals } from '@/hooks/nri/useNriSignals';
import { api } from '@/lib/api';
import { formatCents } from '@/lib/money';
import { relativeDays } from '@/lib/utils';

export function MemberDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['members', id],
    enabled: Boolean(id),
    queryFn: () => api.members.get(id!),
  });

  const { explanations, dismiss, restore } = useNriSignals(id);

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading member…</div>;
  }
  if (!data) {
    return <div className="p-6 text-sm text-muted-foreground">That member was not found.</div>;
  }

  const { member, household, needs, prayer_requests: prayers, compass } = data;

  const logContact = async (responded: boolean) => {
    await api.members.logContact(id!, { responded });
    queryClient.invalidateQueries({ queryKey: ['members', id] });
    queryClient.invalidateQueries({ queryKey: ['nri'] });
  };

  return (
    <>
      <PageHeader
        title={`${member.first_name} ${member.last_name}`}
        description={
          household
            ? `${household.name as string} · ${member.status}`
            : `No household · ${member.status}`
        }
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link to="/members">
                <ArrowLeft /> All members
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={() => logContact(false)}>
              <PhoneCall /> Log outreach
            </Button>
            <Button size="sm" onClick={() => logContact(true)}>
              They responded
            </Button>
          </>
        }
      />

      <div className="grid gap-6 p-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Tabs defaultValue="signals">
            <TabsList>
              <TabsTrigger value="signals">
                NRI signals{compass ? ` (${compass.peak})` : ''}
              </TabsTrigger>
              <TabsTrigger value="needs">Cases ({needs.length})</TabsTrigger>
              <TabsTrigger value="prayer">Prayer ({prayers.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="signals" className="space-y-3">
              {explanations.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No signals computed yet. They appear after the next scoring run.
                </p>
              ) : (
                explanations.map((explanation) => (
                  <SignalExplanation
                    key={explanation.direction}
                    explanation={explanation}
                    onDismiss={dismiss}
                    onRestore={restore}
                  />
                ))
              )}
            </TabsContent>

            <TabsContent value="needs">
              {needs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sharing cases on record.</p>
              ) : (
                <div className="divide-y rounded-lg border bg-card">
                  {needs.map((need) => (
                    <div key={need.id} className="flex items-start justify-between gap-4 p-4">
                      <div className="min-w-0">
                        <p className="font-medium">{need.title}</p>
                        <p className="text-xs text-muted-foreground">
                          <span className="capitalize">{need.category.replace('_', ' ')}</span>
                          {' · opened '}{relativeDays(need.created_at)}
                          {need.last_status_change_at &&
                            ` · last moved ${relativeDays(need.last_status_change_at)}`}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-medium tabular">
                          {formatCents(need.amount_requested_cents)}
                        </p>
                        <Badge variant="secondary" className="mt-1 capitalize">
                          {need.status.replace('_', ' ')}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="prayer">
              {prayers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No prayer requests on record.</p>
              ) : (
                <div className="divide-y rounded-lg border bg-card">
                  {prayers.map((request) => (
                    <div key={request.id} className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-medium">{request.title}</p>
                        {request.is_urgent === 1 && <Badge variant="destructive">Urgent</Badge>}
                      </div>
                      {request.body && (
                        <p className="mt-1 text-sm text-muted-foreground">{request.body}</p>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground">
                        <span className="capitalize">{request.category}</span>
                        {' · '}{relativeDays(request.created_at)}
                        {request.followup_due_at &&
                          ` · follow-up ${relativeDays(request.followup_due_at)}`}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-4">
          {compass && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Overall</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-3">
                  <span className="text-3xl font-semibold tabular">{compass.peak}</span>
                  <BandBadge band={compass.band} />
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {member.email ? (
                <p className="flex items-center gap-2">
                  <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <a href={`mailto:${member.email}`} className="truncate hover:underline">
                    {member.email}
                  </a>
                </p>
              ) : (
                <p className="text-muted-foreground">No email on file.</p>
              )}
              {member.phone ? (
                <p className="flex items-center gap-2">
                  <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <a href={`tel:${member.phone}`} className="hover:underline">{member.phone}</a>
                </p>
              ) : (
                <p className="text-muted-foreground">No phone on file.</p>
              )}
              {household && (
                <p className="flex items-center gap-2">
                  <Home className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <Link to={`/households/${household.id as string}`} className="hover:underline">
                    {household.name as string}
                  </Link>
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Engagement</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <Row label="Last contacted" value={relativeDays(member.last_contact_at as string)} />
              <Row label="Last responded" value={relativeDays(member.last_response_at as string)} />
              <Row label="Onboarding" value={member.onboarding_complete ? 'Complete' : 'Incomplete'} />
              <Row label="Joined" value={relativeDays(member.joined_at as string)} />
              <Row label="Source" value={String(member.source ?? 'manual')} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
