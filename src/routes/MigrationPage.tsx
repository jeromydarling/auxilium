import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, Copy, Check, ShieldAlert, Upload } from 'lucide-react';
import {
  api, type MigrationSummary, type ManifestReport, type MigrationStatus, type MigrationListItem,
} from '@/lib/api';
import { PageHeader } from '@/app/AppShell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/EmptyState';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { requestTemplate, processorByKey } from '@/lib/migration/processors';
import { useAuth } from '@/app/AuthContext';

/**
 * Moving a ministry off its current payment processor.
 *
 * This whole capability existed as a tested API and nothing else — no route, no
 * navigation, not even a method in the client. Nine features on the marketing
 * site described it, and the legacy comparison page leads with it as the thing
 * we do that established platforms do not. A ministry could not start one.
 *
 * The screen is built around the belief that actually blocks a switch, which is
 * not a feature gap: ministries think leaving means asking every household to
 * re-enter their payment details. It does not — stored cards and verified
 * mandates transfer processor to processor — and the page says so before it
 * asks anybody to do anything.
 *
 * **Auxilium is the coordination layer, not the courier.** The payment data
 * goes from the old processor to Stripe directly, which is why step two takes a
 * manifest of members and *not* card numbers, and why the upload is refused
 * outright if it contains any.
 */

export function MigrationPage() {
  const queryClient = useQueryClient();
  const [active, setActive] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['migration', 'list'],
    queryFn: () => api.migration.list(),
  });

  const migrations = data?.items ?? [];
  const current = active ?? migrations[0]?.id ?? null;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['migration'] });

  if (isLoading) return <div className="p-6"><p className="text-sm text-muted-foreground">Loading…</p></div>;

  return (
    <>
      <PageHeader
        title="Move to a new processor"
        description="Members keep their cards, their bank mandates, and their billing dates."
      />
      <div className="space-y-6 p-6">
        {migrations.length === 0 ? (
          <StartMigration onStarted={(id) => { setActive(id); refresh(); }} />
        ) : (
          <>
            {migrations.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {migrations.map((m) => (
                  <Button
                    key={m.id}
                    size="sm"
                    variant={m.id === current ? 'default' : 'outline'}
                    onClick={() => setActive(m.id)}
                  >
                    {m.processor_label}
                  </Button>
                ))}
              </div>
            )}
            {current && (
              <MigrationDetail
                id={current}
                record={migrations.find((m) => m.id === current)}
                onChanged={refresh}
              />
            )}
          </>
        )}
      </div>
    </>
  );
}

