import { Hono } from 'hono';
import type { Env, ImportJob, SignalJob } from './lib/env';
import type { AppEnv } from './lib/auth';
import { first } from './lib/db';
import authRoutes from './api/auth';
import memberRoutes from './api/members';
import householdRoutes from './api/households';
import needRoutes from './api/needs';
import prayerRoutes from './api/prayer';
import importRoutes from './api/imports';
import nriRoutes from './api/nri';
import adminRoutes from './api/admin';
import cmsRoutes from './api/cms';
import integrityRoutes from './api/integrity';
import claimsRoutes from './api/claims';
import billingRoutes from './api/billing';
import migrationRoutes from './api/migration';
import knowledgeRoutes from './api/knowledge';
import memberAuthRoutes from './api/member-auth';
import applicationRoutes, { publicApplications } from './api/applications';
import stripeWebhookRoutes from './api/stripe-webhook';
import marketingRoutes, { serveMinistryDomain } from './marketing';
import { orgByHost } from './lib/domain-service';
import { normalizeDomain } from '../src/lib/cms/domains';
import { renderNotFound } from './marketing/render';
import { closeAllDuePeriods } from './lib/billing-service';
import { handleImportBatch } from './queues/imports';
import { handleSignalBatch } from './queues/signals';

/**
 * The Auxilium Worker.
 *
 * One deployable serves the whole product: server-rendered marketing at the
 * site root, Hono on /api/*, and the React SPA under /app via the ASSETS
 * binding.
 *
 * Queue consumers are exported from the same module, so import commits and NRI
 * recomputes run in the same code with the same bindings as the request path —
 * no second deployable to keep in sync.
 */

const app = new Hono<AppEnv>();

/**
 * Custom domains, checked before anything else.
 *
 * A request that arrived on a ministry's own verified domain is that ministry's
 * site and nothing else. This sits ahead of the API and the marketing router
 * rather than inside them, because on a custom domain the precedence inverts:
 * `/` is the ministry's home page, and `/pricing` is the ministry's page called
 * pricing. Letting such a request fall through would serve Auxilium's marketing
 * site under somebody else's brand and, at `/sitemap.xml`, hand out a list of
 * every other ministry using the product.
 *
 * The cost when `APP_HOST` matches — the overwhelmingly common case — is one
 * string comparison and no database work at all. An unrecognised host costs one
 * indexed lookup and then behaves exactly as the platform, which is the right
 * answer for a preview URL, a health-check probe, or a stale DNS record
 * pointing here from a domain nobody has claimed.
 */
app.use('*', async (c, next) => {
  const appHost = c.env.APP_HOST ? normalizeDomain(c.env.APP_HOST) : null;
  const host = normalizeDomain(c.req.header('host') ?? '');

  if (!appHost || !host || host === appHost) return next();

  const org = await orgByHost(c.env, host);
  if (!org) return next();

  c.set('ministryDomain', org.slug);
  return serveMinistryDomain(c, org.slug);
});

/**
 * Health check. Reports whether each binding actually answers, not merely
 * whether it is configured — a D1 binding that is present but pointed at a
 * database with no tables is exactly the failure this needs to catch.
 */
app.get('/api/health', async (c) => {
  const checks: Record<string, string> = {};

  try {
    const row = await first<{ count: number }>(
      c.env.DB,
      "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'members'",
    );
    checks.d1 = row?.count ? 'ok' : 'no tables — run: bun run db:migrate:local';
  } catch (error) {
    checks.d1 = `error: ${error instanceof Error ? error.message : 'unknown'}`;
  }

  try {
    await c.env.CACHE.get('__health');
    checks.kv_cache = 'ok';
  } catch {
    checks.kv_cache = 'unavailable';
  }

  try {
    await c.env.CONFIG.get('__health');
    checks.kv_config = 'ok';
  } catch {
    checks.kv_config = 'unavailable';
  }

  try {
    await c.env.DOCUMENTS.head('__health');
    checks.r2 = 'ok';
  } catch {
    checks.r2 = 'unavailable';
  }

  // Queues have no read API; presence of the binding is all we can assert here.
  checks.queue_imports = c.env.IMPORT_QUEUE ? 'bound' : 'missing';
  checks.queue_signals = c.env.SIGNAL_QUEUE ? 'bound' : 'missing';

  // Billing is optional. Reported as three states rather than two, because
  // "key present, webhook secret missing" is a real and confusing
  // configuration: payments would be taken and never recorded.
  checks.billing = !c.env.STRIPE_SECRET_KEY
    ? 'not configured'
    : c.env.STRIPE_WEBHOOK_SECRET
      ? 'ok'
      : 'partial — STRIPE_WEBHOOK_SECRET is unset, so settled payments will not be recorded';

  // Sessions.
  //
  // Without SESSION_SECRET, production refuses to issue one — a predictable
  // signing key in production is worse than an outage. That refusal is correct
  // and deliberate, but it was invisible here: health reported "ok" while not a
  // single person, staff or member, could log in. A green check on an app
  // nobody can sign into is worse than no check, because it sends whoever is
  // debugging to look everywhere else first.
  checks.sessions = c.env.SESSION_SECRET
    ? 'ok'
    : c.env.APP_ENV === 'production'
      ? 'SESSION_SECRET is unset — nobody can sign in. Set it with: wrangler secret put SESSION_SECRET --env production'
      : 'development key (fine locally, never in production)';

  const healthy = checks.d1 === 'ok' && !checks.sessions.startsWith('SESSION_SECRET is unset');

  return c.json(
    {
      status: healthy ? 'ok' : 'degraded',
      app: c.env.APP_NAME ?? 'Auxilium',
      env: c.env.APP_ENV ?? 'development',
      checks,
      time: new Date().toISOString(),
    },
    healthy ? 200 : 503,
  );
});

