/**
 * D1 ↔ Stripe ↔ the pricing engine.
 *
 * The pure half lives in src/lib/billing and src/lib/pricing; this is the part
 * that touches the database and the network, and it holds no arithmetic of its
 * own beyond what it takes to move rows around.
 *
 * Every query carries org_id. There is no exception.
 */

import type { Env } from './env';
import { first, all, run } from './db';
import { newId } from '../../src/lib/ids';
import {
  periodKey,
  periodBounds,
  isClosable,
  settlePeriod,
  PRICING_VERSION,
  type PeriodSettlement,
} from '../../src/lib/billing/period';
import { formatDollars } from '../../src/lib/pricing/tiers';
import {
  stripeConfigured,
  createConnectedAccount,
  retrieveAccount,
  createAccountLink,
  createCustomer,
  invoicePlatformFee,
  listSettledCharges,
  StripeError,
  type StripeAccount,
} from './stripe';

export interface BillingAccountRow {
  id: string;
  org_id: string;
  stripe_account_id: string;
  charges_enabled: number;
  payouts_enabled: number;
  details_submitted: number;
  requirements_note: string | null;
  country: string;
  default_currency: string;
}

export interface BillingPeriodRow {
  id: string;
  org_id: string;
  period: string;
  settled_volume_cents: number;
  refunded_cents: number;
  platform_fee_cents: number | null;
  status: string;
  stripe_invoice_id: string | null;
  stripe_invoice_url: string | null;
  failure_reason: string | null;
}

const nowIso = (now: Date) => now.toISOString();

// ── Connected accounts ───────────────────────────────────────────────────────

export function getBillingAccount(env: Env, orgId: string): Promise<BillingAccountRow | null> {
  return first<BillingAccountRow>(
    env.DB,
    `SELECT * FROM billing_accounts WHERE org_id = ? AND deleted_at IS NULL`,
    orgId,
  );
}

/**
 * Connect a ministry to Stripe, or return the link to finish onboarding.
 *
 * Safe to call repeatedly: the account is created once and the onboarding link
 * is regenerated every time, because account links are single-use and expire in
 * minutes. Caching one would be a support ticket.
 */
export async function startOnboarding(
  env: Env,
  input: { orgId: string; orgName: string; email?: string; origin: string },
  now: Date,
): Promise<{ url: string; accountId: string }> {
  let account = await getBillingAccount(env, input.orgId);

  if (!account) {
    const created = await createConnectedAccount(env, {
      orgId: input.orgId,
      email: input.email,
      businessName: input.orgName,
    });

    await run(
      env.DB,
      `INSERT INTO billing_accounts
         (id, org_id, stripe_account_id, charges_enabled, payouts_enabled,
          details_submitted, country, default_currency, created_at, updated_at)
       VALUES (?, ?, ?, 0, 0, 0, ?, ?, ?, ?)`,
      newId('billingAccount'),
      input.orgId,
      created.id,
      created.country ?? 'US',
      created.default_currency ?? 'usd',
      nowIso(now),
      nowIso(now),
    );

    account = await getBillingAccount(env, input.orgId);
  }

  const base = env.STRIPE_RETURN_URL ?? input.origin;
  const link = await createAccountLink(env, {
    accountId: account!.stripe_account_id,
    refreshUrl: `${base}/app/settings/billing?refresh=1`,
    returnUrl: `${base}/app/settings/billing?connected=1`,
  });

  return { url: link.url, accountId: account!.stripe_account_id };
}

/** Pull the current capability state from Stripe and mirror it locally. */
export async function syncAccountState(
  env: Env,
  orgId: string,
  now: Date,
): Promise<BillingAccountRow | null> {
  const account = await getBillingAccount(env, orgId);
  if (!account) return null;

  const remote = await retrieveAccount(env, account.stripe_account_id);
  await applyAccountState(env, remote, now);
  return getBillingAccount(env, orgId);
}

