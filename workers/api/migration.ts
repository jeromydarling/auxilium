import { Hono } from 'hono';
import { requireUser, requireRole, currentUser, type AppEnv } from '../lib/auth';
import { param } from '../lib/http';
import { audit } from '../lib/audit';
import { all, first, run } from '../lib/db';
import { newId } from '../../src/lib/ids';
import { nowIso } from '../../src/lib/utils';
import { parseCsv } from '../../src/lib/import/csv';
import {
  PROCESSORS,
  processorByKey,
  requestTemplate,
  expectations,
} from '../../src/lib/migration/processors';
import {
  validateManifest,
  reconcile,
  nextBillingDate,
  type ManifestRow,
  type StripeMappingRow,
} from '../../src/lib/migration/manifest';

/**
 * The migration wizard.
 *
 * Auxilium's job here is orchestration, not custody. It works out what to ask
 * the old processor for, checks the manifest before a ten-day round trip is
 * spent on a malformed file, reconciles Stripe's returned mapping against the
 * roster, and shows per-member status through the dual-run window.
 *
 * It never receives card data. `/manifest` refuses any upload containing
 * something that passes a Luhn check, before a byte is stored.
 */
const migration = new Hono<AppEnv>();
migration.use('*', requireUser);

const requireLeadership = requireRole('owner', 'admin');

/** The processors we have guidance for, and what each can actually release. */
migration.get('/processors', (c) =>
  c.json({
    processors: PROCESSORS.map((p) => ({
      key: p.key,
      label: p.label,
      supports: p.supports,
      typical_export_days: p.typicalExportDays,
      notes: p.requestNotes,
      ...expectations(p),
    })),
  }),
);

