import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { ConfirmRequest } from './confirm';

/**
 * The markup for a confirmation, split out so it can be lazily loaded.
 *
 * See `confirm.tsx` for why the wording rules are what they are; this file is
 * only the rendering.
 */
export default function ConfirmDialog({
  request, onSettle,
}: {
  request: ConfirmRequest;
  onSettle: (ok: boolean) => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onSettle(false)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {request.destructive && (
              <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden />
            )}
            {request.title}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{request.body}</p>
        <div className="flex justify-end gap-2">
          {/* Cancel first in the DOM and visually left, so the keyboard lands
              on the safe option and a reflexive Enter does nothing. */}
          <Button variant="ghost" onClick={() => onSettle(false)}>
            Cancel
          </Button>
          <Button
            variant={request.destructive ? 'destructive' : 'default'}
            onClick={() => onSettle(true)}
          >
            {request.confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
