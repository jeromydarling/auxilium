import { Hono } from 'hono';
import { requireUser, requireRole, currentUser, type AppEnv } from '../lib/auth';
import { first } from '../lib/db';
import { param } from '../lib/http';
import { audit } from '../lib/audit';
import { nowIso } from '../../src/lib/utils';
import { stripeConfigured, StripeError } from '../lib/stripe';
import {
  getBillingAccount,
  startOnboarding,
  syncAccountState,
  listPeriods,
  closePeriod,
  reconcilePeriod,
} from '../lib/billing-service';
import { periodKey, previousPeriod, settlePeriod } from '../../src/lib/billing/period';
import {
  PRICING_BANDS,
  MINIMUM_MONTHLY_CENTS,
  platformFeeCents,
  blendedRateBps,
  formatDollars,
  formatRate,
} from '../../src/lib/pricing/tiers';

/**
 * Billing.
 *
 * Money-facing, so everything here is leadership-only and everything
 * consequential is written to the audit log. The one exception is the rate
 * card, which is deliberately readable by any signed-in user — a ministry's
 * staff should not have to ask what their own software costs.
 */
const billing = new Hono<AppEnv>();
billing.use('*', requireUser);

const requireLeadership = requireRole('owner', 'admin');

/**
 * The published rate card, straight from the pricing engine.
 *
 * The marketing site derives its pricing page from this same module, so the
 * number a prospect saw and the number a customer is billed cannot drift.
 */
billing.get('/rates', (c) =>
  c.json({
    minimum_monthly_cents: MINIMUM_MONTHLY_CENTS,
    minimum_monthly: formatDollars(MINIMUM_MONTHLY_CENTS),
    bands: PRICING_BANDS.map((b) => ({
      label: b.label,
      rate_bps: b.rateBps,
      rate: formatRate(b.rateBps),
      up_to_cents: b.upToCents,
    })),
    notes: [
      'Bands are marginal. Crossing a threshold lowers the rate on additional volume only.',
      'Measured on settled member contribution volume, net of refunds.',
      'No per-claim fee, no per-seat licence, no implementation fee.',
      'Payment processing is billed at cost and shown separately.',
    ],
  }),
);

/** Where this ministry stands: connected, onboarded, able to accept money. */
billing.get('/status', requireLeadership, async (c) => {
  const user = (await currentUser(c))!;
  const account = await getBillingAccount(c.env, user.org_id);

  return c.json({
    configured: stripeConfigured(c.env),
    connected: Boolean(account),
    charges_enabled: account ? account.charges_enabled === 1 : false,
    payouts_enabled: account ? account.payouts_enabled === 1 : false,
    details_submitted: account ? account.details_submitted === 1 : false,
    outstanding: account?.requirements_note ?? null,
    stripe_account_id: account?.stripe_account_id ?? null,
    // Said plainly rather than left to be inferred from a missing key.
    message: stripeConfigured(c.env)
      ? account
        ? account.charges_enabled === 1
          ? 'Connected and able to accept contributions.'
          : 'Connected, but Stripe still needs information before charges can be accepted.'
        : 'Not connected yet. Start onboarding to accept contributions through Auxilium.'
      : 'Billing is not configured on this environment. Everything else works normally.',
  });
});

/**
 * Begin or resume Stripe onboarding.
 *
 * Returns a fresh single-use link every time, because account links expire in
 * minutes — handing back a cached one produces an error page the ministry
 * cannot act on.
 */
billing.post('/connect', requireLeadership, async (c) => {
  if (!stripeConfigured(c.env)) {
    return c.json(
      {
        error: 'Billing is not configured on this environment.',
        detail: 'Set STRIPE_SECRET_KEY to enable payments. Nothing else is affected.',
      },
      503,
    );
  }

  const user = (await currentUser(c))!;
  const org = await first<{ name: string }>(
    c.env.DB,
    `SELECT name FROM organizations WHERE id = ?`,
    user.org_id,
  );

  try {
    const origin = new URL(c.req.url).origin;
    const result = await startOnboarding(
      c.env,
      { orgId: user.org_id, orgName: org?.name ?? 'Ministry', email: user.email, origin },
      new Date(),
    );

    await audit(c.env.DB, {
      orgId: user.org_id,
      actorId: user.id,
      actorKind: 'user',
      action: 'billing.onboarding_started',
      subjectType: 'billing_account',
      subjectId: result.accountId,
    });

    return c.json({ url: result.url, stripe_account_id: result.accountId });
  } catch (error) {
    const message = error instanceof StripeError ? error.message : 'Could not reach Stripe.';
    return c.json({ error: message }, 502);
  }
});

/** Re-read capability state from Stripe. Cheap, and the honest way to refresh. */
billing.post('/sync', requireLeadership, async (c) => {
  if (!stripeConfigured(c.env)) return c.json({ error: 'Billing is not configured.' }, 503);

  const user = (await currentUser(c))!;
  try {
    const account = await syncAccountState(c.env, user.org_id, new Date());
    if (!account) return c.json({ error: 'This ministry is not connected to Stripe.' }, 404);
    return c.json({
      charges_enabled: account.charges_enabled === 1,
      payouts_enabled: account.payouts_enabled === 1,
      details_submitted: account.details_submitted === 1,
      outstanding: account.requirements_note,
    });
  } catch (error) {
    const message = error instanceof StripeError ? error.message : 'Could not reach Stripe.';
    return c.json({ error: message }, 502);
  }
});

