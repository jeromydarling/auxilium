import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, ShieldCheck, AlertTriangle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/app/AppShell';
import { api, type IntegrityBand, type PeriodLedger } from '@/lib/api';
import { formatCents, formatCentsCompact } from '@/lib/money';
import { cn } from '@/lib/utils';

/**
 * The integrity center.
 *
 * This screen exists to answer one question a board, a regulator, or a
 * journalist will eventually ask: of every dollar members gave you, how much
 * reached their medical bills? Aliera's answer was 16 cents. Medical Cost
 * Sharing's was 3.5. Neither could have shown this page.
 *
 * So the ratio is the largest thing on it, benchmarked against a standard the
 * ministry is not legally bound by — which is exactly what makes clearing it
 * mean something.
 */

const BAND_STYLE: Record<IntegrityBand, string> = {
  healthy: 'text-emerald-500 border-emerald-500/40 bg-emerald-500/10',
  watch: 'text-onus border-onus/40 bg-onus/10',
  concern: 'text-onus border-onus/50 bg-onus/15',
  critical: 'text-destructive border-destructive/50 bg-destructive/15',
};

const BAND_LABEL: Record<IntegrityBand, string> = {
  healthy: 'Healthy', watch: 'Watch', concern: 'Concern', critical: 'Critical',
};

const bps = (value: number) => `${(value / 100).toFixed(1)}%`;

