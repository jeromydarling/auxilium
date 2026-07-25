import { cn } from '@/lib/utils';
import { DIRECTION_META } from '@/lib/nri/directions';
import type { Direction, Band, Compass } from '@/lib/api';

/**
 * The direction chip — the smallest unit of NRI in the interface.
 *
 * A letter, a number, and a fixed colour. It appears beside names in lists,
 * so it has to be readable at a glance and never ambiguous: amber is always
 * Onus, rose is always Cura. The colours are not decorative anywhere in this
 * product.
 */

const CHIP_CLASS: Record<Direction, string> = {
  cura: 'chip-cura',
  onus: 'chip-onus',
  familia: 'chip-familia',
  fides: 'chip-fides',
};

export function DirectionChip({
  direction, score, band, showLabel = false, className,
}: {
  direction: Direction;
  score: number;
  band?: Band;
  showLabel?: boolean;
  className?: string;
}) {
  const meta = DIRECTION_META[direction];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium tabular',
        CHIP_CLASS[direction],
        // Urgent chips get weight, not animation. A blinking list is unusable.
        band === 'urgent' && 'font-semibold ring-1 ring-current/40',
        className,
      )}
      title={`${meta.label} ${score} — ${meta.description}`}
    >
      <span>{showLabel ? meta.label : meta.label[0]}</span>
      <span>{score}</span>
    </span>
  );
}

/**
 * A member's live directions, ordered by score. Dismissed and low-scoring
 * directions are omitted — a row of four chips where three read "0" trains
 * people to stop looking at chips.
 */
export function CompassChips({
  compass, threshold = 25, showLabels = false, className,
}: {
  compass: Compass | null;
  threshold?: number;
  showLabels?: boolean;
  className?: string;
}) {
  if (!compass) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const live = compass.explanations
    .filter((e) => !e.dismissed && e.score >= threshold)
    .sort((a, b) => b.score - a.score);

  if (live.length === 0) {
    return <span className="text-xs text-muted-foreground">Clear</span>;
  }

  return (
    <span className={cn('inline-flex flex-wrap gap-1', className)}>
      {live.map((e) => (
        <DirectionChip
          key={e.direction}
          direction={e.direction}
          score={e.score}
          band={e.band}
          showLabel={showLabels}
        />
      ))}
    </span>
  );
}

const BAND_CLASS: Record<Band, string> = {
  urgent: 'bg-destructive/15 text-destructive border-destructive/30',
  attend: 'bg-onus/15 text-onus border-onus/30',
  watch: 'bg-muted text-muted-foreground border-border',
  clear: 'bg-muted/50 text-muted-foreground border-border',
};

const BAND_LABEL: Record<Band, string> = {
  urgent: 'Urgent',
  attend: 'Needs attention',
  watch: 'Watch',
  clear: 'Clear',
};

export function BandBadge({ band, className }: { band: Band; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium', BAND_CLASS[band], className)}>
      {BAND_LABEL[band]}
    </span>
  );
}
