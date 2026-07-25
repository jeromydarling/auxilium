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
import { handleImportBatch } from './queues/imports';
import { handleSignalBatch } from './queues/signals';

/**
 * The Auxilium Worker.
 *
 * One deployable serves the whole product: Hono handles /api/*, and everything
 * else falls through to the ASSETS binding, which serves the built React SPA
 * with single-page-application fallback so client routes resolve.
 *
 * Queue consumers are exported from the same module, so import commits and NRI
 * recomputes run in the same code with the same bindings as the request path —
 * no second deployable to keep in sync.
 */

const app = new Hono<AppEnv>();

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

  const healthy = checks.d1 === 'ok';

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

app.notFound((c) => {
  if (c.req.path.startsWith('/api/')) {
    return c.json({ error: 'No such endpoint.' }, 404);
  }
  // Non-API paths are the SPA's business.
  return c.env.ASSETS.fetch(c.req.raw);
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

  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    switch (batch.queue) {
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
