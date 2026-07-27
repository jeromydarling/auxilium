import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { AlertTriangle, Check, Info, Undo2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { describeError } from '@/lib/errors';

/**
 * Telling somebody what just happened.
 *
 * Hand-written rather than a toast library, for the reason the CSV parser and
 * the Stripe client are: the surface actually needed is small, and the
 * behaviour that matters here is behaviour most libraries make you fight.
 *
 * Four decisions, each of which is the reason this is not a thin wrapper around
 * something off the shelf:
 *
 * **Errors do not disappear.** Success auto-dismisses after four seconds
 * because the page already shows the result. An error does not, ever, on a
 * timer — the failure mode of every toast library's default is a message that
 * fades while somebody is reading it, and the thing they were told was that a
 * member's record did not save. It goes when it is dismissed, or when the same
 * action succeeds.
 *
 * **Undo is a real second action, not a promise.** The write has already
 * happened by the time the bar appears, and Undo reverses it. The alternative —
 * holding the action for ten seconds and cancelling it — loses the work if the
 * tab closes in between, which is the one thing this pass exists to prevent.
 *
 * **Repeats bump a count.** Ten failed saves produce one toast saying it has
 * happened ten times, the same rule the alert table follows and for the same
 * reason: a stack of identical messages is how a notification channel gets
 * ignored. Dedupe is on the message, so two different failures still stack.
 *
 * **It is announced.** Errors are `assertive`, everything else `polite`. A
 * visual-only toast tells a screen reader user nothing, and this is the layer
 * that says whether their work was saved.
 */

export type ToastKind = 'error' | 'success' | 'info' | 'undo';

interface ToastRecord {
  id: number;
  kind: ToastKind;
  title: string;
  detail?: string;
  /** How many times this same message has arrived while still on screen. */
  count: number;
  /** Undo toasts only. Runs the reversing action. */
  onUndo?: () => void | Promise<void>;
  /** Retryable failures only. Re-runs what failed. */
  onRetry?: () => void | Promise<void>;
  /** Shown small and monospaced, for quoting into a bug report. */
  requestId?: string | null;
  /** Wall-clock ms this toast should live for. Infinity for errors. */
  ttl: number;
  /** Dedupe key — the message, unless the caller gives a better one. */
  key: string;
}

export interface ToastApi {
  /** Anything thrown. Runs it through `describeError` for the wording. */
  error: (error: unknown, options?: { onRetry?: () => void | Promise<void> }) => void;
  success: (title: string, detail?: string) => void;
  info: (title: string, detail?: string) => void;
  /**
   * Confirm a completed action and offer to reverse it.
   *
   * The action must already have happened. `onUndo` is what puts it back.
   */
  undo: (title: string, onUndo: () => void | Promise<void>, detail?: string) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Long enough to notice and reach, short enough not to sit in the way. */
const UNDO_MS = 10_000;
const SUCCESS_MS = 4_000;
const MAX_VISIBLE = 4;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((toast: Omit<ToastRecord, 'id' | 'count'>) => {
    setToasts((current) => {
      const existing = current.find((t) => t.key === toast.key && t.kind === toast.kind);
      if (existing) {
        // Same thing again. Bump rather than stack — but take the newest
        // callbacks, because a retry handler closes over the attempt that
        // failed and the older one may reference a stale form.
        return current.map((t) =>
          t.id === existing.id
            ? { ...t, count: t.count + 1, onRetry: toast.onRetry, onUndo: toast.onUndo }
            : t,
        );
      }
      const record: ToastRecord = { ...toast, id: nextId.current++, count: 1 };
      // Oldest out first, and never drop an error to make room for a success.
      const next = [...current, record];
      if (next.length <= MAX_VISIBLE) return next;
      const droppable = next.findIndex((t) => t.kind !== 'error');
      return droppable === -1
        ? next.slice(next.length - MAX_VISIBLE)
        : [...next.slice(0, droppable), ...next.slice(droppable + 1)];
    });
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      error: (error, options) => {
        const described = describeError(error);
        push({
          kind: 'error',
          title: described.title,
          detail: described.detail,
          requestId: described.requestId,
          // Only offer retry when trying again could plausibly work. A retry
          // button on a 403 teaches people the buttons here do nothing.
          onRetry: described.retryable ? options?.onRetry : undefined,
          ttl: Infinity,
          key: `${described.title}${described.detail ?? ''}`,
        });
      },
      success: (title, detail) =>
        push({ kind: 'success', title, detail, ttl: SUCCESS_MS, key: title }),
      info: (title, detail) =>
        push({ kind: 'info', title, detail, ttl: SUCCESS_MS, key: title }),
      undo: (title, onUndo, detail) =>
        push({ kind: 'undo', title, detail, onUndo, ttl: UNDO_MS, key: title }),
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

/**
 * Never throws when there is no provider.
 *
 * A missing provider must not be able to crash a page — the toast layer exists
 * to handle failure, and a version of it that becomes a second failure is worse
 * than none. Outside a provider the calls no-op and errors go to the console,
 * which is exactly what happened before this existed.
 */
export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  return useMemo(
    () =>
      context ?? {
        error: (error) => console.error('[toast] no provider mounted', error),
        success: () => {},
        info: () => {},
        undo: () => {},
        dismiss: () => {},
      },
    [context],
  );
}

function ToastViewport({
  toasts, onDismiss,
}: {
  toasts: ToastRecord[];
  onDismiss: (id: number) => void;
}) {
  return (
    // Two regions rather than one: a single container has to pick a politeness,
    // and an assertive region interrupts a screen reader mid-sentence for every
    // "Saved" — which is how people switch the announcements off.
    <>
      <div
        aria-live="assertive"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-0 right-0 z-[100] flex w-full max-w-sm flex-col gap-2 p-4"
      >
        {toasts.filter((t) => t.kind === 'error').map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={onDismiss} />
        ))}
      </div>
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-0 right-0 z-[99] flex w-full max-w-sm flex-col gap-2 p-4"
      >
        {toasts.filter((t) => t.kind !== 'error').map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={onDismiss} />
        ))}
      </div>
    </>
  );
}

