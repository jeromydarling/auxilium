import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Plus, Pencil, Trash2, History } from 'lucide-react';
import { api, type GuidelineVersion } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { EmptyState } from '@/components/EmptyState';

/**
 * Publishing and correcting the guidelines.
 *
 * These were readable by the API and by nothing else, which left the product in
 * an odd position: the onboarding checklist told a ministry to publish its
 * guidelines, the denial audit scored every decline against them, and there was
 * no screen anywhere that let anybody put one in. A ministry following the
 * checklist correctly could not complete the step it was being asked to do.
 *
 * The screen's whole job is to keep three things apart, because they are called
 * the same thing in conversation and have opposite consequences:
 *
 * **A correction** — the record never matched the document that was actually
 * published. The wrong text should never have governed anything, so declines
 * decided under it are re-checked. Requires a reason.
 *
 * **A new version** — the rules genuinely changed. Both documents are real and
 * each governed a period; re-scoring old declines against the new one would
 * falsify the ministry's own history.
 *
 * **A withdrawal** — published by mistake. Refused the moment anything cites
 * it, and the refusal says *correct it instead*, because a ministry told only
 * "you cannot delete this" publishes a near-duplicate to get around it.
 */

export function Guidelines() {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['integrity', 'guidelines'],
    queryFn: () => api.integrity.guidelines(),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['integrity'] });
  const versions = data?.items ?? [];

  if (isLoading) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Every decline is checked against the version that governed it. Which version binds a
          member is set in Settings, under your commitments.
        </p>
        {!adding && (
          <Button size="sm" onClick={() => setAdding(true)}><Plus /> Publish a version</Button>
        )}
      </div>

      {adding && <VersionForm onDone={() => { setAdding(false); refresh(); }} />}

      {versions.length === 0 && !adding ? (
        <div className="space-y-3">
          <EmptyState
            icon={BookOpen}
            title="No guidelines published yet"
            body="Your sharing guidelines, versioned and dated, with each provision declaring which denial reasons it authorises."
            because="Until they are here, every decline you record is flagged as citing no published provision — the ministry generates findings against itself."
          />
          <div className="text-center">
            <Button size="sm" onClick={() => setAdding(true)}>Publish your first version</Button>
          </div>
        </div>
      ) : (
        versions.map((v) => <VersionCard key={v.version} version={v} onChanged={refresh} />)
      )}
    </div>
  );
}