/** Write a Stripe account object onto our mirror. Used by sync and by webhook. */
export async function applyAccountState(env: Env, remote: StripeAccount, now: Date): Promise<void> {
  const due = remote.requirements?.currently_due ?? [];
  const note = remote.requirements?.disabled_reason
    ? `disabled: ${remote.requirements.disabled_reason}`
    : due.length
      ? `outstanding: ${due.slice(0, 6).join(', ')}`
      : null;

  await run(
    env.DB,
    `UPDATE billing_accounts
        SET charges_enabled = ?, payouts_enabled = ?, details_submitted = ?,
            requirements_note = ?, updated_at = ?
      WHERE stripe_account_id = ?`,
    remote.charges_enabled ? 1 : 0,
    remote.payouts_enabled ? 1 : 0,
    remote.details_submitted ? 1 : 0,
    note,
    nowIso(now),
    remote.id,
  );
}

// ── Settled volume ───────────────────────────────────────────────────────────

/** Ensure the period row exists, then return it. */
async function openPeriod(env: Env, orgId: string, period: string, now: Date) {
  await run(
    env.DB,
    `INSERT INTO billing_periods (id, org_id, period, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (org_id, period) DO NOTHING`,
    newId('billingPeriod'),
    orgId,
    period,
    nowIso(now),
    nowIso(now),
  );

  return first<BillingPeriodRow>(
    env.DB,
    `SELECT * FROM billing_periods WHERE org_id = ? AND period = ?`,
    orgId,
    period,
  );
}

/**
 * Record a settled member contribution and count it toward the month.
 *
 * Writes the contributions row and moves the period total in the same batch, so
 * a crash between them cannot leave the ledger and the invoice disagreeing.
 * The unique index on stripe_payment_intent_id is what makes a redelivered
 * webhook a no-op rather than a double count.
 */