const STYLES: Record<ToastKind, { icon: typeof Info; ring: string; tint: string }> = {
  error: { icon: AlertTriangle, ring: 'border-destructive/40', tint: 'text-destructive' },
  success: { icon: Check, ring: 'border-cura/40', tint: 'text-cura' },
  info: { icon: Info, ring: 'border-border', tint: 'text-muted-foreground' },
  undo: { icon: Undo2, ring: 'border-border', tint: 'text-muted-foreground' },
};

function ToastCard({
  toast, onDismiss,
}: {
  toast: ToastRecord;
  onDismiss: (id: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  const { icon: Icon, ring, tint } = STYLES[toast.kind];

  // Restarted whenever the count bumps, so a repeat of the same message gets
  // its full time rather than inheriting the tail of the previous one.
  useEffect(() => {
    if (!Number.isFinite(toast.ttl)) return;
    const timer = setTimeout(() => onDismiss(toast.id), toast.ttl);
    return () => clearTimeout(timer);
  }, [toast.id, toast.ttl, toast.count, onDismiss]);

  const run = async (fn: () => void | Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      onDismiss(toast.id);
    } finally {
      // The toast is gone on success; on failure it stays and the button comes
      // back, because an Undo that silently did nothing is the worst outcome
      // available here.
      setBusy(false);
    }
  };

  return (
    <div
      role={toast.kind === 'error' ? 'alert' : 'status'}
      className={cn(
        'pointer-events-auto rounded-lg border bg-card p-3 shadow-lg',
        'motion-safe:animate-in motion-safe:slide-in-from-bottom-2 motion-safe:fade-in',
        ring,
      )}
    >
      <div className="flex items-start gap-2.5">
        <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', tint)} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {toast.title}
            {toast.count > 1 && (
              <span className="ml-1.5 font-normal text-muted-foreground">
                ({toast.count} times)
              </span>
            )}
          </p>
          {toast.detail && (
            <p className="mt-0.5 text-sm text-muted-foreground">{toast.detail}</p>
          )}

          {(toast.onUndo || toast.onRetry) && (
            <div className="mt-2 flex gap-2">
              {toast.onUndo && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(toast.onUndo!)}
                  className="rounded border px-2 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50"
                >
                  {busy ? 'Undoing…' : 'Undo'}
                </button>
              )}
              {toast.onRetry && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(toast.onRetry!)}
                  className="rounded border px-2 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50"
                >
                  {busy ? 'Trying…' : 'Try again'}
                </button>
              )}
            </div>
          )}

          {toast.requestId && (
            // Shown rather than logged. When somebody reports this, the id is
            // what ties their sentence to the exact server log line and Sentry
            // event — and asking them to open a console is not a thing that
            // happens.
            <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">
              Reference {toast.requestId}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          className="-m-1 rounded p-1 text-muted-foreground hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