function StartMigration({ onStarted }: { onStarted: (id: string) => void }) {
  const toast = useToast();
  const [processor, setProcessor] = useState('');
  const [merchantId, setMerchantId] = useState('');
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState<MigrationSummary | null>(null);

  const { data } = useQuery({
    queryKey: ['migration', 'processors'],
    queryFn: () => api.migration.processors(),
  });
  const processors = data?.processors ?? [];

  async function start() {
    if (!processor) return;
    setBusy(true);
    try {
      const result = await api.migration.start({ processor, merchant_id: merchantId.trim() || undefined });
      setStarted(result);
      toast.success('Migration started.', 'Nothing has moved yet — the next step is a letter.');
      onStarted(result.id);
    } catch (error) {
      toast.error(error, { onRetry: start });
    } finally {
      setBusy(false);
    }
  }

  if (started) return <RequestLetter summary={started} />;

  return (
    <>
      <EmptyState
        icon={ArrowRightLeft}
        title="Nobody has to re-enter their card"
        body="Stored cards and verified bank mandates transfer from your current processor to Stripe directly, without members doing anything. Billing dates come across too, so nobody is charged twice or skipped."
        because="The churn ministries fear when switching is almost entirely self-inflicted, and it comes from sending everyone an email asking them to set up payment again."
      />

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Who are you moving from?</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="proc">Current processor</Label>
              <select
                id="proc"
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={processor}
                onChange={(e) => setProcessor(e.target.value)}
              >
                <option value="">Choose…</option>
                {processors.map((p) => (
                  <option key={p.key} value={p.key}>{p.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mid">Merchant or account ID <span className="text-muted-foreground">(optional)</span></Label>
              <Input id="mid" value={merchantId} onChange={(e) => setMerchantId(e.target.value)} />
            </div>
          </div>
          <Button size="sm" disabled={busy || !processor} onClick={start}>
            {busy ? 'Starting…' : 'Start the move'}
          </Button>
        </CardContent>
      </Card>
    </>
  );
}

/** The letter that actually gets the export released. */
function RequestLetter({ summary }: { summary: MigrationSummary }) {
  const [copied, setCopied] = useState(false);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Send this to {summary.processor}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Processors release payment data to another PCI-compliant processor, not to you. This asks
          for exactly that, in the words that get it actioned rather than refused.
          {summary.estimatedDays &&
            ` Expect roughly ${summary.estimatedDays.low}–${summary.estimatedDays.high} days.`}
        </p>

        {summary.warnings?.length > 0 && (
          // Said before the wait, not after it. Finding out at day fifteen that
          // this processor never releases network transaction IDs is a very
          // different experience from knowing on day one.
          <div className="rounded-md border border-onus/40 bg-onus/5 p-3">
            <p className="text-sm font-medium">Worth knowing about this processor</p>
            <ul className="mt-1 space-y-1">
              {summary.warnings.map((w) => (
                <li key={w} className="text-sm text-muted-foreground">{w}</li>
              ))}
            </ul>
          </div>
        )}

        <Textarea readOnly rows={14} className="font-mono text-xs" value={summary.request_letter} />
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void navigator.clipboard.writeText(summary.request_letter);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? <><Check /> Copied</> : <><Copy /> Copy the letter</>}
        </Button>
      </CardContent>
    </Card>
  );
}

function MigrationDetail({
  id, record, onChanged,
}: {
  id: string;
  record?: MigrationListItem;
  onChanged: () => void;
}) {
  const { org } = useAuth();
  const { data: status } = useQuery({
    queryKey: ['migration', id, 'status'],
    queryFn: () => api.migration.status(id),
  });

  /**
   * The letter, regenerated rather than remembered.
   *
   * It was originally shown only in the moment after creating a migration,
   * which meant a reload lost the one artifact the ministry actually has to
   * send — and the whole first step is "send this and wait a fortnight". The
   * template is pure and lives in `src/lib/migration/processors.ts`, so it is
   * rebuilt here from the same function the API uses. Two callers, one
   * template, no endpoint to keep in sync.
   */
  const profile = record ? processorByKey(record.source_processor) : undefined;
  const letter = profile
    ? requestTemplate({
        processor: profile,
        ministryName: org?.name ?? 'Our ministry',
        merchantId: record?.source_merchant_id ?? undefined,
      })
    : null;

  return (
    <div className="space-y-6">
      {status && <DualRunBoard status={status} />}
      <ManifestUpload id={id} onDone={onChanged} />
      {letter && profile && (
        <RequestLetter
          summary={{ id, processor: profile.label, warnings: [], request_letter: letter }}
        />
      )}
    </div>
  );
}

/**
 * The board that decides when the old processor can be switched off.
 *
 * Counts successful charges rather than imported rows, deliberately: the
 * trigger for retiring the old platform is a number reaching zero, not a date
 * in a plan.
 */
function DualRunBoard({ status }: { status: MigrationStatus }) {
  const done = status.total > 0 && status.safely_across === status.total;

  return (
    <Card className={cn(done && 'border-cura/50')}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Running both platforms</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-6">
          <Stat label="Safely across" value={status.safely_across} tone={done ? 'good' : 'plain'} />
          <Stat label="Still to resolve" value={status.still_to_resolve} tone={status.still_to_resolve ? 'warn' : 'plain'} />
          <Stat label="On the manifest" value={status.total} tone="plain" />
        </div>

        <p className={cn('text-sm', done ? 'text-cura' : 'text-muted-foreground')}>{status.guidance}</p>

        {(status.wallets.apple_pay > 0 || status.wallets.google_pay > 0) && (
          <p className="text-sm text-muted-foreground">
            {status.wallets.apple_pay + status.wallets.google_pay} members pay through a digital
            wallet. Those tokens are issued per merchant and do not transfer — those members will
            need to re-add a card, and they are the only ones who will.
          </p>
        )}

        {status.needs_attention?.length > 0 && (
          <div className="rounded-md border">
            <p className="border-b px-3 py-2 text-sm font-medium">Needs a person</p>
            <ul className="divide-y">
              {status.needs_attention.slice(0, 10).map((row) => (
                <li key={row.legacy_customer_id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span>{row.email ?? row.legacy_customer_id}</span>
                  <Badge variant="secondary">{row.status.replace(/_/g, ' ')}</Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'good' | 'warn' | 'plain' }) {
  return (
    <div>
      <p
        className={cn(
          'text-3xl font-semibold tabular',
          tone === 'good' && 'text-cura',
          tone === 'warn' && 'text-onus',
        )}
      >
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function ManifestUpload({ id, onDone }: { id: string; onDone: () => void }) {
  const toast = useToast();
  const [report, setReport] = useState<ManifestReport | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    setReport(null);
    try {
      const text = await file.text();
      const result = await api.migration.manifest(id, text);
      setReport(result.report);
      const blocking = result.report.issues.filter((i) => i.level === 'blocking');
      if (blocking.length > 0) {
        toast.error(new Error(blocking[0].message));
      } else {
        toast.success(`${result.report.ready} members ready to move.`);
        onDone();
      }
    } catch (error) {
      // A 422 carries the report, and the report is the useful part — a refused
      // upload should show *why* rather than only that it failed.
      const payload = (error as { payload?: { report?: ManifestReport } }).payload;
      if (payload?.report) setReport(payload.report);
      toast.error(error);
    } finally {
      setBusy(false);
    }
  }

  const blocking = report?.issues.filter((i) => i.level === 'blocking') ?? [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Upload className="h-4 w-4" /> The member manifest
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          A list of <em>who</em> is moving — member reference, email, last four digits, amount, and
          billing day. Never card numbers: those go from your old processor to Stripe directly and
          must never pass through here.
        </p>

        <Input
          type="file"
          accept=".csv,text/csv"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />

        {blocking.length > 0 && (
          // The refusal is the feature. Any run of 13–19 digits passing a Luhn
          // check fails the upload before a byte is stored, and the attempt is
          // written to the audit log — somebody nearly sent us card numbers,
          // and that is worth a record precisely *because* we refused it.
          <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3">
            <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
              <ShieldAlert className="h-4 w-4" /> Refused
            </p>
            {blocking.map((i) => (
              <p key={i.code} className="mt-1 text-sm text-muted-foreground">{i.message}</p>
            ))}
          </div>
        )}

        {report && blocking.length === 0 && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-6">
              <Stat label="Ready to move" value={report.ready} tone="good" />
              <Stat label="Flagged" value={report.flagged} tone={report.flagged ? 'warn' : 'plain'} />
              <Stat label="Need a person" value={report.manual} tone={report.manual ? 'warn' : 'plain'} />
            </div>
            {report.issues.filter((i) => i.level !== 'blocking').map((i) => (
              <p key={i.code} className="text-sm text-muted-foreground">{i.message}</p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
