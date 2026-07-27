/**
 * A hand-written Sentry client for the browser.
 *
 * `@sentry/react` was tried first and measured at **149KB gzipped** in its own
 * lazy chunk — larger than the entire rest of the application's shared bundle,
 * which had just been split by audience to get it down to 96KB. Sentry's
 * tree-shaking flags and an empty `integrations: []` took it from 163KB to
 * 149KB and left the session-replay recorder in the build regardless.
 *
 * That is the wrong trade for this product twice over. Once on size: staff open
 * this on ministry office hardware and hotel wifi, and a sixth of a megabyte to
 * transmit an error is not a rounding error. And once on what it contains —
 * session replay records the screen, and the screen here is somebody's medical
 * claim. A recorder that ships in the bundle is a recorder one configuration
 * mistake away from running.
 *
 * So this is the same call as the hand-written CSV parser and the hand-written
 * Stripe client, for the same stated reason: the surface actually needed is
 * small, it runs somewhere bundle size is real, and writing it is how the
 * behaviour stays exactly what was intended. What is needed here is one POST to
 * one documented endpoint.
 *
 * What is deliberately *not* reimplemented: breadcrumbs, tracing, replay,
 * offline queueing, and rate limiting beyond a simple cap. Each is real
 * functionality this product does not want.
 *
 * Source maps still work. Sentry resolves them server-side from `release` plus
 * the frame's `abs_path`, so uploading maps for a release is all that is needed
 * — nothing in the client has to change.
 */

export interface SentryConfig {
  dsn: string;
  environment: string;
  release?: string;
  user?: { id: string; role: string; orgId: string } | null;
}

interface ParsedDsn {
  url: string;
  publicKey: string;
}

/**
 * `https://<key>@<host>/<projectId>` → the envelope endpoint.
 *
 * Returns null rather than throwing on a malformed DSN. A typo in
 * configuration must degrade to "reporting is off", never to an exception on
 * boot — this module is loaded to handle failures, not to add one.
 */
export function parseDsn(dsn: string): ParsedDsn | null {
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\//, '');
    if (!url.username || !projectId) return null;
    return {
      publicKey: url.username,
      url: `${url.protocol}//${url.host}/api/${projectId}/envelope/`,
    };
  } catch {
    return null;
  }
}

/**
 * A ceiling on events per page load.
 *
 * A render loop that throws can produce thousands of identical errors in
 * seconds. Without a cap that is a self-inflicted denial of service against our
 * own quota, and the twenty-first copy of one error is worth nothing anyway.
 */
const MAX_EVENTS = 25;

export class SentryClient {
  private sent = 0;
  private readonly endpoint: ParsedDsn | null;

  constructor(private readonly config: SentryConfig) {
    this.endpoint = parseDsn(config.dsn);
  }

  get enabled(): boolean {
    return this.endpoint !== null;
  }

  capture(error: unknown, context: Record<string, unknown> = {}): void {
    if (!this.endpoint || this.sent >= MAX_EVENTS) return;
    this.sent++;

    try {
      const body = this.envelope(this.event(error, context));

      // `keepalive` so an error thrown during a navigation still leaves the
      // page — which is exactly when the interesting ones happen. Fire and
      // forget: a failed report must never surface anywhere, least of all as
      // an unhandled rejection that reports itself.
      void fetch(this.endpoint.url, {
        method: 'POST',
        body,
        keepalive: true,
        // Deliberately not `application/json`: the envelope is newline
        // delimited JSON, and this content type is what keeps the request a
        // CORS simple request so no preflight is needed.
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        // Never send cookies to a third party. There is nothing here Sentry
        // needs to authenticate beyond the key in the query string.
        credentials: 'omit',
      }).catch(() => {});
    } catch {
      // Building the event failed. Nothing to do but not make it worse.
    }
  }

  private envelope(event: Record<string, unknown>): string {
    const header = {
      event_id: event.event_id,
      sent_at: new Date().toISOString(),
      dsn: this.config.dsn,
    };
    return `${JSON.stringify(header)}\n${JSON.stringify({ type: 'event' })}\n${JSON.stringify(event)}`;
  }