function VersionCard({ version, onChanged }: { version: GuidelineVersion; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [correcting, setCorrecting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const id = (version as GuidelineVersion & { id?: string }).id;

  async function withdraw() {
    if (!id) return;
    const ok = await confirm({
      title: `Withdraw ${version.version}?`,
      body:
        'Use this only for a version published by mistake. If anything already cites it, this ' +
        'will be refused and you should correct it instead — the previous text stays on file ' +
        'either way.',
      confirmLabel: 'Withdraw',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.integrity.withdrawGuideline(id);
      toast.success(`${version.version} withdrawn.`);
      onChanged();
    } catch (error) {
      // The refusal is the interesting path: it names the counts and tells you
      // what to do instead, which is the whole reason it is a message rather
      // than a disabled button.
      toast.error(error);
    } finally {
      setBusy(false);
    }
  }

  async function correct() {
    if (!id || reason.trim().length < 10) return;
    setBusy(true);
    try {
      const result = await api.integrity.correctGuideline(id, {
        reason: reason.trim(),
        provisions: version.provisions,
        effective_from: version.effective_from,
      });
      toast.success(
        'Correction applied.',
        result.rescored
          ? 'Decisions made under the old text are being re-checked.'
          : 'Nothing was decided under the old text, so nothing needed re-checking.',
      );
      setCorrecting(false);
      setReason('');
      onChanged();
    } catch (error) {
      toast.error(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">
            {version.version}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              from {version.effective_from}
              {version.effective_to ? ` to ${version.effective_to}` : ' · current'}
            </span>
          </CardTitle>
          {id && (
            <div className="flex gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => setCorrecting((v) => !v)}>
                <Pencil className="mr-1 h-3.5 w-3.5" /> Correct
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={withdraw}>
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Withdraw
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {correcting && (
          <div className="space-y-2 rounded-md border border-onus/40 bg-onus/5 p-3">
            <p className="text-sm font-medium">Correcting, not revising</p>
            <p className="text-sm text-muted-foreground">
              A correction says the record never matched the document you actually published — so
              decisions made under the wrong text are re-checked. If the rules genuinely changed,
              publish a new version instead: both documents are real, and each governed a period.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor={`why-${version.version}`}>Why is this a correction?</Label>
              <Textarea
                id={`why-${version.version}`}
                rows={2}
                placeholder="The effective date was typed as 2024-02-01; the published document says 2024-01-02."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Required, and at least a sentence. A correction with no stated reason is
                indistinguishable from a quiet rewrite.
              </p>
            </div>
            <Button size="sm" disabled={busy || reason.trim().length < 10} onClick={correct}>
              {busy ? 'Applying…' : 'Apply the correction'}
            </Button>
          </div>
        )}

        <ul className="space-y-2">
          {version.provisions.map((p) => (
            <li key={p.code} className="rounded-md border p-2.5">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-xs font-medium">{p.code}</span>
                <span className="text-sm">{p.statement}</span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {p.supports_denial_codes.length === 0 ? (
                  // Named rather than left blank. A provision authorising
                  // nothing cannot support any decline, and a ministry should
                  // find that out here rather than in a finding.
                  <span className="text-xs text-destructive">
                    Authorises no denial reasons — citing it will be flagged
                  </span>
                ) : (
                  p.supports_denial_codes.map((c) => (
                    <Badge key={c} variant="secondary" className="font-mono text-[11px]">{c}</Badge>
                  ))
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** Publishing a new version. Provisions are entered as one per line. */
function VersionForm({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [version, setVersion] = useState('');
  const [from, setFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [url, setUrl] = useState('');
  const [raw, setRaw] = useState('');
  const [busy, setBusy] = useState(false);

  /**
   * `code | statement | reason,reason` per line.
   *
   * A plain textarea rather than a repeating field builder, because the source
   * is a document somebody is transcribing — and typing forty provisions
   * through a form that adds one row at a time is how a ministry gives up on
   * step three of the checklist.
   */
  const provisions = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [code = '', statement = '', codes = ''] = line.split('|').map((s) => s.trim());
      return {
        code,
        statement,
        supports_denial_codes: codes.split(',').map((s) => s.trim()).filter(Boolean),
      };
    })
    .filter((p) => p.code && p.statement);

  async function submit() {
    if (!version.trim() || !from) return;
    setBusy(true);
    try {
      await api.integrity.publishGuideline({
        version: version.trim(),
        effective_from: from,
        published_url: url.trim() || undefined,
        provisions,
      });
      toast.success(`${version.trim()} published.`, `${provisions.length} provisions on record.`);
      onDone();
    } catch (error) {
      toast.error(error, { onRetry: submit });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Publish a guideline version</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="g-version">Version</Label>
            <Input id="g-version" placeholder="v2.1" value={version} onChange={(e) => setVersion(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="g-from">Effective from</Label>
            <Input id="g-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="g-url">Published at <span className="text-muted-foreground">(optional)</span></Label>
            <Input id="g-url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="g-prov">Provisions</Label>
          <Textarea
            id="g-prov"
            rows={7}
            className="font-mono text-xs"
            placeholder={'3.1 | Twelve-month waiting period for pre-existing conditions | pre_existing, waiting_period\n5.2 | Annual sharing limit per member | annual_limit_reached'}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            One per line: <span className="font-mono">code | what it says | denial reasons it
            authorises</span>. That last column is the one that does the work — it is what lets a
            decline citing a provision that does not authorise the stated reason be caught the week
            it happens.
          </p>
          {provisions.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {provisions.length} provision{provisions.length === 1 ? '' : 's'} read so far.
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <Button size="sm" disabled={busy || !version.trim()} onClick={submit}>
            {busy ? 'Publishing…' : 'Publish'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDone} disabled={busy}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Revision history for a corrected version. */
export function GuidelineRevisions({ id }: { id: string }) {
  const { data } = useQuery({
    queryKey: ['integrity', 'guidelines', id, 'revisions'],
    queryFn: () => api.integrity.guidelineRevisions(id),
  });
  const items = data?.items ?? [];
  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4" /> Previous text
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((r) => (
          <div key={r.id} className="rounded-md border p-2.5 text-sm">
            <p className="text-muted-foreground">{r.archived_at?.slice(0, 10)} — {r.reason}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
