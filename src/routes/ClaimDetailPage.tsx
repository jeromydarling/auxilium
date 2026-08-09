import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Calculator, Gavel, ShieldAlert } from 'lucide-react';
import { api, type TrackerResponse } from '@/lib/api';
import { PageHeader } from '@/app/AppShell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { formatCents, parseCents } from '@/lib/money';
import { cn } from '@/lib/utils';

/**
 * One claim, and the decisions that can be made about it.
 *
 * Before this the claims layer was readable and not operable: staff could see
 * that a claim was late and acknowledge it, and that was the whole surface. The
 * endpoints to decline it, reprice it, and decide an appeal all existed, were
 * tested, and could not be reached from anywhere in the product — so the
 * guideline-consistency argument the whole integrity layer rests on had no way
 * to be exercised by the people it is about.
 *
 * The decisions are laid out in the order they actually get made, and each one
 * carries the thing that makes it defensible later: a decline needs a provision,
 * a repricing records its basis, an appeal decision needs a reason in writing.
 */

export function ClaimDetailPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['claims', 'tracker', id],
    enabled: id.length > 0,
    retry: false,
    queryFn: () => api.claims.tracker(id),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['claims'] });
    queryClient.invalidateQueries({ queryKey: ['integrity'] });
  };

  if (isLoading) {
    return <div className="p-6"><p className="text-sm text-muted-foreground">Loading…</p></div>;
  }
  if (isError || !data) {
    return (
      <div className="space-y-3 p-6">
        <p className="text-sm">That claim was not found.</p>
        <Button variant="outline" size="sm" asChild>
          <Link to="/escalations"><ArrowLeft /> Back to escalations</Link>
        </Button>
      </div>
    );
  }

  const { claim, sla } = data;
  const decided = claim.status === 'denied' || claim.status === 'shared' || claim.status === 'closed';

  return (
    <>
      <PageHeader
        title={claim.title}
        description={`${formatCents(claim.amount_requested_cents)} requested · ${claim.status.replace(/_/g, ' ')}`}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/escalations"><ArrowLeft /> Escalations</Link>
          </Button>
        }
      />

      <div className="space-y-6 p-6">
        <Tracker data={data} />

        {/* What the member is being told, verbatim.
            Shown to staff because somebody on the phone needs to see exactly
            what the person they are speaking to has already read — the same
            reason staff can read member knowledge articles. */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">What the member sees</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm">{sla.member_message}</p>
            {sla.needs_escalation && (
              <p className="mt-2 flex items-start gap-1.5 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {sla.acknowledged
                  ? `${sla.days_over} days past the commitment.`
                  : `Nobody has opened this in ${sla.days_unacknowledged} days.`}
              </p>
            )}
          </CardContent>
        </Card>

        {claim.denial_reason_code ? (
          <DeclineRecord claim={claim} />
        ) : (
          !decided && <DeclineForm id={id} onDone={refresh} />
        )}

        <RepriceForm id={id} billedCents={claim.amount_requested_cents} onDone={refresh} />

        {claim.denial_reason_code && <AppealPanel needId={id} onDone={refresh} />}
      </div>
    </>
  );
}

