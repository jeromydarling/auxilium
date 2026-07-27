import { History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { describeAge, type DraftVerdict } from '@/lib/drafts';

/**
 * "You have unsaved changes from 20 minutes ago."
 *
 * A bar above the editor rather than a modal on load. A modal would be the
 * first thing somebody meets every time they open a page they once left
 * half-edited, including the times they no longer want the draft — and a modal
 * people dismiss reflexively is one they dismiss on the day it mattered.
 *
 * Both buttons are stated as outcomes rather than as yes and no. "Restore" and
 * "Discard" say what happens; "OK" and "Cancel" require somebody to
 * reconstruct which is which from the sentence above, at the exact moment they
 * are anxious about having lost work.
 */
export function DraftRecovery({
  verdict, onRecover, onDiscard,
}: {
  verdict: DraftVerdict;
  onRecover: () => void;
  onDiscard: () => void;
}) {
  if (!verdict.offer) return null;

  return (
    <div
      // `status`, not `alert`. Unsaved work being available is good news, and
      // an assertive announcement interrupts a screen reader to say so.
      role="status"
      className="mb-4 rounded-lg border border-onus/40 bg-onus/5 p-3"
    >
      <div className="flex flex-wrap items-start gap-2.5">
        <History className="mt-0.5 h-4 w-4 shrink-0 text-onus" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            You have unsaved changes from {describeAge(verdict.savedAt, Date.now())}.
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {verdict.conflict
              ? // Named plainly, because the alternative is somebody silently
                // reverting a colleague's afternoon. We cannot merge the two
                // and should not pretend to — the person is the only one who
                // knows which sentences matter.
                'Somebody has saved this page since you started editing. Restoring your version will replace theirs, so it is worth looking at what is here first.'
              : 'They were kept on this device when the page closed. Nothing has been published.'}
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant={verdict.conflict ? 'outline' : 'default'} onClick={onRecover}>
              Restore my changes
            </Button>
            <Button size="sm" variant="ghost" onClick={onDiscard}>
              Discard them
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
