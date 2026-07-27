import { createContext, lazy, Suspense, useCallback, useContext, useMemo, useRef, useState } from 'react';

/**
 * The dialog is loaded on demand, not with the provider.
 *
 * The provider is mounted for the whole staff session but renders nothing until
 * something asks. A static import would drag the dialog primitive into the
 * eager chunk, which is the cost the audience split exists to avoid — so the
 * markup lives in its own module and arrives the first time somebody is asked
 * to confirm anything.
 */
const ConfirmDialog = lazy(() => import('./confirm-dialog'));

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
      {request && (
        // No fallback: a confirmation that flashed a spinner before asking the
        // question would read as the action already having started.
        <Suspense fallback={null}>
          <ConfirmDialog request={request} onSettle={settle} />
        </Suspense>
      )}
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
