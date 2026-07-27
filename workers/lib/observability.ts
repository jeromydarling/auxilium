import { captureException, withScope, type CloudflareOptions } from '@sentry/cloudflare';
import type { Env } from './env';

/**
 * Error reporting from the Worker.
 *
 * `withSentry` wraps the exported handler in `workers/index.ts`. That is the
 * supported integration for Workers — the SDK needs the execution context to
 * flush before the isolate is frozen, and there is no `init()` to call without
 * it — and it turns out to be the right shape here for a reason beyond
 * necessity: it covers `fetch`, `scheduled`, and `queue` from one place. The
 * alternative was reporting by hand at each of the three entry points, which
 * is three places to forget, and the two easiest to forget are the cron and the
 * queue consumer — the two nobody is watching when they fail.
 *
 * **A missing DSN is not a degraded state.** `sentryOptions` returns undefined
 * with `SENTRY_DSN` unset, which disables the wrapper entirely; failures are
 * still logged exactly as they were before. Same rule as everywhere else in
 * this product: the absence of a third-party key changes visibility, never
 * behaviour.
 */

export function sentryOptions(env: Env): CloudflareOptions | undefined {
  if (!env.SENTRY_DSN) return undefined;

  return {
    dsn: env.SENTRY_DSN,
    environment: env.APP_ENV ?? 'development',
    release: env.APP_VERSION,
    // No tracing. This Worker serves the marketing site, every ministry site,
    // and the SPA's assets on the same handler; sampling traces across all of
    // that spends quota to say what the Workers dashboard already says, and the
    // spans would be dominated by requests that are not the product.
    tracesSampleRate: 0,
    // The tag that lets one Sentry project hold both halves of the app. The
    // browser sets 'browser' on its own events. Nothing sets a default, so an
    // untagged event is a bug rather than something silently mislabelled.
    initialScope: { tags: { side: 'server' } },
    beforeSend: scrubEvent,
  };
}

export interface ServerErrorContext {
  /** The route that failed, with ids removed. */
  route?: string;
  method?: string;
  /** Ties this to the response the browser saw, and to a bug report. */
  requestId?: string | null;
  orgId?: string | null;
  userId?: string | null;
  /** Which entry point was running: 'api', 'cron', 'queue'. */
  entry?: string;
  [key: string]: unknown;
}

/**
 * Report a server-side failure with context.
 *
 * Never throws: every caller is already handling an error, and an error handler
 * that needs its own error handler grows a second bug. Synchronous, because
 * `captureException` only queues — the wrapper flushes.
 */
export function reportServerError(
  env: Env,
  error: unknown,
  context: ServerErrorContext = {},
): void {
  // Always, and first. The Workers log is the thing that exists with no
  // configuration at all, and it is where somebody looks before they think to
  // open a website.
  console.error('[error]', context.entry ?? 'api', context.route ?? '', error);

  if (!env.SENTRY_DSN) return;

  try {
    withScope((scope) => {
      scope.setTag('entry', context.entry ?? 'api');
      if (context.route) scope.setTag('route', context.route);
      if (context.orgId) scope.setTag('org', context.orgId);
      // Searchable on its own, because a staff member quoting the reference
      // from a toast is the fastest route from "this broke" to the event.
      if (context.requestId) scope.setTag('request_id', context.requestId);
      scope.setContext('auxilium', redactContext(context));
      captureException(error);
    });
  } catch {
    // Already logged. Nothing further here is useful, and throwing would turn a
    // handled failure into an unhandled one.
  }
}

/**
 * Ids are fine; contents are not.
 *
 * An org id or a member id is an opaque token that means nothing outside this
 * database, and it is what makes an error diagnosable. Free text is a different
 * matter — a prayer request note, a denial reason, a member's search — and none
 * of it belongs in a third-party error tracker for a product whose whole
 * argument is care with other people's records.
 *
 * Written as a shape allowlist rather than a blocklist of field names: a list
 * of known-sensitive keys is a list that goes stale the first time somebody
 * adds a column, and the failure is silent and in the wrong direction.
 */
function redactContext(context: ServerErrorContext): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'number' || typeof value === 'boolean') {
      safe[key] = value;
    } else if (typeof value === 'string') {
      // An identifier, a route, a short enum — kept. A sentence — dropped, on
      // the grounds that anything that long in an error context is content.
      safe[key] = value.length <= 120 ? value : '[dropped: too long to be an identifier]';
    } else {
      safe[key] = '[dropped: not a scalar]';
    }
  }
  return safe;
}

/**
 * Last line of defence on what leaves the Worker.
 *
 * A URL here carries record ids, and a query string carries what somebody typed
 * into a member search — which is a person's name. Sentry groups by stack
 * rather than by URL, so redacting these costs nothing diagnostically and
 * closes the one way this integration could leak a ministry's records.
 */
function scrubEvent<T extends { request?: { url?: string; query_string?: unknown } }>(event: T): T {
  try {
    if (event.request?.url) {
      const url = event.request.url;
      const split = url.indexOf('?');
      event.request.url = redactRoute(split === -1 ? url : url.slice(0, split));
    }
    if (event.request?.query_string) event.request.query_string = '[redacted]';
  } catch {
    // Prefer an unscrubbed field to a dropped event; the fields that matter for
    // diagnosis are the stack and the tags, not the URL.
  }
  return event;
}

/** `/api/members/mem_01H9/contact` → `/api/members/:id/contact`. */
export function redactRoute(path: string): string {
  return path
    .split('/')
    .map((segment) =>
      /^[a-z]{2,8}_[A-Za-z0-9]{6,}$/.test(segment) || /^[A-Za-z0-9_-]{16,}$/.test(segment)
        ? ':id'
        : segment,
    )
    .join('/');
}