export function IntegrityPage() {
  const queryClient = useQueryClient();
  const [recomputing, setRecomputing] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['integrity'],
    queryFn: () => api.integrity.report(),
  });

  const { data: denials } = useQuery({
    queryKey: ['integrity', 'denials'],
    queryFn: () => api.integrity.denials(),
  });

  const recompute = async () => {
    setRecomputing(true);
    try {
      await api.integrity.recompute();
      queryClient.invalidateQueries({ queryKey: ['integrity'] });
    } finally {
      setRecomputing(false);
    }
  };

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Reading the ledger…</div>;
  }
  if (!data) {
    return <div className="p-6 text-sm text-muted-foreground">No integrity data available.</div>;
  }

  const { report, ledger } = data;

  return (
    <>
      <PageHeader
        title="Claims integrity"
        description="Where the money went, and whether the ministry followed its own rules."
        actions={
          <Button variant="outline" size="sm" onClick={recompute} disabled={recomputing}>
            <RefreshCw className={cn(recomputing && 'animate-spin')} />
            Recompute
          </Button>
        }
      />

      <div className="space-y-6 p-6">
        {/* The headline. Ratio first, because it is the number that matters. */}
        <section className="grid gap-4 lg:grid-cols-3">
          <Card className={cn('lg:col-span-2', report.band === 'critical' && 'border-destructive/50')}>
            <CardHeader className="pb-2">
              <CardTitle>Share ratio — trailing three months</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-end gap-4">
                <span
                  className={cn(
                    'text-5xl font-semibold tabular',
                    report.benchmark.meets_aca_individual ? 'text-emerald-500' : 'text-destructive',
                  )}
                >
                  {bps(report.trailing_share_ratio_bps)}
                </span>
                <div className="pb-1.5 text-sm text-muted-foreground">
                  of member contributions reached medical costs
                </div>
              </div>

              <RatioBar
                value={report.trailing_share_ratio_bps}
                target={report.benchmark.ministry_target_bps}
                aca={report.benchmark.aca_individual_bps}
              />

              <div className="mt-4 flex flex-wrap gap-4 text-sm">
                <Benchmark
                  label="ACA individual floor"
                  value={bps(report.benchmark.aca_individual_bps)}
                  met={report.benchmark.meets_aca_individual}
                />
                <Benchmark
                  label="This ministry's commitment"
                  value={bps(report.benchmark.ministry_target_bps)}
                  met={report.benchmark.meets_ministry_target}
                />
              </div>

              <p className="mt-3 text-xs text-muted-foreground">
                Health care sharing ministries are exempt from the ACA medical loss ratio. Auxilium
                measures against it anyway — a ministry that clears a bar it is not held to has said
                something no marketing page can.
              </p>
            </CardContent>
          </Card>

          <Card className={cn(report.band === 'critical' && 'border-destructive/50')}>
            <CardHeader className="pb-2">
              <CardTitle>Integrity score</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-3">
                <span className="text-5xl font-semibold tabular">{report.score}</span>
                <span className="text-lg text-muted-foreground">/100</span>
              </div>
              <span
                className={cn(
                  'mt-2 inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-sm font-medium',
                  BAND_STYLE[report.band],
                )}
              >
                {report.band === 'healthy'
                  ? <ShieldCheck className="h-3.5 w-3.5" />
                  : <AlertTriangle className="h-3.5 w-3.5" />}
                {BAND_LABEL[report.band]}
              </span>
              <p className="mt-3 text-sm text-muted-foreground">{report.summary}</p>
            </CardContent>
          </Card>
        </section>

        {report.recommended_actions.length > 0 && (
          <section className="rounded-lg border-l-2 border-onus bg-onus/5 p-4">
            <h2 className="text-sm font-semibold">What to do about it</h2>
            <ul className="mt-2 space-y-1.5">
              {report.recommended_actions.map((action) => (
                <li key={action} className="flex gap-2 text-sm">
                  <span className="text-onus">→</span>
                  <span>{action}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <Tabs defaultValue="findings">
          <TabsList>
            <TabsTrigger value="findings">Findings ({report.reason_codes.length})</TabsTrigger>
            <TabsTrigger value="ledger">Ledger</TabsTrigger>
            <TabsTrigger value="denials">Denials to re-open ({denials?.findings.length ?? 0})</TabsTrigger>
          </TabsList>

          <TabsContent value="findings">
            {report.reason_codes.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center">
                <ShieldCheck className="mx-auto h-6 w-6 text-emerald-500" />
                <p className="mt-2 font-medium">Nothing flagged.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  The ledger and the claims record are both clean this period.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {report.reason_codes.map((reason) => (
                  <div key={reason.code} className="flex gap-4 rounded-lg border bg-card p-4">
                    <span className="w-12 shrink-0 text-right font-mono text-sm tabular text-destructive">
                      −{reason.weight}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium">{reason.label}</p>
                      {reason.detail && (
                        <p className="mt-0.5 text-sm text-muted-foreground">{reason.detail}</p>
                      )}
                      <p className="mt-1 font-mono text-xs text-muted-foreground">{reason.code}</p>
                    </div>
                  </div>
                ))}
                <p className="pt-1 text-xs text-muted-foreground">
                  These deductions sum to {report.reason_codes.reduce((s, r) => s + r.weight, 0)},
                  which is exactly what was subtracted from 100.
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="ledger">
            <LedgerTable ledger={ledger} />
          </TabsContent>

          <TabsContent value="denials">
            {(denials?.findings.length ?? 0) === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center">
                <p className="font-medium">Every denial cites its basis.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Nothing here needs re-opening.
                </p>
              </div>
            ) : (
              <>
                <p className="mb-3 text-sm text-muted-foreground">
                  {formatCents(denials!.total_at_stake_cents)} denied across these claims.
                </p>
                <div className="space-y-2">
                  {denials!.findings.map((finding) => (
                    <div
                      key={`${finding.need_id}-${finding.code}`}
                      className={cn(
                        'rounded-lg border bg-card p-4',
                        finding.severity === 'serious' && 'border-destructive/40',
                      )}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium">
                            {finding.need
                              ? `${finding.need.first_name} ${finding.need.last_name} — ${finding.need.title}`
                              : finding.need_id}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">{finding.message}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <Badge variant={finding.severity === 'serious' ? 'destructive' : 'muted'}>
                            {finding.severity}
                          </Badge>
                          <p className="mt-1 font-medium tabular">
                            {formatCents(finding.amount_requested_cents)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

/**
 * The ratio bar. Two markers — the ministry's own commitment and the ACA floor
 * — so the number is always read against something rather than in isolation.
 */
function RatioBar({ value, target, aca }: { value: number; target: number; aca: number }) {
  const pct = (bpsValue: number) => `${Math.min(100, (bpsValue / 10_000) * 100)}%`;

  return (
    <div className="relative mt-4 h-3 rounded-full bg-muted">
      <div
        className={cn(
          'h-full rounded-full transition-all',
          value >= aca ? 'bg-emerald-500' : value >= 5_000 ? 'bg-onus' : 'bg-destructive',
        )}
        style={{ width: pct(value) }}
      />
      <div
        className="absolute top-[-4px] h-5 w-0.5 bg-foreground/70"
        style={{ left: pct(aca) }}
        title={`ACA individual floor — ${(aca / 100).toFixed(0)}%`}
      />
      <div
        className="absolute top-[-4px] h-5 w-0.5 bg-primary"
        style={{ left: pct(target) }}
        title={`Ministry commitment — ${(target / 100).toFixed(0)}%`}
      />
    </div>
  );
}

function Benchmark({ label, value, met }: { label: string; value: string; met: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('h-2 w-2 rounded-full', met ? 'bg-emerald-500' : 'bg-destructive')} />
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium tabular">{value}</span>
    </span>
  );
}

function LedgerTable({ ledger }: { ledger: PeriodLedger[] }) {
  if (ledger.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="font-medium">No ledger entries yet.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Record contributions and disbursements to compute a share ratio.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Period</th>
            <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">In</th>
            <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Shared</th>
            <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Admin</th>
            <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Marketing</th>
            <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Related party</th>
            <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Ratio</th>
          </tr>
        </thead>
        <tbody>
          {ledger.map((row) => {
            const ratio = row.contributions_cents > 0
              ? Math.round((row.shared_cents * 10_000) / row.contributions_cents)
              : 0;
            return (
              <tr key={row.period} className="border-b last:border-0">
                <td className="px-3 py-2 font-mono text-xs">{row.period}</td>
                <td className="px-3 py-2 text-right tabular">{formatCentsCompact(row.contributions_cents)}</td>
                <td className="px-3 py-2 text-right tabular">{formatCentsCompact(row.shared_cents)}</td>
                <td className="px-3 py-2 text-right tabular text-muted-foreground">{formatCentsCompact(row.administrative_cents)}</td>
                <td className="px-3 py-2 text-right tabular text-muted-foreground">{formatCentsCompact(row.marketing_cents)}</td>
                <td className={cn('px-3 py-2 text-right tabular', row.related_party_cents > 0 && 'text-destructive')}>
                  {row.related_party_cents > 0 ? formatCentsCompact(row.related_party_cents) : '—'}
                </td>
                <td className={cn(
                  'px-3 py-2 text-right font-medium tabular',
                  ratio >= 8_000 ? 'text-emerald-500' : ratio >= 5_000 ? 'text-onus' : 'text-destructive',
                )}>
                  {bps(ratio)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export { ExternalLink };