  private event(error: unknown, context: Record<string, unknown>): Record<string, unknown> {
    const err = error instanceof Error ? error : new Error(String(error));

    return {
      event_id: eventId(),
      timestamp: Date.now() / 1000,
      platform: 'javascript',
      level: 'error',
      logger: 'auxilium',
      environment: this.config.environment,
      release: this.config.release,
      sdk: { name: 'auxilium.browser', version: '1' },
      tags: {
        // The tag that lets one Sentry project hold both halves of the app.
        // The Worker sets 'server'. Nothing sets a default, so an untagged
        // event is a bug rather than something quietly mislabelled.
        side: 'browser',
        ...(this.config.user ? { org: this.config.user.orgId, role: this.config.user.role } : {}),
        ...(typeof context.area === 'string' ? { area: context.area } : {}),
      },
      // Id only, never email or name. A roster of ministry staff addresses
      // sitting in a third-party error tracker is not a thing this product
      // could defend, given what the rest of it argues about other people's
      // records.
      user: this.config.user ? { id: this.config.user.id } : undefined,
      request: {
        // Ids stripped. Sentry groups by stack, not URL, so this costs nothing
        // diagnostically and closes the one route by which this integration
        // could carry a ministry's records off-site. The query string goes
        // entirely: on the members page it is a name somebody typed.
        url: redactPath(location.pathname),
      },
      contexts: { auxilium: scrub(context) },
      exception: {
        values: [
          {
            type: err.name || 'Error',
            value: err.message,
            stacktrace: { frames: parseStack(err.stack) },
            mechanism: { type: 'generic', handled: true },
          },
        ],
      },
    };
  }
}

/** 32 lowercase hex characters, per the envelope spec. */
function eventId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Only scalars leave the browser.
 *
 * A shape allowlist rather than a blocklist of known-sensitive field names: a
 * name list goes stale the first time somebody adds a field, and it fails
 * silently and in the wrong direction. Long strings are dropped on the grounds
 * that anything that long in an error context is content rather than an
 * identifier — a member note, a denial reason, a search.
 */
function scrub(context: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'number' || typeof value === 'boolean') safe[key] = value;
    else if (typeof value === 'string') {
      safe[key] = value.length <= 200 ? value : '[dropped: too long to be an identifier]';
    } else safe[key] = '[dropped: not a scalar]';
  }
  return safe;
}

/** `/app/members/mem_01H9/needs` → `/app/members/:id/needs`. */
export function redactPath(path: string): string {
  return path
    .split('/')
    .map((segment) =>
      /^[a-z]{2,8}_[A-Za-z0-9]{6,}$/.test(segment) || /^[A-Za-z0-9_-]{16,}$/.test(segment)
        ? ':id'
        : segment,
    )
    .join('/');
}

/**
 * A stack string into frames Sentry can group and symbolicate.
 *
 * Handles the two formats that matter: V8/Chromium/Node
 * (`at fn (url:line:col)`) and Firefox/Safari (`fn@url:line:col`). Anything it
 * cannot parse is skipped rather than guessed at — a frame with a wrong line
 * number sends somebody to the wrong place in the file, which is worse than
 * one fewer frame.
 *
 * **Frames are reversed.** Sentry renders oldest-first, and a JS stack is
 * newest-first. Getting this backwards puts the throwing line at the top of the
 * list where the entry point should be, and every stack in the project reads
 * inside out.
 */
export function parseStack(stack: string | undefined): Record<string, unknown>[] {
  if (!stack) return [];

  const frames: Record<string, unknown>[] = [];
  for (const line of stack.split('\n').slice(0, 50)) {
    const v8 = /^\s*at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?\s*$/.exec(line);
    const spider = !v8 ? /^\s*(.*?)@(.+?):(\d+):(\d+)\s*$/.exec(line) : null;
    const match = v8 ?? spider;
    if (!match) continue;

    const [, fn, file, lineNo, colNo] = match;
    frames.push({
      function: fn?.trim() || '<anonymous>',
      abs_path: file,
      filename: file,
      lineno: Number(lineNo),
      colno: Number(colNo),
      // Ours, versus a browser extension or an injected script. Sentry uses
      // this to decide which frame to show as the culprit, and marking
      // everything in-app makes the culprit an extension's content script on
      // the machines where that matters most.
      in_app: file.includes('/assets/') || file.includes('/app'),
    });
  }
  return frames.reverse();
}
