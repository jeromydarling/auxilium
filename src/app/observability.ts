/**
 * Error reporting in the browser.
 *
 * In `src/app` rather than `src/lib` on purpose: this touches `window`, the
 * network, and a module loaded at runtime, and `src/lib` is where the pure,
 * plain-Node-testable half of the product lives. The wording of an error is
 * pure and lives in `src/lib/errors.ts`; the machinery that *transmits* one
 * does not.
 *
 * Three properties, in the order they matter:
 *
 * **It works with no Sentry at all.** Every error is recorded to a small local
 * ring buffer whatever else happens, and the bug report form attaches it. That
 * is not a fallback for a missing key — it is the primary path, because a
 * ministry staff member describing a problem in their own words plus the three
 * errors that preceded it is more useful than a stack trace with no account of
 * what somebody was trying to do. Sentry, when configured, is the second copy.
 *
 * **It costs the browser almost nothing.** The transmitting half is a
 * hand-written client — see `sentry-client.ts` for why `@sentry/react` was
 * measured, rejected, and removed — and it is dynamically imported after first
 * paint, only for a signed-in staff user. A member reading their bill, and a
 * stranger filling in an application, never fetch it at all.
 *
 * **It cannot become the failure.** Every entry point is wrapped. Reporting
 * that throws would turn a handled error into an unhandled one, and the place
 * this is called from most is the error boundary — the last thing standing
 * between a bad render and a white page.
 */

import { describeError } from '@/lib/errors';

export interface ErrorContext {
  /** Where in the product. 'staff-app', 'site-builder', 'portal'. */
  area?: string;
  /** React's own trace, when an error boundary caught it. */
  componentStack?: string;
  /** Ties a browser failure to the exact server log line. */
  requestId?: string | null;
  [key: string]: unknown;
}

export interface RecordedError {
  at: string;
  message: string;
  area?: string;
  status?: number;
  requestId?: string | null;
  route: string;
}

/**
 * Deliberately small.
 *
 * A bug report wants the handful of things that happened just before somebody
 * decided to write to us, not a session log. Twenty entries is more than anyone
 * reads and small enough that it can be attached to a report without thinking
 * about the size of the request.
 */
const BUFFER_LIMIT = 20;
const buffer: RecordedError[] = [];

let client: import('./sentry-client').SentryClient | null = null;
let initialising = false;

export function reportError(error: unknown, context: ErrorContext = {}): void {
  try {
    const described = describeError(error);
    const message =
      described.technical ??
      (error instanceof Error ? error.message : described.title);

    buffer.push({
      at: new Date().toISOString(),
      message,
      area: context.area,
      status: described.status,
      requestId: context.requestId ?? described.requestId,
      route: typeof location === 'undefined' ? '' : location.pathname + location.search,
    });
    if (buffer.length > BUFFER_LIMIT) buffer.splice(0, buffer.length - BUFFER_LIMIT);

    // Kept even when Sentry is live. Somebody debugging with the console open
    // should not have to go to a website to see what just happened.
    console.error('[auxilium]', message, context);

    client?.capture(error, { ...context, status: described.status });
  } catch {
    // Reporting must never be the thing that breaks. Not even a console call
    // is safe to assume in every embedded browser.
  }
}

/** What the bug report attaches. Newest last, which is how it reads. */
export function recentErrors(): RecordedError[] {
  return [...buffer];
}

export interface ObservabilityConfig {
  /** Absent means Sentry is off. Everything else still works. */
  dsn?: string | null;
  environment?: string;
  release?: string;
  /**
   * Identifies the staff account. Deliberately id and role only — no email, no
   * name. Auxilium's whole argument is care with other people's records, and a
   * roster of ministry staff email addresses sitting in a third-party error
   * tracker would be a thing we could not defend.
   */
  user?: { id: string; role: string; orgId: string } | null;
}

/**
 * Start Sentry, if there is anything to start.
 *
 * Idempotent, non-blocking, and it resolves rather than rejects on failure: a
 * blocked or failed SDK load must leave the app working exactly as it did
 * before, with the local buffer still filling.
 */
export async function initObservability(config: ObservabilityConfig): Promise<void> {
  if (!config.dsn || client || initialising) return;
  initialising = true;

  try {
    const { SentryClient } = await import('./sentry-client');
    const started = new SentryClient({
      dsn: config.dsn,
      environment: config.environment ?? 'development',
      release: config.release,
      user: config.user,
    });
    // A malformed DSN parses to nothing rather than throwing. Leaving `client`
    // null in that case means every later `reportError` skips the transmit and
    // still fills the local buffer, which is the behaviour we want from a typo
    // in configuration.
    client = started.enabled ? started : null;
  } catch (cause) {
    console.warn('[auxilium] error reporting could not start', cause);
  } finally {
    initialising = false;
  }
}


