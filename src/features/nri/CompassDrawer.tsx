import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Compass, X, ArrowRight, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useNriSessionEngine } from '@/hooks/nri/useNriSessionEngine';
import { useNriCompass } from '@/hooks/nri/useNriCompass';
import { useNriAutoOpen, useNriGlow } from '@/hooks/nri/useNriAutoOpen';
import { AskPanel } from './AskPanel';
import { useNriGuide } from '@/hooks/nri/useNriGuide';
import { DIRECTION_META, NRI_DIRECTIONS } from '@/lib/nri/directions';
import type { Direction } from '@/lib/api';

/**
 * The compass — Auxilium's one ambient surface.
 *
 * It holds three things and nothing else: the ministry's current posture,
 * today's nudges, and (for someone new) a note about the section they are
 * standing in. It can open itself, but rarely — see useNriAutoOpen for why
 * that budget is spent so carefully.
 */
export function CompassLauncher() {
  const [isOpen, setIsOpen] = useState(false);
  const glowing = useNriGlow(isOpen);
  const { nudges } = useNriSessionEngine();

  useNriAutoOpen(isOpen, setIsOpen);
  useNriGuide(isOpen, setIsOpen);

  const actionable = nudges.filter((n) => n.kind === 'action').length;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={cn(
          'fixed bottom-5 right-5 z-40 flex h-12 items-center gap-2 rounded-full border bg-card px-4 shadow-lg',
          'transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          glowing && 'animate-signal-glow',
        )}
        aria-label="Open the NRI compass"
      >
        <Compass className="h-5 w-5 text-primary" />
        <span className="text-sm font-medium">Compass</span>
        {actionable > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-semibold text-destructive-foreground tabular">
            {actionable}
          </span>
        )}
      </button>

      {isOpen && <CompassPanel onClose={() => setIsOpen(false)} />}
    </>
  );
}

function CompassPanel({ onClose }: { onClose: () => void }) {
  const { nudges, dismiss, isLoading } = useNriSessionEngine();
  const { posture } = useNriCompass();
  const { currentGuide, sectionGuide, completeGuide, guideActive } = useNriGuide(true, () => {});
  const guide = currentGuide ?? sectionGuide;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l bg-card shadow-xl"
        role="dialog"
        aria-label="NRI compass"
      >
        <header className="flex items-start justify-between border-b p-4">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <Compass className="h-4 w-4" /> Narrative Relational Intelligence
            </h2>
            <p className="mt-1 text-lg font-semibold">{posture.label} posture</p>
            <p className="text-sm text-muted-foreground">{posture.description}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X />
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          <CompassRose weights={posture.weights} />

          <Separator className="my-4" />

          {/* Ask sits above Today deliberately. Today is what the software
              noticed; Ask is what the person walked in with, and the person's
              own question outranks ours. */}
          <AskPanel onNavigate={onClose} />

          <Separator className="my-4" />

          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Today
          </h3>

          {isLoading ? (
            <p className="mt-3 text-sm text-muted-foreground">Reading the board…</p>
          ) : nudges.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Nothing left for today. Everything current has been seen.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {nudges.map((nudge) => (
                <li key={nudge.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={cn(
                        'inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-xs font-medium',
                        `chip-${nudge.direction}`,
                      )}
                    >
                      {DIRECTION_META[nudge.direction as Direction].label}
                    </span>
                    <button
                      type="button"
                      onClick={() => dismiss(nudge.id)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Dismiss
                    </button>
                  </div>
                  <p className="mt-2 text-sm">{nudge.message}</p>
                  {nudge.action && (
                    <Link
                      to={nudge.action.route}
                      onClick={onClose}
                      className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                    >
                      {nudge.action.label} <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}

          {guide && guideActive && (
            <>
              <Separator className="my-4" />
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <BookOpen className="h-4 w-4 text-primary" /> {guide.title}
                </h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{guide.body}</p>
                {guide.tryThis && (
                  <p className="mt-2 text-sm font-medium">Try: {guide.tryThis}</p>
                )}
                <button
                  type="button"
                  onClick={completeGuide}
                  className="mt-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  Stop showing these
                </button>
              </div>
            </>
          )}
        </div>

        <footer className="border-t p-4">
          <Link
            to="/nri"
            onClick={onClose}
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Open the command center <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </footer>
      </aside>
    </>
  );
}

/**
 * The compass rose: four bars, one per direction, showing where the pressure
 * actually is. A shape rather than a table — the point is to be readable in
 * the half-second before someone decides what to do next.
 */
function CompassRose({ weights }: { weights: Record<Direction, number> }) {
  const max = Math.max(1, ...NRI_DIRECTIONS.map((d) => weights[d]));

  return (
    <div className="space-y-2">
      {NRI_DIRECTIONS.map((direction) => {
        const meta = DIRECTION_META[direction];
        const value = weights[direction];
        return (
          <div key={direction} className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-xs font-medium">{meta.label}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${(value / max) * 100}%`,
                  backgroundColor: `hsl(var(--${direction}))`,
                }}
              />
            </div>
            <span className="w-6 shrink-0 text-right text-xs tabular text-muted-foreground">
              {value}
            </span>
          </div>
        );
      })}
    </div>
  );
}
