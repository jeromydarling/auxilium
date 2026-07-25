import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/app/AppShell';
import { CompassChips } from '@/features/nri/DirectionChip';
import { api } from '@/lib/api';
import { formatCents } from '@/lib/money';
import { relativeDays } from '@/lib/utils';

export function HouseholdDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading } = useQuery({
    queryKey: ['households', id],
    enabled: Boolean(id),
    queryFn: () => api.households.get(id!),
  });

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading household…</div>;
  }
  if (!data) {
    return <div className="p-6 text-sm text-muted-foreground">That household was not found.</div>;
  }

  const { household, members, needs } = data;
  const caregivers = members.filter((m) => m.is_caregiver === 1).length;

  return (
    <>
      <PageHeader
        title={household.name}
        description={`${household.member_count} people · ${household.dependent_count} dependents`}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/households"><ArrowLeft /> All households</Link>
          </Button>
        }
      />

      <div className="grid gap-6 p-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section>
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              People
            </h2>
            <div className="divide-y rounded-lg border bg-card">
              {members.map((member) => (
                <div key={member.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Link to={`/members/${member.id}`} className="min-w-0 flex-1 hover:underline">
                    <span className="font-medium">
                      {member.first_name} {member.last_name}
                    </span>
                  </Link>
                  <Badge variant="muted" className="capitalize">
                    {member.relationship}
                  </Badge>
                  {member.is_caregiver === 1 && <Badge variant="outline">Caregiver</Badge>}
                  <CompassChips compass={member.compass} />
                </div>
              ))}
            </div>
          </section>

          {needs.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Sharing cases
              </h2>
              <div className="divide-y rounded-lg border bg-card">
                {needs.map((need) => (
                  <div key={need.id} className="flex items-start justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <p className="font-medium">{need.title}</p>
                      <p className="text-xs capitalize text-muted-foreground">
                        {need.status.replace('_', ' ')} · opened {relativeDays(need.created_at)}
                      </p>
                    </div>
                    <p className="shrink-0 font-medium tabular">
                      {formatCents(need.amount_requested_cents)}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Household</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <Row label="People" value={String(household.member_count)} />
              <Row label="Dependents" value={String(household.dependent_count)} />
              <Row label="Caregivers" value={String(caregivers)} />
              <Row
                label="Monthly share"
                value={
                  household.share_amount_cents > 0 ? formatCents(household.share_amount_cents) : '—'
                }
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Address</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {household.address_line1 ? (
                <>
                  <p>{household.address_line1 as string}</p>
                  <p>
                    {[household.city, household.state, household.postal_code]
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                </>
              ) : (
                <p>No address on file.</p>
              )}
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
      <span className="tabular">{value}</span>
    </div>
  );
}