/** Start a migration, and hand back the letter to send. */
migration.post('/', requireLeadership, async (c) => {
  const user = (await currentUser(c))!;
  const body = await c.req.json<{ processor: string; merchant_id?: string }>();

  const processor = processorByKey(body.processor);
  if (!processor) {
    return c.json({ error: 'Unknown processor. Call /api/migration/processors for the list.' }, 400);
  }

  const org = await first<{ name: string }>(
    c.env.DB,
    `SELECT name FROM organizations WHERE id = ?`,
    user.org_id,
  );

  const id = newId('procMigration');
  await run(
    c.env.DB,
    `INSERT INTO processor_migrations (id, org_id, source_processor, source_merchant_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    id,
    user.org_id,
    processor.key,
    body.merchant_id ?? null,
    nowIso(),
    nowIso(),
  );

  await audit(c.env.DB, {
    orgId: user.org_id,
    actorId: user.id,
    actorKind: 'user',
    action: 'migration.started',
    subjectType: 'processor_migration',
    subjectId: id,
    meta: { processor: processor.key },
  });

  return c.json({
    id,
    processor: processor.label,
    ...expectations(processor),
    request_letter: requestTemplate({
      processor,
      ministryName: org?.name ?? 'Our ministry',
      merchantId: body.merchant_id,
      contactName: user.name ?? undefined,
    }),
  });
});

/**
 * Upload the metadata manifest.
 *
 * The card-data check runs on the raw text first. If it fires, nothing is
 * parsed, nothing is stored, and the response says plainly what to do instead —
 * an administrator who exported "everything" needs to know why the file was
 * refused, not just that it was.
 */
migration.post('/:id/manifest', requireLeadership, async (c) => {
  const user = (await currentUser(c))!;
  const id = param(c, 'id');

  const owned = await first<{ id: string }>(
    c.env.DB,
    `SELECT id FROM processor_migrations WHERE id = ? AND org_id = ? AND deleted_at IS NULL`,
    id,
    user.org_id,
  );
  if (!owned) return c.json({ error: 'No such migration.' }, 404);

  const raw = await c.req.text();
  const parsed = parseCsv(raw);

  // parseCsv keys each row by its header, so look up by name — case- and
  // whitespace-insensitively, because a real export's header row is never as
  // tidy as the template said it would be.
  const rows: ManifestRow[] = parsed.rows.map((row) => {
    const lookup = new Map(
      Object.entries(row).map(([key, value]) => [key.trim().toLowerCase(), value]),
    );
    const get = (name: string) => (lookup.get(name) ?? '').trim();
    const num = (name: string) => {
      const v = Number.parseInt(get(name), 10);
      return Number.isFinite(v) ? v : undefined;
    };
    return {
      legacy_customer_id: get('legacy_customer_id') || get('customer_id') || get('profile_id'),
      email: get('email') || undefined,
      member_number: get('member_number') || get('member_id') || undefined,
      last4: get('last4') || undefined,
      exp_month: num('exp_month'),
      exp_year: num('exp_year'),
      method: (get('method') as ManifestRow['method']) || 'unknown',
      wallet: (get('wallet') as ManifestRow['wallet']) || 'none',
      amount_cents: num('amount_cents'),
      billing_day: num('billing_day'),
    };
  });

  const report = validateManifest(rows, raw);

  const blocked = report.issues.some((i) => i.code === 'card_data_present');
  if (blocked) {
    // Deliberately audited. Somebody nearly sent us card numbers, and that is
    // worth a record even though — especially because — we refused it.
    await audit(c.env.DB, {
      orgId: user.org_id,
      actorId: user.id,
      actorKind: 'user',
      action: 'migration.manifest_refused_card_data',
      subjectType: 'processor_migration',
      subjectId: id,
    });
    return c.json({ report }, 422);
  }

  const statements = rows
    .filter((r) => r.legacy_customer_id)
    .map((r) =>
      c.env.DB.prepare(
        `INSERT INTO processor_migration_rows
           (id, migration_id, org_id, legacy_customer_id, email, member_number, last4,
            exp_month, exp_year, method, wallet, amount_cents, billing_day, status,
            created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (migration_id, legacy_customer_id) DO UPDATE SET
           email = excluded.email, member_number = excluded.member_number,
           last4 = excluded.last4, amount_cents = excluded.amount_cents,
           billing_day = excluded.billing_day, updated_at = excluded.updated_at`,
      ).bind(
        newId('procMigrationRow'),
        id,
        user.org_id,
        r.legacy_customer_id,
        r.email ?? null,
        r.member_number ?? null,
        r.last4 ?? null,
        r.exp_month ?? null,
        r.exp_year ?? null,
        r.method ?? 'unknown',
        r.wallet ?? 'none',
        r.amount_cents ?? null,
        r.billing_day ?? null,
        r.wallet === 'google_pay' ? 'excluded' : 'listed',
        nowIso(),
        nowIso(),
      ),
    );

  if (statements.length) await c.env.DB.batch(statements);

  await run(
    c.env.DB,
    `UPDATE processor_migrations
        SET status = 'manifest', total_rows = ?, ready_rows = ?, flagged_rows = ?,
            manual_rows = ?, apple_pay_rows = ?, google_pay_rows = ?, updated_at = ?
      WHERE id = ? AND org_id = ?`,
    report.total,
    report.ready,
    report.flagged,
    report.manual,
    report.wallets.apple_pay,
    report.wallets.google_pay,
    nowIso(),
    id,
    user.org_id,
  );

  return c.json({ report });
});

/**
 * Reconcile Stripe's returned mapping against the roster.
 *
 * Matching is member number, then email, and then it stops. An unmatched row is
 * a name on a short list for staff to resolve; a wrongly matched row debits a
 * family that never agreed to it.
 */
migration.post('/:id/reconcile', requireLeadership, async (c) => {
  const user = (await currentUser(c))!;
  const id = param(c, 'id');
  const body = await c.req.json<{ mapping: StripeMappingRow[] }>();

  if (!Array.isArray(body.mapping) || body.mapping.length === 0) {
    return c.json({ error: 'Send Stripe’s mapping file as { mapping: [...] }.' }, 400);
  }

  const manifest = await all<ManifestRow & { id: string }>(
    c.env.DB,
    `SELECT id, legacy_customer_id, email, member_number, amount_cents, billing_day
       FROM processor_migration_rows WHERE migration_id = ? AND org_id = ?`,
    id,
    user.org_id,
  );

  const members = await all<{ id: string; email: string | null; member_number: string | null }>(
    c.env.DB,
    `SELECT id, email, member_number FROM members WHERE org_id = ? AND deleted_at IS NULL`,
    user.org_id,
  );

  const result = reconcile(manifest, body.mapping, members);

  const statements = result.rows.map((row) =>
    c.env.DB.prepare(
      `UPDATE processor_migration_rows
          SET stripe_customer_id = ?, stripe_payment_method_id = ?, member_id = ?,
              match_method = ?, status = ?, updated_at = ?
        WHERE migration_id = ? AND legacy_customer_id = ? AND org_id = ?`,
    ).bind(
      row.stripe_customer_id,
      row.stripe_payment_method_id ?? null,
      row.member_id,
      row.match_method,
      row.member_id ? 'matched' : 'needs_attention',
      nowIso(),
      id,
      row.legacy_customer_id,
      user.org_id,
    ),
  );

  if (statements.length) await c.env.DB.batch(statements);

  await run(
    c.env.DB,
    `UPDATE processor_migrations SET status = 'reconciling', updated_at = ? WHERE id = ? AND org_id = ?`,
    nowIso(),
    id,
    user.org_id,
  );

  await audit(c.env.DB, {
    orgId: user.org_id,
    actorId: user.id,
    actorKind: 'user',
    action: 'migration.reconciled',
    subjectType: 'processor_migration',
    subjectId: id,
    meta: { matched: result.matched, unmatched: result.unmatched },
  });

  return c.json({
    matched: result.matched,
    unmatched: result.unmatched,
    needs_attention: result.rows.filter((r) => !r.member_id).map((r) => r.legacy_customer_id),
  });
});

/**
 * The dual-run dashboard.
 *
 * The question this answers is the only one that matters before switching the
 * old processor off: who has actually been charged successfully here, and who
 * still needs a phone call.
 */
migration.get('/:id/status', requireLeadership, async (c) => {
  const user = (await currentUser(c))!;
  const id = param(c, 'id');

  const record = await first<{
    id: string; source_processor: string; status: string;
    total_rows: number; apple_pay_rows: number; google_pay_rows: number;
  }>(
    c.env.DB,
    `SELECT * FROM processor_migrations WHERE id = ? AND org_id = ? AND deleted_at IS NULL`,
    id,
    user.org_id,
  );
  if (!record) return c.json({ error: 'No such migration.' }, 404);

  const counts = await all<{ status: string; n: number }>(
    c.env.DB,
    `SELECT status, COUNT(*) AS n FROM processor_migration_rows
      WHERE migration_id = ? AND org_id = ? GROUP BY status`,
    id,
    user.org_id,
  );

  const attention = await all<{ legacy_customer_id: string; email: string | null; wallet: string; issue: string | null }>(
    c.env.DB,
    `SELECT legacy_customer_id, email, wallet, issue FROM processor_migration_rows
      WHERE migration_id = ? AND org_id = ? AND status IN ('needs_attention', 'excluded')
      ORDER BY wallet DESC LIMIT 200`,
    id,
    user.org_id,
  );

  const byStatus = Object.fromEntries(counts.map((r) => [r.status, r.n]));
  const charged = byStatus.charged ?? 0;

  return c.json({
    id: record.id,
    processor: processorByKey(record.source_processor)?.label ?? record.source_processor,
    status: record.status,
    total: record.total_rows,
    by_status: byStatus,
    // The only number worth putting in front of a board.
    safely_across: charged,
    still_to_resolve: attention.length,
    wallets: { apple_pay: record.apple_pay_rows, google_pay: record.google_pay_rows },
    needs_attention: attention,
    guidance:
      charged === 0
        ? 'Keep billing through your current processor. Nothing has been charged here yet.'
        : charged < record.total_rows
          ? 'Run both platforms until every member here shows a successful charge. Do not switch the old one off yet.'
          : 'Every member has been charged successfully through Auxilium. The old processor can be retired.',
  });
});

/** Billing anchors for the rebuilt subscriptions, so nobody is double-charged. */
migration.get('/:id/schedule', requireLeadership, async (c) => {
  const user = (await currentUser(c))!;
  const id = param(c, 'id');
  const from = new Date();

  const rows = await all<{ legacy_customer_id: string; member_id: string | null; amount_cents: number | null; billing_day: number | null }>(
    c.env.DB,
    `SELECT legacy_customer_id, member_id, amount_cents, billing_day
       FROM processor_migration_rows
      WHERE migration_id = ? AND org_id = ? AND member_id IS NOT NULL`,
    id,
    user.org_id,
  );

  return c.json({
    schedule: rows.map((r) => ({
      legacy_customer_id: r.legacy_customer_id,
      member_id: r.member_id,
      amount_cents: r.amount_cents,
      next_charge: r.billing_day ? nextBillingDate(r.billing_day, from).toISOString() : null,
      note: r.billing_day
        ? null
        : 'No billing day recorded, so this member needs a date chosen by hand.',
    })),
  });
});

export default migration;