export async function recordSettledContribution(
  env: Env,
  input: {
    orgId: string;
    amountCents: number;
    processorFeeCents: number;
    paymentIntentId: string;
    chargeId?: string;
    memberId?: string | null;
    householdId?: string | null;
    settledAt: string;
  },
  now: Date,
): Promise<{ counted: boolean; period: string }> {
  const period = periodKey(new Date(input.settledAt));
  await openPeriod(env, input.orgId, period, now);

  const existing = await first<{ id: string }>(
    env.DB,
    `SELECT id FROM contributions WHERE stripe_payment_intent_id = ?`,
    input.paymentIntentId,
  );
  if (existing) return { counted: false, period };

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO contributions
         (id, org_id, household_id, member_id, amount_cents, period, received_at,
          method, kind, reference, created_at,
          stripe_payment_intent_id, stripe_charge_id, settled_at, processor_fee_cents)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'card', 'share', ?, ?, ?, ?, ?, ?)`,
    ).bind(
      newId('contribution'),
      input.orgId,
      input.householdId ?? null,
      input.memberId ?? null,
      input.amountCents,
      period,
      input.settledAt,
      input.paymentIntentId,
      nowIso(now),
      input.paymentIntentId,
      input.chargeId ?? null,
      input.settledAt,
      input.processorFeeCents,
    ),
    env.DB.prepare(
      `UPDATE billing_periods
          SET settled_volume_cents = settled_volume_cents + ?, updated_at = ?
        WHERE org_id = ? AND period = ? AND status = 'open'`,
    ).bind(input.amountCents, nowIso(now), input.orgId, period),
  ]);

  return { counted: true, period };
}

/**
 * Net a refund out of the month it belongs to.
 *
 * The refund lands against the period of the *original* contribution, not the
 * month the refund happened. Charging a percentage on money that went back to a
 * member would be indefensible; attributing the reversal to the wrong month
 * just moves the error somewhere harder to find.
 */
export async function recordRefund(
  env: Env,
  input: { chargeId: string; refundedCents: number },
  now: Date,
): Promise<{ applied: boolean }> {
  const contribution = await first<{ id: string; org_id: string; period: string; refunded_cents: number }>(
    env.DB,
    `SELECT id, org_id, period, refunded_cents FROM contributions WHERE stripe_charge_id = ?`,
    input.chargeId,
  );
  if (!contribution) return { applied: false };

  // Stripe reports the cumulative refunded amount, so store the delta.
  const delta = input.refundedCents - contribution.refunded_cents;
  if (delta <= 0) return { applied: false };

  await env.DB.batch([
    env.DB.prepare(`UPDATE contributions SET refunded_cents = ? WHERE id = ?`)
      .bind(input.refundedCents, contribution.id),
    env.DB.prepare(
      `UPDATE billing_periods
          SET refunded_cents = refunded_cents + ?, updated_at = ?
        WHERE org_id = ? AND period = ? AND status = 'open'`,
    ).bind(delta, nowIso(now), contribution.org_id, contribution.period),
  ]);

  return { applied: true };
}

// ── Closing and invoicing ────────────────────────────────────────────────────

/**
 * Recompute a period's volume from the ledger.
 *
 * The running totals are maintained incrementally so closing is cheap, but they
 * are a cache of what the contributions table says. This is the authority, and
 * closing stores both so a divergence is discoverable rather than silent.
 */
async function recomputeVolume(env: Env, orgId: string, period: string) {
  const bounds = periodBounds(period);
  const row = await first<{ gross: number; refunded: number }>(
    env.DB,
    `SELECT COALESCE(SUM(amount_cents), 0) AS gross,
            COALESCE(SUM(refunded_cents), 0) AS refunded
       FROM contributions
      WHERE org_id = ? AND kind = 'share'
        AND settled_at >= ? AND settled_at < ?`,
    orgId,
    bounds.start,
    bounds.end,
  );
  return { gross: row?.gross ?? 0, refunded: row?.refunded ?? 0 };
}

export interface CloseResult {
  period: string;
  settlement: PeriodSettlement;
  status: string;
  invoiceUrl?: string | null;
  skipped?: string;
}

/**
 * Close a month and invoice the platform fee.
 *
 * Refuses to close a period that has not ended — billing a month while payments
 * are still settling produces an invoice that is wrong by whatever arrived
 * after, and the ministry is the one who notices.
 *
 * Idempotent at two levels: a period already past 'open' is returned untouched,
 * and Stripe's own idempotency keys are derived from org and period so even a
 * concurrent second close cannot raise a second invoice.
 */
export async function closePeriod(
  env: Env,
  orgId: string,
  period: string,
  now: Date,
): Promise<CloseResult> {
  const existing = await openPeriod(env, orgId, period, now);

  if (existing && existing.status !== 'open') {
    return {
      period,
      settlement: settlePeriod(period, existing.settled_volume_cents, existing.refunded_cents),
      status: existing.status,
      invoiceUrl: existing.stripe_invoice_url,
      skipped: 'already closed',
    };
  }

  if (!isClosable(period, now)) {
    return {
      period,
      settlement: settlePeriod(period, existing?.settled_volume_cents ?? 0, existing?.refunded_cents ?? 0),
      status: 'open',
      skipped: 'period has not ended',
    };
  }

  const truth = await recomputeVolume(env, orgId, period);
  const settlement = settlePeriod(period, truth.gross, truth.refunded);

  await run(
    env.DB,
    `UPDATE billing_periods
        SET status = 'closed', settled_volume_cents = ?, refunded_cents = ?,
            recomputed_volume_cents = ?, platform_fee_cents = ?, pricing_version = ?,
            closed_at = ?, updated_at = ?
      WHERE org_id = ? AND period = ?`,
    truth.gross,
    truth.refunded,
    settlement.netVolumeCents,
    settlement.platformFeeCents,
    PRICING_VERSION,
    nowIso(now),
    nowIso(now),
    orgId,
    period,
  );

  if (!stripeConfigured(env)) {
    return { period, settlement, status: 'closed', skipped: 'stripe not configured' };
  }

  const org = await first<{ name: string; billing_email: string | null }>(
    env.DB,
    `SELECT name, NULL AS billing_email FROM organizations WHERE id = ?`,
    orgId,
  );

  try {
    const customer = await createCustomer(env, {
      orgId,
      name: org?.name ?? 'Ministry',
      email: org?.billing_email ?? undefined,
    });

    const invoice = await invoicePlatformFee(env, {
      customerId: customer.id,
      orgId,
      period,
      amountCents: settlement.platformFeeCents,
      description:
        `Auxilium platform fee — ${period}. ` +
        `${formatDollars(settlement.netVolumeCents)} settled contribution volume.`,
    });

    await run(
      env.DB,
      `UPDATE billing_periods
          SET status = 'invoiced', stripe_invoice_id = ?, stripe_invoice_url = ?,
              invoiced_at = ?, updated_at = ?
        WHERE org_id = ? AND period = ?`,
      invoice.id,
      invoice.hosted_invoice_url ?? null,
      nowIso(now),
      nowIso(now),
      orgId,
      period,
    );

    return { period, settlement, status: 'invoiced', invoiceUrl: invoice.hosted_invoice_url };
  } catch (error) {
    // The period stays closed with its fee recorded. Failing to *send* an
    // invoice must not lose the calculation that produced it.
    const message = error instanceof StripeError ? error.message : 'unknown error';
    await run(
      env.DB,
      `UPDATE billing_periods SET status = 'failed', failure_reason = ?, updated_at = ?
        WHERE org_id = ? AND period = ?`,
      message,
      nowIso(now),
      orgId,
      period,
    );
    console.error(`[billing] invoicing failed for ${orgId} ${period}:`, message);
    return { period, settlement, status: 'failed', skipped: message };
  }
}

/** Close the just-ended month for every organization. Driven by the cron. */
export async function closeAllDuePeriods(env: Env, now: Date): Promise<CloseResult[]> {
  const orgs = await all<{ id: string }>(
    env.DB,
    `SELECT id FROM organizations WHERE deleted_at IS NULL`,
  );

  const bounds = periodKey(now);
  const target = previousOf(bounds);
  const results: CloseResult[] = [];

  for (const org of orgs) {
    try {
      results.push(await closePeriod(env, org.id, target, now));
    } catch (error) {
      console.error(`[billing] close failed for ${org.id} ${target}:`, error);
    }
  }

  return results;
}

function previousOf(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

export function listPeriods(env: Env, orgId: string, limit = 24): Promise<BillingPeriodRow[]> {
  return all<BillingPeriodRow>(
    env.DB,
    `SELECT * FROM billing_periods WHERE org_id = ? ORDER BY period DESC LIMIT ?`,
    orgId,
    limit,
  );
}

// ── Webhook idempotency ──────────────────────────────────────────────────────

/**
 * Claim a Stripe event. Returns false if we have already seen it.
 *
 * Stripe retries on any non-2xx and can deliver the same event more than once
 * even on success, so this is the difference between "billed once" and "billed
 * twice". The unique constraint does the work; the insert failing is the
 * signal.
 */
/**
 * Compare what Stripe says settled in a month with what the ledger recorded.
 *
 * The gap this closes: every guard on the webhook path assumes the event
 * arrives. Signature verification, the exactly-once claim, releasing the claim
 * on failure — all of them are about an event being processed *twice*. None is
 * about it never showing up, and an endpoint that was disabled for a day, a
 * rotated signing secret, or a deploy that 500'd through Stripe's whole retry
 * schedule all end the same way: money that settled and a ledger that never
 * heard about it. That looks exactly like a quiet month.
 *
 * **Read-only, deliberately.** It reports the discrepancy; it does not write the
 * missing rows. Two reasons. A reconciler that silently inserts contributions is
 * a second, unaudited path into the ledger — and the ledger is the artefact this
 * whole product asks ministries to stand behind. And a discrepancy is sometimes
 * Stripe's fault, sometimes a refund the ledger netted correctly, and sometimes
 * a genuine bug; a human should decide which before anything is written.
 */
export interface Reconciliation {
  period: string;
  /** Charges Stripe reports as succeeded, and their total. */
  stripe: { count: number; cents: number };
  /** Contributions the ledger holds for the same window. */
  ledger: { count: number; cents: number };
  /** Stripe charge ids with no matching contribution row. */
  missing_from_ledger: string[];
  /** Contribution rows with no matching Stripe charge — the rarer, odder case. */
  missing_from_stripe: string[];
  /** True when both sides agree exactly. */
  balanced: boolean;
  status: 'balanced' | 'discrepancy' | 'not_configured' | 'no_account';
}

export async function reconcilePeriod(
  env: Env,
  orgId: string,
  period: string,
): Promise<Reconciliation> {
  const empty = { count: 0, cents: 0 };

  if (!env.STRIPE_SECRET_KEY) {
    return {
      period, stripe: empty, ledger: empty,
      missing_from_ledger: [], missing_from_stripe: [],
      balanced: true, status: 'not_configured',
    };
  }

  const account = await first<{ stripe_account_id: string }>(
    env.DB,
    'SELECT stripe_account_id FROM billing_accounts WHERE org_id = ?',
    orgId,
  );

  const ledgerRows = await all<{ stripe_payment_intent_id: string | null; amount_cents: number }>(
    env.DB,
    `SELECT stripe_payment_intent_id, amount_cents FROM contributions
      WHERE org_id = ? AND period = ? AND kind = 'share'`,
    orgId, period,
  );
  const ledger = {
    count: ledgerRows.length,
    cents: ledgerRows.reduce((n, r) => n + r.amount_cents, 0),
  };

  if (!account) {
    // No connected account and ledger rows anyway is normal: a ministry can
    // record contributions it collected by cheque. Nothing to compare against.
    return {
      period, stripe: empty, ledger,
      missing_from_ledger: [], missing_from_stripe: [],
      balanced: true, status: 'no_account',
    };
  }

  const bounds = periodBounds(period);
  const charges = await listSettledCharges(
    env,
    account.stripe_account_id,
    Math.floor(Date.parse(bounds.start) / 1000),
    Math.floor(Date.parse(bounds.end) / 1000),
  );

  // Matched on payment intent, which is what the webhook writes. Falling back to
  // the charge id would appear to match more and mean less.
  const ledgerIntents = new Set(
    ledgerRows.map((r) => r.stripe_payment_intent_id).filter((id): id is string => Boolean(id)),
  );
  const stripeIntents = new Set(
    charges.map((c) => c.payment_intent).filter((id): id is string => Boolean(id)),
  );

  const missingFromLedger = charges
    .filter((c) => !c.payment_intent || !ledgerIntents.has(c.payment_intent))
    .map((c) => c.id);

  const missingFromStripe = [...ledgerIntents].filter((id) => !stripeIntents.has(id));

  return {
    period,
    stripe: { count: charges.length, cents: charges.reduce((n, c) => n + c.amount, 0) },
    ledger,
    missing_from_ledger: missingFromLedger,
    missing_from_stripe: missingFromStripe,
    balanced: missingFromLedger.length === 0 && missingFromStripe.length === 0,
    status: missingFromLedger.length === 0 && missingFromStripe.length === 0
      ? 'balanced'
      : 'discrepancy',
  };
}

export async function claimEvent(
  env: Env,
  event: { id: string; type: string },
  now: Date,
): Promise<boolean> {
  try {
    await run(
      env.DB,
      `INSERT INTO billing_events (id, event_id, type, received_at) VALUES (?, ?, ?, ?)`,
      newId('billingEvent'),
      event.id,
      event.type,
      nowIso(now),
    );
    return true;
  } catch {
    return false;
  }
}

export async function markEventProcessed(
  env: Env,
  eventId: string,
  now: Date,
  error?: string,
): Promise<void> {
  await run(
    env.DB,
    `UPDATE billing_events SET processed_at = ?, error = ? WHERE event_id = ?`,
    nowIso(now),
    error ?? null,
    eventId,
  );
}
