import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * The two settings the whole claims layer runs on, and the one that decides
 * whether a decline is scored against you.
 *
 * These live together because they are the same kind of thing: statements the
 * ministry makes about its own conduct, which the software then holds it to.
 * Buried in a general settings form they read as configuration; presented like
 * this they read as what they are.
 */

/** The four published rules, and what each one actually means in practice. */
const GOVERNING_RULES = [
  {
    value: 'member_join',
    label: 'The version in force when the member enrolled',
    detail:
      'The strictest of the four, and the most protective of the member. This is what we assume ' +
      'if you do not choose.',
  },
  {
    value: 'date_of_service',
    label: 'The version in force when the care happened',
    detail: 'Common. Some ministries add a ratchet so anything shareable when a need began stays shareable.',
  },
  {
    value: 'date_submitted',
    label: 'The version in force when the request was submitted',
    detail: 'Used where guideline changes are announced with a submission cut-off date.',
  },
  {
    value: 'date_received',
    label: 'The version in force when you received the bills',
    detail: 'The latest-binding of the four. Worth being sure this is what your published policy says.',
  },
];

export function CommitmentSettings({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ['admin', 'org'], queryFn: () => api.admin.org() });

  const [slaDays, setSlaDays] = useState('');
  const [appealDays, setAppealDays] = useState('');
  const [rule, setRule] = useState('member_join');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!data?.org) return;
    const org = data.org as unknown as Record<string, unknown>;
    setSlaDays(String(org.sla_days ?? 17));
    setAppealDays(String(org.appeal_sla_days ?? 30));
    setRule(String(org.governing_version_rule ?? 'member_join'));
  }, [data?.org]);

  async function save() {
    setError(null);
    try {
      await api.admin.updateOrg({
        sla_days: Number(slaDays),
        appeal_sla_days: Number(appealDays),
        governing_version_rule: rule,
      });
      // The setup checklist watches for these being *chosen*, so it has to be
      // refetched here — the columns already had values and nothing else would
      // tell it anyone had looked.
      queryClient.invalidateQueries({ queryKey: ['admin', 'org'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'onboarding'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not save.');
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Your commitments</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <p className="text-sm text-muted-foreground">
            These are promises your ministry makes, not settings we recommend. Ministries publish
            hard deadlines members must meet and rarely publish one of their own; where that gap has
            been closed, a regulator closed it afterwards. Choosing a number here is choosing to be
            held to it.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="sla-days">Days to decide a need</Label>
            <Input
              id="sla-days"
              type="number"
              min={1}
              max={365}
              value={slaDays}
              onChange={(e) => setSlaDays(e.target.value)}
              disabled={!canEdit}
            />
            <p className="text-xs text-muted-foreground">
              Every claim gets this due date at submission. Past it, the claim escalates and the
              member is told plainly that it is late.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="appeal-days">Days to decide an appeal</Label>
            <Input
              id="appeal-days"
              type="number"
              min={1}
              max={365}
              value={appealDays}
              onChange={(e) => setAppealDays(e.target.value)}
              disabled={!canEdit}
            />
            <p className="text-xs text-muted-foreground">
              Roughly half of appealed declines are approved, and almost nobody appeals. A slow
              appeal process is most of why.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="governing-rule">Which guideline version governs a need</Label>
          <select
            id="governing-rule"
            value={rule}
            onChange={(e) => setRule(e.target.value)}
            disabled={!canEdit}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
          >
            {GOVERNING_RULES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            {GOVERNING_RULES.find((r) => r.value === rule)?.detail}
          </p>
          <p className="text-xs text-muted-foreground">
            There is no standard here — all four are in real use. We score a decline against the
            date <em>your</em> published policy makes controlling, so that following your own rules
            correctly is never reported as a finding against you. Set this to whatever your
            guidelines actually say.
          </p>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {canEdit && (
          <div className="flex items-center gap-3">
            <Button onClick={save}>Save</Button>
            {saved && <span className="text-sm text-muted-foreground">Saved.</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
