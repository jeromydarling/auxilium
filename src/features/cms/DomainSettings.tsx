import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Globe, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { relativeDays } from '@/lib/utils';

/**
 * A ministry's own domain.
 *
 * The default address — `/{slug}` on the shared origin — needs no DNS, no
 * certificate, and no explanation, and most ministries should stay there. This
 * screen exists for the ones who will not, and it is written for somebody who
 * has logged into a DNS panel maybe twice.
 *
 * Two things it is careful about:
 *
 * **Verification first, routing second, stated in that order and explained.**
 * A ministry that adds the routing record first points its *live* website at a
 * server that is not serving it yet — which takes their existing site down
 * while they wait for us. That is the single most damaging mistake available
 * here, and it is entirely avoidable by saying which record to add when.
 *
 * **"Not there yet" is a state, not a failure.** DNS propagation is the kind of
 * wait that feels broken in silence, so a check that finds nothing reports what
 * it looked for, what it saw instead, and when it looked.
 */
export function DomainSettings() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ['cms', 'domain'], queryFn: () => api.cms.domain() });

  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCheck, setLastCheck] = useState<{ found?: string[]; ok: boolean } | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['cms', 'domain'] });

  async function guarded(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  }

  if (!data) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Globe className="h-4 w-4" /> Your own domain
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {!data.domain ? (
          <>
            <p className="text-sm text-muted-foreground">
              Optional. Your site already works at its address above — this puts it on a domain you
              own instead, like <span className="font-mono">sheltervalley.org</span>.
            </p>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (input.trim()) guarded(() => api.cms.claimDomain(input.trim()));
              }}
            >
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="sheltervalley.org"
                aria-label="Your domain"
                className="h-8 text-sm"
              />
              <Button type="submit" size="sm" variant="outline" disabled={busy}>
                Add
              </Button>
            </form>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm">{data.domain}</span>
              {data.verified_at ? (
                <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-500">
                  <Check className="h-3.5 w-3.5" /> verified
                </span>
              ) : (
                <span className="text-xs text-amber-700 dark:text-amber-500">not verified yet</span>
              )}
            </div>

            {!data.verified_at && data.dns && (
              <div className="space-y-4 rounded-md border p-3">
                <div className="space-y-1.5">
                  <p className="text-sm font-medium">1. Add this record to prove it is yours</p>
                  <p className="text-xs text-muted-foreground">{data.dns.verify.why}</p>
                  <Record record={data.dns.verify} />
                </div>

                <div className="space-y-1.5">
                  <p className="text-sm font-medium">2. Then point the domain here</p>
                  <p className="text-xs text-muted-foreground">{data.dns.route.why}</p>
                  <Record record={data.dns.route} />
                  {data.dns.apex && (
                    <p className="text-xs text-muted-foreground">
                      This is a bare domain, so your DNS provider may call this ALIAS, ANAME, or
                      “CNAME flattening”. If it only offers A records, ask them for the address to
                      use — a plain CNAME on a bare domain is not valid and some providers will
                      accept it anyway and break your email.
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  guarded(async () => {
                    const result = await api.cms.verifyDomain();
                    setLastCheck({ found: result.found, ok: Boolean(result.verified_at) });
                  })
                }
              >
                {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                {data.verified_at ? 'Check again' : 'Check now'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                disabled={busy}
                onClick={() => guarded(() => api.cms.releaseDomain())}
              >
                Remove
              </Button>
              {data.checked_at && (
                <span className="text-xs text-muted-foreground">
                  Last checked {relativeDays(data.checked_at)}
                </span>
              )}
            </div>

            {/* Silence after a check reads as a broken button. What we looked
                for and what we saw is the difference between "wait a bit" and
                "you pasted it into the wrong field". */}
            {lastCheck && !lastCheck.ok && (
              <p className="text-xs text-muted-foreground">
                Not visible yet.{' '}
                {lastCheck.found?.length
                  ? `We found ${lastCheck.found.length} record${lastCheck.found.length === 1 ? '' : 's'} there, but not this value — check for a typo.`
                  : 'Nothing is published at that name yet. DNS changes usually appear within a few minutes, occasionally within a day.'}
              </p>
            )}

            {data.verified_at && (
              <p className="text-xs text-muted-foreground">
                Your site answers here once the second record is in place and your certificate has
                been issued. Signing in still happens at{' '}
                <span className="font-mono">{data.platform_host}</span> — that is deliberate, so a
                member's session is never split across two addresses.
              </p>
            )}
          </>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

function Record({ record }: { record: { type: string; name: string; value: string } }) {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (what: string, value: string) => {
    navigator.clipboard?.writeText(value);
    setCopied(what);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <dl className="grid grid-cols-[4rem_1fr] gap-x-3 gap-y-1 text-xs">
      <dt className="text-muted-foreground">Type</dt>
      <dd className="font-mono">{record.type}</dd>
      <dt className="text-muted-foreground">Name</dt>
      <dd className="flex items-center gap-1.5">
        <span className="break-all font-mono">{record.name}</span>
        <button
          className="shrink-0 text-muted-foreground hover:text-foreground"
          aria-label="Copy name"
          onClick={() => copy('name', record.name)}
        >
          {copied === 'name' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </button>
      </dd>
      <dt className="text-muted-foreground">Value</dt>
      <dd className="flex items-center gap-1.5">
        <span className="break-all font-mono">{record.value}</span>
        <button
          className="shrink-0 text-muted-foreground hover:text-foreground"
          aria-label="Copy value"
          onClick={() => copy('value', record.value)}
        >
          {copied === 'value' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </button>
      </dd>
    </dl>
  );
}
