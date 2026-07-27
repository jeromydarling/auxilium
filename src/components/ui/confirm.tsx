import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/**
 * Asking before something that cannot be walked back.
 *
 * Used sparingly and on purpose. Most actions in this product get an undo bar
 * instead, because a dialog in front of every delete is a dialog people learn
 * to dismiss without reading — and once that habit exists, the confirmation in
 * front of the one genuinely irreversible action is dismissed too. Every
 * confirm added here makes the remaining ones weaker, so the bar for adding one
 * is that undo is genuinely impossible.
 *
 * Three rules the wording follows, all enforced by `ConfirmRequest` being
 * awkward to fill in vaguely:
 *
 * **Name the consequence, not the action.** "Are you sure?" tests nothing —
 * somebody who mis-clicked is just as sure as somebody who meant it. "This
 * creates 4 member records and cannot be undone" is a fact they can check
 * against what they intended.
 *
 * **Count what will happen.** A number is the difference between a dialog
 * people read and one they click through. "Import 128 rows" catches the case
 * where somebody expected 12.
 *
 * **Label the button with the verb.** Not "OK". Somebody scanning sees the
 * word "Commit" or "Release" and it either matches their intent or it does not.
 */

export interface ConfirmRequest {
  title: string;
  /** What will happen, in numbers where there are any. */
  body: string;
  /** The verb. Never "OK" and never "Yes". */
  confirmLabel: string;
  /** Styles the button as destructive. Off for merely irreversible-but-normal. */
  destructive?: boolean;
}

type Confirm = (request: ConfirmRequest) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback<Confirm>((next) => {
    setRequest(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = useCallback((ok: boolean) => {
    setRequest(null);
    // Always resolves, including on dismiss. A promise left hanging when
    // somebody presses Escape leaves the caller's `busy` flag stuck on and the
    // button disabled forever — the screen quietly stops working, which is a
    // worse outcome than whatever the dialog was guarding.
    resolver.current?.(ok);
    resolver.current = null;
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={request !== null} onOpenChange={(open) => !open && settle(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {request?.destructive && (
                <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden />
              )}
              {request?.title}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{request?.body}</p>
          <div className="flex justify-end gap-2">
            {/* Cancel first in the DOM and visually left, so the keyboard lands
                on the safe option and a reflexive Enter does nothing. */}
            <Button variant="ghost" onClick={() => settle(false)}>
              Cancel
            </Button>
            <Button
              variant={request?.destructive ? 'destructive' : 'default'}
              onClick={() => settle(true)}
            >
              {request?.confirmLabel}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

/**
 * Returns a function that resolves true when somebody confirms.
 *
 * Outside a provider it resolves **false** rather than true. A missing provider
 * must fail towards not doing the irreversible thing; the opposite default
 * would turn a wiring mistake into a silent loss of somebody's data.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useConfirm(): Confirm {
  const context = useContext(ConfirmContext);
  return useMemo(
    () =>
      context ??
      (async () => {
        console.error('[confirm] no provider mounted — refusing rather than assuming yes');
        return false;
      }),
    [context],
  );
}