app.route('/api/auth', authRoutes);
app.route('/api/members', memberRoutes);
app.route('/api/households', householdRoutes);
app.route('/api/needs', needRoutes);
app.route('/api/prayer', prayerRoutes);
app.route('/api/imports', importRoutes);
app.route('/api/nri', nriRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/cms', cmsRoutes);
app.route('/api/integrity', integrityRoutes);
app.route('/api/claims', claimsRoutes);
app.route('/api/billing', billingRoutes);
app.route('/api/migration', migrationRoutes);
app.route('/api/knowledge', knowledgeRoutes);
app.route('/api/member', memberAuthRoutes);
app.route('/api/applications', applicationRoutes);
// Mounted separately from the staff routes above so that no auth middleware can
// be applied to the wrong half by accident. This is the only public write path
// in the product besides the Stripe webhook.
app.route('/api/apply', publicApplications);

/**
 * The Stripe webhook, mounted outside the authenticated routes on purpose.
 *
 * It authenticates by signature rather than by session — Stripe has no cookie —
 * so it must not sit behind requireUser. See the file for why it verifies
 * before parsing and why an unknown event type still returns 200.
 */
app.route('/api/stripe/webhook', stripeWebhookRoutes);

/**
 * Public marketing owns the site root; the application lives under /app.
 *
 * Mounted after /api/* so it can never shadow an endpoint, and it falls
 * through to notFound for anything not in the content registry — which is what
 * lets /app/* reach the SPA below.
 */
app.route('/', marketingRoutes);

app.notFound((c) => {
  const path = c.req.path;

  if (path.startsWith('/api/')) {
    return c.json({ error: 'No such endpoint.' }, 404);
  }

  // The SPA and its bundles. The assets binding is configured for
  // single-page-application fallback, so /app/members/mem_xxx resolves to
  // index.html rather than 404ing.
  const isApp = path === '/app' || path.startsWith('/app/');
  const isStaticFile = /\.[a-z0-9]{2,5}$/i.test(path);

  if (isApp || isStaticFile) {
    return c.env.ASSETS.fetch(c.req.raw);
  }

  // Anything else is a genuine miss on the public site. Serving the SPA shell
  // here would return 200 for a URL that does not exist — a soft 404, which
  // search engines treat as a quality problem and which leaves a visitor
  // staring at a loading app instead of being told the page is gone.
  return c.html(renderNotFound(), 404);
});

/**
 * Error handler. Logs the detail, returns a message a human can act on, and
 * never leaks a stack trace to the browser.
 */
app.onError((error, c) => {
  console.error(`[error] ${c.req.method} ${c.req.path}:`, error);
  return c.json(
    {
      error: 'Something went wrong on our end. The team has been notified.',
      request_id: c.req.header('CF-Ray') ?? null,
    },
    500,
  );
});

/**
 * Both queues share one consumer entry, dispatched by name.
 *
 * `MessageBatch<unknown>` is the honest signature — the runtime hands us
 * whatever was enqueued, and the narrowing to a job type is only sound because
 * we just checked which queue it came from.
 */
export default {
  fetch: app.fetch,

  /**
   * The monthly close.
   *
   * Runs on the 1st and calculates the platform fee for the month that just
   * ended, for every organization. Deliberately scheduled a few hours into the
   * day rather than at midnight: card settlement is not instantaneous, and
   * closing a month the second it ends invoices before the last of its money
   * has landed.
   *
   * `closePeriod` is idempotent and refuses to close a period that has not
   * ended, so a retried or double-fired cron cannot double-bill.
   */
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      (async () => {
        const now = new Date(event.scheduledTime);
        const results = await closeAllDuePeriods(env, now);
        const invoiced = results.filter((r) => r.status === 'invoiced').length;
        const failed = results.filter((r) => r.status === 'failed').length;
        console.log(
          `[billing] monthly close: ${results.length} organizations, ` +
            `${invoiced} invoiced, ${failed} failed`,
        );
      })(),
    );
  },

  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    // Queues are per-environment (auxilium-imports, auxilium-imports-prod), so
    // dispatch on the family rather than the literal name. Matching exactly
    // would send every production message to the default branch below — which
    // acks, and so would discard real import and signal jobs silently instead
    // of failing where someone would see it.
    //
    // The suffix is stripped rather than prefix-matched so that a dead-letter
    // queue (auxilium-imports-prod-dlq) never resolves to the normal handler:
    // messages land there precisely because that handler already failed them.
    const family = batch.queue.replace(/-(?:preview|prod)$/, '');

    switch (family) {
      case 'auxilium-imports':
        return handleImportBatch(batch as MessageBatch<ImportJob>, env);
      case 'auxilium-signals':
        return handleSignalBatch(batch as MessageBatch<SignalJob>, env);
      default:
        console.warn(`[queue] no handler for "${batch.queue}" — acking to avoid a retry loop`);
        batch.ackAll();
    }
  },
} satisfies ExportedHandler<Env>;