/** Invoice history, plus what the current open month is running at. */
billing.get('/periods', requireLeadership, async (c) => {
  const user = (await currentUser(c))!;
  const rows = await listPeriods(c.env, user.org_id);

  return c.json({
    periods: rows.map((r) => {
      const settlement = settlePeriod(r.period, r.settled_volume_cents, r.refunded_cents);
      return {
        period: r.period,
        status: r.status,
        settled_volume_cents: r.settled_volume_cents,
        refunded_cents: r.refunded_cents,
        net_volume_cents: settlement.netVolumeCents,
        // For a closed period, the stored fee is authoritative — it is what was
        // actually invoiced, under whatever schedule applied at the time.
        platform_fee_cents: r.platform_fee_cents ?? settlement.platformFeeCents,
        platform_fee: formatDollars(r.platform_fee_cents ?? settlement.platformFeeCents),
        blended_rate: formatRate(settlement.blendedRateBps),
        at_minimum: settlement.atMinimum,
        invoice_url: r.stripe_invoice_url,
        failure_reason: r.failure_reason,
      };
    }),
  });
});

/**
 * What this month is costing so far.
 *
 * An estimate, and labelled as one: the month is still open, so more volume may
 * settle. A ministry should be able to see the bill forming rather than meet it
 * at month end.
 */
billing.get('/current', requireLeadership, async (c) => {
  const user = (await currentUser(c))!;
  const period = periodKey(new Date());
  const rows = await listPeriods(c.env, user.org_id, 1);
  const row = rows.find((r) => r.period === period);

  const gross = row?.settled_volume_cents ?? 0;
  const refunded = row?.refunded_cents ?? 0;
  const settlement = settlePeriod(period, gross, refunded);

  return c.json({
    period,
    estimate: true,
    net_volume_cents: settlement.netVolumeCents,
    platform_fee_cents: settlement.platformFeeCents,
    platform_fee: formatDollars(settlement.platformFeeCents),
    blended_rate: formatRate(settlement.blendedRateBps),
    at_minimum: settlement.atMinimum,
    note: 'The month is still open. This is what the fee would be if it closed now.',
  });
});

/**
 * Close and invoice a month by hand.
 *
 * The cron does this automatically; this exists for the month the cron missed,
 * and for re-running a period whose invoicing failed. It refuses to close a
 * month that has not ended, and it cannot double-invoice.
 */
billing.post('/periods/:period/close', requireLeadership, async (c) => {
  const user = (await currentUser(c))!;
  const period = param(c, 'period');

  if (!/^\d{4}-\d{2}$/.test(period)) {
    return c.json({ error: 'Period must look like 2026-07.' }, 400);
  }

  const result = await closePeriod(c.env, user.org_id, period, new Date());

  await audit(c.env.DB, {
    orgId: user.org_id,
    actorId: user.id,
    actorKind: 'user',
    action: 'billing.period_closed',
    subjectType: 'billing_period',
    subjectId: period,
    meta: { status: result.status, fee_cents: result.settlement.platformFeeCents },
  });

  return c.json({
    period: result.period,
    status: result.status,
    platform_fee_cents: result.settlement.platformFeeCents,
    platform_fee: formatDollars(result.settlement.platformFeeCents),
    net_volume_cents: result.settlement.netVolumeCents,
    invoice_url: result.invoiceUrl ?? null,
    skipped: result.skipped ?? null,
  });
});

/**
 * Estimate a fee for a hypothetical volume.
 *
 * Powers the "what would this cost us" question during a sales conversation,
 * against exactly the arithmetic that will bill them.
 */
/**
 * Reconcile a month against Stripe.
 *
 * Read-only, and reports rather than repairs. See `reconcilePeriod` for why: a
 * reconciler that silently inserts contributions is a second, unaudited path
 * into the ledger a ministry is being asked to stand behind.
 */
billing.get('/periods/:period/reconcile', requireLeadership, async (c) => {
  const user = (await currentUser(c))!;
  const period = param(c, 'period');

  if (!/^\d{4}-\d{2}$/.test(period)) {
    return c.json({ error: 'Use a month, like 2026-07.' }, 400);
  }

  const result = await reconcilePeriod(c.env, user.org_id, period);

  // Written to the audit log when it does not balance, and only then. A clean
  // reconciliation every night would bury the one that mattered.
  if (result.status === 'discrepancy') {
    await audit(c.env.DB, {
      orgId: user.org_id, actorId: user.id, actorKind: 'user',
      action: 'billing.reconciliation_discrepancy',
      subjectType: 'billing_period', subjectId: period,
      meta: {
        stripe_cents: result.stripe.cents,
        ledger_cents: result.ledger.cents,
        missing_from_ledger: result.missing_from_ledger.length,
        missing_from_stripe: result.missing_from_stripe.length,
      },
    });
  }

  return c.json(result);
});

billing.get('/estimate', async (c) => {
  const raw = c.req.query('volume_cents');
  const volume = Number.parseInt(raw ?? '', 10);

  if (!Number.isFinite(volume) || volume < 0) {
    return c.json({ error: 'Pass volume_cents as a non-negative integer.' }, 400);
  }

  const fee = platformFeeCents(volume);
  return c.json({
    volume_cents: volume,
    platform_fee_cents: fee,
    platform_fee: formatDollars(fee),
    blended_rate: formatRate(blendedRateBps(volume)),
    at_minimum: fee === MINIMUM_MONTHLY_CENTS,
    computed_at: nowIso(),
  });
});

export default billing;
export { previousPeriod };
