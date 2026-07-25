import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/app/AppShell';
import { api } from '@/lib/api';
import { DIRECTION_META, NRI_DIRECTIONS, BAND_THRESHOLDS, BAND_LABEL } from '@/lib/nri/directions';

/**
 * The rule reference.
 *
 * Publishing the entire rule set — every code, weight, and rationale — is the
 * whole point of building NRI on rules instead of a model. An administrator who
 * disagrees with a score can find the exact rule that produced it and say so.
 * A system that cannot be argued with does not get trusted with pastoral care.
 */
export function RulesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['nri', 'rules'],
    staleTime: Infinity,
    queryFn: () => api.nri.rules(),
  });

  return (
    <>
      <PageHeader
        title="How NRI scores are calculated"
        description="Every rule the system uses, in full. Nothing here is a model or a guess."
      />

      <div className="space-y-6 p-6">
        <section className="rounded-lg border bg-card p-5">
          <h2 className="font-semibold">The short version</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Each member is scored on four directions. A score is the sum of the weights of every
            rule that matched — nothing more. There is no model, no training data, and no learned
            coefficient anywhere in the calculation, so the weights you see below add up by hand to
            the number on the screen. If a score looks wrong, one of these rules is wrong, and it
            can be changed.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {BAND_THRESHOLDS.slice().reverse().map(({ band, min }) => (
              <span key={band} className="rounded border px-2 py-1 text-xs">
                <span className="font-medium">{BAND_LABEL[band]}</span>
                <span className="text-muted-foreground"> — {min} and above</span>
              </span>
            ))}
          </div>

          {data?.version && (
            <p className="mt-3 text-xs text-muted-foreground">
              Current rule set: <span className="font-mono">{data.version}</span>
            </p>
          )}
        </section>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading rules…</p>
        ) : (
          NRI_DIRECTIONS.map((direction) => {
            const meta = DIRECTION_META[direction];
            const rules = (data?.rules ?? []).filter((r) => r.direction === direction);

            return (
              <section key={direction}>
                <div className="mb-2 flex flex-wrap items-baseline gap-2">
                  <span
                    className={`inline-flex items-center rounded border px-2 py-0.5 text-sm font-medium chip-${direction}`}
                  >
                    {meta.label}
                  </span>
                  <span className="text-sm text-muted-foreground">{meta.description}</span>
                </div>

                <p className="mb-2 text-sm">
                  <span className="font-medium">When this is high:</span>{' '}
                  <span className="text-muted-foreground">{meta.response}</span>
                </p>

                <div className="divide-y rounded-lg border bg-card">
                  {rules.map((rule) => (
                    <div key={rule.code} className="flex gap-4 p-4">
                      <span className="w-10 shrink-0 text-right font-mono text-sm tabular text-muted-foreground">
                        +{rule.weight}
                      </span>
                      <div className="min-w-0">
                        <p className="font-medium">{rule.label}</p>
                        <p className="mt-0.5 text-sm text-muted-foreground">{rule.rationale}</p>
                        <p className="mt-1 font-mono text-xs text-muted-foreground">{rule.code}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>
    </>
  );
}
