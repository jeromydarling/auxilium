import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { RefreshCw, ChevronRight, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/app/AppShell';
import { useNriTriage, useNriSignals } from '@/hooks/nri/useNriSignals';
import { CompassChips, BandBadge } from '@/features/nri/DirectionChip';
import { SignalExplanation } from '@/features/nri/SignalExplanation';
import { DIRECTION_META, NRI_DIRECTIONS } from '@/lib/nri/directions';
import { relativeDays, cn } from '@/lib/utils';
import { api } from '@/lib/api';
import type { Direction, TriageItem } from '@/lib/api';

/**
 * The NRI command center.
 *
 * A worklist, not a dashboard. Most pressing at the top, every row expandable
 * into the exact reasons it surfaced, and one action per row: go work on this
 * person. No charts, no trend lines, no vanity numbers — this is the screen a
 * ministry opens on Monday morning to decide who gets called first.
 */
export function CommandCenterPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const directionParam = searchParams.get('direction') as Direction | null;
  const [minScore, setMinScore] = useState(25);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [recomputing, setRecomputing] = useState(false);

  const { items, isLoading } = useNriTriage({
    direction: directionParam ?? undefined,
    minScore,
    limit: 100,
  });

  const setDirection = (direction: Direction | null) => {
    setSearchParams(direction ? { direction } : {});
  };

  const recompute = async () => {
    setRecomputing(true);
    try {
      await api.nri.recompute();
      // Give the queue a beat, then let React Query refetch on its own cadence.
      window.location.reload();
    } finally {
      setRecomputing(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Command center"
        description="Who to look at next, and exactly why."
        actions={
          <Button variant="outline" size="sm" onClick={recompute} disabled={recomputing}>
            <RefreshCw className={cn(recomputing && 'animate-spin')} />
            {recomputing ? 'Rescoring…' : 'Rescore everyone'}
          </Button>
        }
      />

      <div className="p-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <FilterPill active={!directionParam} onClick={() => setDirection(null)}>
            All directions
          </FilterPill>
          {NRI_DIRECTIONS.map((direction) => (
            <FilterPill
              key={direction}
              active={directionParam === direction}
              onClick={() => setDirection(direction)}
              className={`chip-${direction}`}
            >
              {DIRECTION_META[direction].label}
            </FilterPill>
          ))}

          <span className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
            Show at or above
            <select
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="h-8 rounded border border-input bg-transparent px-2 text-sm [&>option]:bg-card"
            >
              <option value={25}>Watch (25)</option>
              <option value={50}>Needs attention (50)</option>
              <option value={75}>Urgent (75)</option>
            </select>
          </span>
        </div>

        {directionParam && (
          <p className="mb-4 rounded-lg border-l-2 border-primary bg-muted/40 px-4 py-3 text-sm">
            <span className="font-medium">{DIRECTION_META[directionParam].label}</span>
            {' — '}
            {DIRECTION_META[directionParam].description}
            {' '}
            <span className="text-muted-foreground">{DIRECTION_META[directionParam].response}</span>
          </p>
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Reading signals…</p>
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center">
            <p className="font-medium">Nothing at this level.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              No member is scoring at or above {minScore}
              {directionParam ? ` on ${DIRECTION_META[directionParam].label}` : ''}. That is a good
              day — or a sign the roster needs importing.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <TriageRow
                key={item.member.id}
                item={item}
                expanded={expanded === item.member.id}
                onToggle={() =>
                  setExpanded(expanded === item.member.id ? null : item.member.id)
                }
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function TriageRow({
  item, expanded, onToggle,
}: {
  item: TriageItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { member, compass } = item;
  const dominant = DIRECTION_META[compass.dominant];

  return (
    <div className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-accent/50"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}

        <span className="w-10 shrink-0 text-right text-lg font-semibold tabular">
          {compass.peak}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">
            {member.first_name} {member.last_name}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {member.household_name ?? 'No household'}
            {' · '}
            Last contact {relativeDays(member.last_contact_at)}
          </span>
        </span>

        <span className="hidden shrink-0 sm:block">
          <BandBadge band={compass.band} />
        </span>

        <CompassChips compass={compass} className="shrink-0" />
      </button>

      {expanded && <TriageDetail memberId={member.id} dominantLabel={dominant.label} />}
    </div>
  );
}

function TriageDetail({ memberId, dominantLabel }: { memberId: string; dominantLabel: string }) {
  const { explanations, dismiss, restore, isLoading } = useNriSignals(memberId);

  if (isLoading) {
    return <p className="border-t px-4 py-3 text-sm text-muted-foreground">Loading reasons…</p>;
  }

  const worthShowing = explanations.filter((e) => e.score > 0 || e.dismissed);

  return (
    <div className="space-y-3 border-t bg-muted/20 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Leading direction: <span className="font-medium text-foreground">{dominantLabel}</span>
        </p>
        <Button variant="outline" size="sm" asChild>
          <Link to={`/members/${memberId}`}>Open member</Link>
        </Button>
      </div>

      {worthShowing.length === 0 ? (
        <p className="text-sm text-muted-foreground">All four directions are clear.</p>
      ) : (
        worthShowing.map((explanation) => (
          <SignalExplanation
            key={explanation.direction}
            explanation={explanation}
            onDismiss={dismiss}
            onRestore={restore}
          />
        ))
      )}
    </div>
  );
}

function FilterPill({
  active, onClick, children, className,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-sm transition-colors',
        active
          ? 'border-primary bg-primary/10 font-medium text-primary'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        active && className,
      )}
    >
      {children}
    </button>
  );
}
