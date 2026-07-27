import { Link } from 'react-router-dom';
import { ArrowRight, Users, Home, HeartHandshake, HandHeart } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/app/AppShell';
import { SetupChecklist } from '@/features/onboarding/SetupChecklist';
import { AlertBanner } from '@/features/alerts/AlertBanner';
import { useNriSummary, useNriTriage } from '@/hooks/nri/useNriSignals';
import { useNriSessionEngine } from '@/hooks/nri/useNriSessionEngine';
import { CompassChips } from '@/features/nri/DirectionChip';
import { DIRECTION_META } from '@/lib/nri/directions';
import { relativeDays } from '@/lib/utils';
import { formatCentsCompact } from '@/lib/money';
import { useAuth } from '@/app/AuthContext';

/**
 * The dashboard.
 *
 * Ordered by urgency, not by data model: what needs doing today, then where
 * the pressure sits across the four directions, then the people at the top of
 * the queue, then the flat counts. Someone who reads only the first screenful
 * should still have learned the most important thing.
 */
export function DashboardPage() {
  const { org } = useAuth();
  const { summary, isLoading } = useNriSummary();
  const { nudges } = useNriSessionEngine();
  const { items: triage } = useNriTriage({ minScore: 50, limit: 6 });

  return (
    <>
      <PageHeader
        title={org?.name ? `${org.name}` : 'Dashboard'}
        description="Where the ministry's attention is needed today."
      />

      <div className="space-y-6 p-6">
        {/* Above everything. A ministry whose product is misbehaving because
            setup is incomplete should learn that before it reads the numbers
            those gaps are distorting. */}
        {/* Above the checklist: a checklist is about what a ministry has not
            got round to, an alert is about something that is broken. The other
            order puts "add your team" above "your invoice failed". */}
        <AlertBanner />
        <SetupChecklist />
        {nudges.length > 0 && (
          <section>
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Today
            </h2>
            <div className="grid gap-2 md:grid-cols-2">
              {nudges.slice(0, 4).map((nudge) => (
                <div key={nudge.id} className="flex items-start gap-3 rounded-lg border bg-card p-3">
                  <span
                    className={`mt-0.5 inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-xs font-medium chip-${nudge.direction}`}
                  >
                    {DIRECTION_META[nudge.direction].label}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm">{nudge.message}</p>
                    {nudge.action && (
                      <Link
                        to={nudge.action.route}
                        className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                      >
                        {nudge.action.label} <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            The compass
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(summary?.directions ?? []).map((row) => (
              <Link
                key={row.direction}
                to={`/nri?direction=${row.direction}`}
                className="group rounded-lg border bg-card p-4 transition-colors hover:border-primary/50"
              >
                <div className="flex items-baseline justify-between">
                  <span
                    className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium chip-${row.direction}`}
                  >
                    {row.label}
                  </span>
                  <span className="text-2xl font-semibold tabular">{row.urgent}</span>
                </div>
                <p className="mt-2 text-xs leading-snug text-muted-foreground">{row.description}</p>
                <p className="mt-2 text-xs text-muted-foreground tabular">
                  {row.urgent} urgent · {row.attend} to attend · {row.watch} watching
                </p>
              </Link>
            ))}
          </div>
          {isLoading && <p className="mt-2 text-sm text-muted-foreground">Reading signals…</p>}
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Highest priority right now
            </h2>
            <Link to="/nri" className="text-sm font-medium text-primary hover:underline">
              Open command center
            </Link>
          </div>

          {triage.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              {/* "Good day to do the slow work" is a reassuring thing to read and
                  a false one when the board is empty because nobody has been
                  imported. An empty roster and a calm one look identical here,
                  and only one of them is good news. */}
              {(summary?.members ?? 0) === 0
                ? 'Nothing to rank yet — no members have been imported, so there is nobody to score.'
                : 'Nobody is above the “needs attention” line. Good day to do the slow work.'}
            </div>
          ) : (
            <div className="divide-y rounded-lg border bg-card">
              {triage.map(({ member, compass, reason_count, waiting_since }) => (
                <Link
                  key={member.id}
                  to={`/members/${member.id}`}
                  className="flex items-center gap-4 px-4 py-2.5 hover:bg-accent/50"
                >
                  <span className="w-8 shrink-0 text-right font-semibold tabular">{compass.peak}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {member.first_name} {member.last_name}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {member.household_name ?? 'No household'}
                    </span>
                    {/* Why this row is above the one below it. On a bad week
                        several members sit at 100, and without this the order
                        looks arbitrary — which is how a board stops being
                        trusted. Same discipline as showing a score's reasons. */}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {reason_count} {reason_count === 1 ? 'reason' : 'reasons'}
                      {waiting_since
                        ? ` · last contact ${relativeDays(waiting_since)}`
                        : ' · no contact recorded'}
                    </span>
                  </span>
                  <CompassChips compass={compass} />
                </Link>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            The ministry
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={Users} label="Members" value={summary?.members ?? 0} to="/members" />
            <StatCard icon={Home} label="Households" value={summary?.households ?? 0} to="/households" />
            <StatCard
              icon={HeartHandshake}
              label="Open cases"
              value={summary?.open_needs ?? 0}
              detail={
                summary?.open_need_amount_cents
                  ? `${formatCentsCompact(summary.open_need_amount_cents)} requested`
                  : undefined
              }
              to="/needs"
            />
            <StatCard
              icon={HandHeart}
              label="Open prayer requests"
              value={summary?.open_prayer_requests ?? 0}
              to="/prayer"
            />
          </div>
        </section>
      </div>
    </>
  );
}

function StatCard({
  icon: Icon, label, value, detail, to,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  detail?: string;
  to: string;
}) {
  return (
    <Card className="transition-colors hover:border-primary/50">
      <Link to={to}>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-1.5">
            <Icon className="h-3.5 w-3.5" /> {label}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold tabular">{value.toLocaleString()}</p>
          {detail && <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>}
        </CardContent>
      </Link>
    </Card>
  );
}
