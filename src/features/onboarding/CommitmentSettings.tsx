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
  /**
   * Three states, not two. `null` means nobody has answered yet, which is the
   * one the setup checklist is asking about — collapsing it to false would tick
   * the box for every ministry that has never seen this screen.
   */
  const [publishRatio, setPublishRatio] = useState<boolean | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!data?.org) return;
    const org = data.org as unknown as Record<string, unknown>;
    setSlaDays(String(org.sla_days ?? 17));
    setAppealDays(String(org.appeal_sla_days ?? 30));
    setRule(String(org.governing_version_rule ?? 'member_join'));
    const brand = (org.brand ?? {}) as { publish_share_ratio?: unknown };
    setPublishRatio(typeof brand.publish_share_ratio === 'boolean' ? brand.publish_share_ratio : null);
  }, [data?.org]);

  async function save() {
    setError(null);
    try {
      await api.admin.updateOrg({
        sla_days: Number(slaDays),
        appeal_sla_days: Number(appealDays),
        governing_version_rule: rule,
        // Merged rather than replaced: brand holds the colour, the typeface and
        // the wordmark too, and a bare object here would wipe a ministry's
        // whole identity from a page about turnaround times.
        brand: {
          ...((data?.org.brand ?? {}) as Record<string, unknown>),
          // Written only once answered, so "declined" and "never asked" stay
          // distinguishable in the database as well as on screen.
          ...(publishRatio === null ? {} : { publish_share_ratio: publishRatio }),
        },
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

        {/* The transparency decision.
            Deliberately three states with no default selected. A pre-ticked box
            would make publishing a ministry's own financial figures something
            that happened to them rather than something they chose, which is the
            opposite of what this product argues for everywhere else. */}
        <div className="space-y-2">
          <Label>Publish your share ratio</Label>
          <p className="text-xs text-muted-foreground">
            Of every dollar members contributed, how many cents reached their medical costs. This
            decides whether the figure appears on your own website and at your public transparency
            address. It changes nothing about how it is calculated, or what your staff see.
          </p>
          <div className="space-y-2 pt-1">
            {[
              {
                value: true,
                label: 'Yes — publish it',
                detail:
                  'The figure appears on your site and at a public address anyone can check. ' +
                  'A ministry that clears a bar it is not held to has said something no marketing ' +
                  'page can.',
              },
              {
                value: false,
                label: 'No — keep it internal',
                detail:
                  'Your staff and board still see it in full. Nothing is published, and the ' +
                  'share-ratio section simply does not appear on your website.',
              },
            ].map((option) => (
              <label key={String(option.value)} className="flex gap-2 text-sm">
                <input
                  type="radio"
                  name="publish-share-ratio"
                  checked={publishRatio === option.value}
                  onChange={() => setPublishRatio(option.value)}
                  disabled={!canEdit}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium">{option.label}</span>
                  <span className="block text-xs text-muted-foreground">{option.detail}</span>
                </span>
              </label>
            ))}
          </div>
          {publishRatio === null && (
            <p className="text-xs text-amber-700 dark:text-amber-500">
              Not answered yet. Until it is, the figure stays off your website.
            </p>
          )}
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