function Tracker({ data }: { data: TrackerResponse }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Where it is</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-2">
          {data.steps.map((step) => (
            <li key={step.key} className="flex items-center gap-2.5 text-sm">
              <span
                className={cn(
                  'h-2 w-2 shrink-0 rounded-full',
                  step.state === 'done' && 'bg-cura',
                  step.state === 'current' && 'bg-primary',
                  step.state === 'failed' && 'bg-destructive',
                  step.state === 'upcoming' && 'bg-muted-foreground/30',
                )}
              />
              <span className={cn(step.state === 'upcoming' && 'text-muted-foreground')}>{step.label}</span>
              {step.at && <span className="text-xs text-muted-foreground">{step.at.slice(0, 10)}</span>}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

/** A decline already on record, including the absence of a citation. */
function DeclineRecord({ claim }: { claim: TrackerResponse['claim'] }) {
  return (
    <Card className="border-destructive/40">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Gavel className="h-4 w-4" /> This was declined
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p><span className="text-muted-foreground">Reason:</span> {claim.denial_reason_code}</p>
        {/* The absence is shown as plainly as the presence. A product that
            scores a ministry on declines citing no provision cannot hide from
            its own staff that this one did. */}
        <p>
          <span className="text-muted-foreground">Provision cited:</span>{' '}
          {claim.denial_guideline_ref ?? (
            <span className="text-destructive">none recorded — this will be flagged as a finding</span>
          )}
        </p>
        {claim.denial_note && <p className="text-muted-foreground">{claim.denial_note}</p>}
      </CardContent>
    </Card>
  );
}

function DeclineForm({ id, onDone }: { id: string; onDone: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [reason, setReason] = useState('');
  const [ref, setRef] = useState('');
  const [note, setNote] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const { data: guidelines } = useQuery({
    queryKey: ['integrity', 'guidelines'],
    queryFn: () => api.integrity.guidelines(),
  });

  const current = guidelines?.items?.[0];
  const provisions = current?.provisions ?? [];
  const chosen = provisions.find((p) => p.code === ref);

  async function submit() {
    if (!reason.trim() || !ref.trim()) return;

    const ok = await confirm({
      title: 'Decline this need?',
      body:
        'The member will be told, and the decision goes on the record with the provision you ' +
        'cited. Declines are audited against your published guidelines.',
      confirmLabel: 'Decline',
      destructive: true,
    });
    if (!ok) return;

    setBusy(true);
    try {
      const result = await api.claims.deny(id, {
        reason_code: reason.trim(),
        guideline_ref: ref.trim(),
        note: note.trim() || undefined,
      });
      // Warnings are surfaced, not swallowed. The endpoint deliberately does
      // not block on a citation that does not hold up — blocking pushes staff
      // to pick whatever provision the form accepts — so the whole value of
      // that decision depends on somebody actually being shown the warning.
      setWarnings(result.warnings ?? []);
      if (result.warnings?.length) {
        toast.info('Recorded, with a warning about the citation.', 'It is shown below.');
      } else {
        toast.success('Decline recorded.', 'The citation checks out against your guidelines.');
      }
      onDone();
    } catch (error) {
      toast.error(error, { onRetry: submit });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Gavel className="h-4 w-4" /> Decline this need
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="dec-ref">Provision</Label>
            <select
              id="dec-ref"
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={ref}
              onChange={(e) => { setRef(e.target.value); setReason(''); }}
            >
              <option value="">Choose a provision…</option>
              {provisions.map((p) => (
                <option key={p.code} value={p.code}>{p.code} — {p.statement.slice(0, 60)}</option>
              ))}
            </select>
            {current && (
              <p className="text-xs text-muted-foreground">
                From guideline {current.version}, effective {current.effective_from}.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dec-reason">Reason</Label>
            <select
              id="dec-reason"
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={!ref}
            >
              <option value="">{ref ? 'Choose a reason…' : 'Choose a provision first'}</option>
              {/* Narrowed to what the chosen provision actually authorises. The
                  API warns when they do not match; offering only the ones that
                  do means the warning is for genuine mistakes rather than for
                  somebody who had no way of knowing. */}
              {(chosen?.supports_denial_codes ?? []).map((code) => (
                <option key={code} value={code}>{code}</option>
              ))}
            </select>
            {chosen && chosen.supports_denial_codes.length === 0 && (
              <p className="text-xs text-destructive">
                This provision authorises no denial reasons. Citing it will be flagged.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="dec-note">Note <span className="text-muted-foreground">(optional)</span></Label>
          <Textarea id="dec-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        {warnings.length > 0 && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
            <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
              <ShieldAlert className="h-4 w-4" /> This citation does not hold up
            </p>
            <ul className="mt-1.5 space-y-1">
              {warnings.map((w) => <li key={w} className="text-sm text-muted-foreground">{w}</li>)}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              The decline was recorded — it is not blocked, because blocking would push staff to
              pick whatever provision the form accepts. It will appear as a finding until corrected.
            </p>
          </div>
        )}

        <Button size="sm" variant="destructive" disabled={busy || !reason || !ref} onClick={submit}>
          {busy ? 'Recording…' : 'Record the decline'}
        </Button>
      </CardContent>
    </Card>
  );
}

function RepriceForm({ id, billedCents, onDone }: { id: string; billedCents: number; onDone: () => void }) {
  const toast = useToast();
  const [medicare, setMedicare] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ repriced_cents: number; savings_cents: number; explanation: string } | null>(null);

  const cents = parseCents(medicare);

  async function submit() {
    if (!cents) return;
    setBusy(true);
    try {
      const res = await api.claims.reprice(id, { medicare_cents: cents });
      setResult(res.result);
      toast.success('Repriced.', 'The basis is recorded with the proposal.');
      onDone();
    } catch (error) {
      toast.error(error, { onRetry: submit });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Calculator className="h-4 w-4" /> Reprice against the Medicare allowable
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Billed {formatCents(billedCents)}. Enter the Medicare allowable for this procedure and
          Auxilium proposes a defensible amount — with the basis recorded, so it reads as a
          negotiation rather than a refusal to pay.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-48 space-y-1.5">
            <Label htmlFor="rp">Medicare allowable</Label>
            <Input id="rp" inputMode="decimal" placeholder="4,000.00" value={medicare} onChange={(e) => setMedicare(e.target.value)} />
          </div>
          <Button size="sm" variant="outline" disabled={busy || !cents} onClick={submit}>
            {busy ? 'Working…' : 'Propose a price'}
          </Button>
        </div>
        {/* Without a rate on file the engine declines to reprice rather than
            pricing to zero and reporting the whole bill as a saving — a real
            bug a test caught, and the reason this field is required. */}
        {result && (
          <div className="rounded-md border p-3">
            <div className="flex flex-wrap items-baseline gap-4">
              <span className="text-2xl font-semibold tabular">{formatCents(result.repriced_cents)}</span>
              <Badge variant="secondary">Saves {formatCents(result.savings_cents)}</Badge>
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground">{result.explanation}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AppealPanel({ needId, onDone }: { needId: string; onDone: () => void }) {
  const toast = useToast();
  const [statement, setStatement] = useState('');
  const [busy, setBusy] = useState(false);

  const { data } = useQuery({ queryKey: ['claims', 'appeals'], queryFn: () => api.claims.appeals({}) });
  const existing = data?.items?.find((a) => a.need_id === needId);

  async function file() {
    if (!statement.trim()) return;
    setBusy(true);
    try {
      await api.claims.appeal(needId, { member_statement: statement.trim() });
      toast.success('Appeal filed.', 'It has its own clock, and it is on the escalation desk.');
      setStatement('');
      onDone();
    } catch (error) {
      toast.error(error, { onRetry: file });
    } finally {
      setBusy(false);
    }
  }

  if (existing) return <AppealDecision appeal={existing} onDone={onDone} />;

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Record an appeal</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {/* The one statistic worth putting in front of staff at this moment:
            appealing works about half the time and almost nobody does it. */}
        <p className="text-sm text-muted-foreground">
          Colorado&rsquo;s 2024 filings — the only compelled per-ministry data in the country —
          record 13,741 declines, 111 appeals, and 54 of those approved. Under one percent appealed;
          roughly half who did succeeded. If this member has asked you to look again, record it here.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="ap">What the member says</Label>
          <Textarea id="ap" rows={3} value={statement} onChange={(e) => setStatement(e.target.value)} />
        </div>
        <Button size="sm" disabled={busy || !statement.trim()} onClick={file}>
          {busy ? 'Filing…' : 'File the appeal'}
        </Button>
      </CardContent>
    </Card>
  );
}

function AppealDecision({
  appeal, onDone,
}: {
  appeal: { id: string; status: string; member_statement: string; due_at: string | null; overdue: number };
  onDone: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const open = appeal.status === 'submitted' || appeal.status === 'in_review';

  async function decide(outcome: 'upheld' | 'overturned') {
    if (!note.trim()) return;
    const ok = await confirm({
      title: outcome === 'overturned' ? 'Overturn this decline?' : 'Uphold this decline?',
      body:
        outcome === 'overturned'
          ? 'The need reopens for sharing and the member is told. Your reason goes on the record.'
          : 'The decline stands. The member is told, with your reason, and it stays on the record.',
      confirmLabel: outcome === 'overturned' ? 'Overturn' : 'Uphold',
      destructive: outcome === 'upheld',
    });
    if (!ok) return;

    setBusy(true);
    try {
      await api.claims.decideAppeal(appeal.id, { outcome, decision_note: note.trim() });
      toast.success(outcome === 'overturned' ? 'Overturned.' : 'Upheld.', 'The member has been told.');
      onDone();
    } catch (error) {
      toast.error(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className={cn(appeal.overdue && 'border-destructive/50')}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          Appeal — {appeal.status.replace(/_/g, ' ')}
          {appeal.due_at && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              due {appeal.due_at.slice(0, 10)}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">{appeal.member_statement}</p>
        {open && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="ad">Your reason</Label>
              <Textarea
                id="ad"
                rows={3}
                placeholder="Required. This is what the member is told, and what a regulator would read."
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" disabled={busy || !note.trim()} onClick={() => decide('overturned')}>
                Overturn the decline
              </Button>
              <Button size="sm" variant="outline" disabled={busy || !note.trim()} onClick={() => decide('upheld')}>
                Uphold it
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
