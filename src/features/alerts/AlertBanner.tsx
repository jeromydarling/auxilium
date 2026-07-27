import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Info } from 'lucide-react';
import { api, type MinistryAlert } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { relativeDays } from '@/lib/utils';

/**
 * Things that are wrong right now, at the top of the dashboard.
 *
 * Above the setup checklist, because a checklist is about what a ministry has
 * not got round to and this is about something that is broken. Ordering them the
 * other way round would put "add your team" above "your invoice failed".
 *
 * **Acknowledging is not resolving.** The button says "I have seen this" and
 * nothing more: the condition is still true, the system will keep saying so, and
 * the row only disappears when the underlying problem does. A single button that
 * did both is how a dashboard ends up green over a live fault — the same
 * distinction the NRI compass draws between dismissing a signal and the signal
 * no longer being true.
 *
 * Nothing here is dismissible-forever. An alert a ministry can permanently hide
 * is one they will hide on the day it matters.
 */
export function AlertBanner() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['alerts'],
    queryFn: () => api.alerts.list(),
    // These are conditions, not events — a minute of staleness costs nothing and
    // polling harder would put a query on every dashboard render.
    staleTime: 60_000,
  });

  const alerts = data?.items ?? [];
  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {alerts.map((alert) => (
        <Alert
          key={alert.id}
          alert={alert}
          onAck={async () => {
            await api.alerts.ack(alert.id);
            queryClient.invalidateQueries({ queryKey: ['alerts'] });
          }}
        />
      ))}
    </div>
  );
}

function Alert({ alert, onAck }: { alert: MinistryAlert; onAck: () => void }) {
  const critical = alert.severity === 'critical';
  const Icon = alert.severity === 'info' ? Info : AlertTriangle;

  return (
    <div
      className={`rounded-lg border p-4 ${
        critical
          ? 'border-destructive/40 bg-destructive/5'
          : 'border-amber-500/40 bg-amber-500/5'
      }`}
    >
      <div className="flex items-start gap-3">
        <Icon
          className={`mt-0.5 h-4 w-4 shrink-0 ${
            critical ? 'text-destructive' : 'text-amber-600'
          }`}
        />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{alert.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{alert.body}</p>

          <p className="mt-2 text-xs text-muted-foreground">
            First seen {relativeDays(alert.first_seen_at)}
            {/* The count is the useful part. "Seen once" and "seen for the
                fourteenth day running" are different problems, and only one of
                them is worth interrupting somebody's morning about. */}
            {alert.seen_count > 1 && ` · still true after ${alert.seen_count} checks`}
            {alert.acked_at && ' · acknowledged'}
          </p>
        </div>

        {!alert.acked_at && (
          <Button variant="ghost" size="sm" className="shrink-0" onClick={onAck}>
            <Check className="mr-1.5 h-4 w-4" /> I&rsquo;ve seen this
          </Button>
        )}
      </div>
    </div>
  );
}
