import { Hono } from 'hono';
import type { Env } from '../lib/env';
import { first } from '../lib/db';
import { verifyWebhookSignature } from '../lib/stripe';
import {
  claimEvent,
  markEventProcessed,
  applyAccountState,
  recordSettledContribution,
  recordRefund,
} from '../lib/billing-service';
import { run } from '../lib/db';
import { nowIso } from '../../src/lib/utils';

/**
 * The Stripe webhook.
 *
 * The only unauthenticated write endpoint in the application, which makes it
 * the one most worth being careful about. Four rules govern it:
 *
 *   1. **Nothing is trusted without a valid signature.** No signature, a stale
 *      timestamp, or a mismatch — the request is refused before the body is
 *      parsed for meaning.
 *   2. **Every event is claimed exactly once.** Stripe retries on any non-2xx
 *      and can deliver a successful event twice. Without the claim, a
 *      redelivered `payment_intent.succeeded` bills a ministry for the same
 *      money twice.
 *   3. **Unknown events return 200.** Returning an error for an event type we
 *      do not handle makes Stripe retry it forever and eventually disable the
 *      endpoint — taking the events we *do* handle down with it.
 *   4. **A handler failure returns 500 on purpose.** That is the one case where
 *      a retry is what we want, so the claim is released before returning.
 */
const webhook = new Hono<{ Bindings: Env }>();

interface StripeEvent {
  id: string;
  type: string;
  created: number;
  data: { object: Record<string, unknown> };
  account?: string;
}

webhook.post('/', async (c) => {
  const secret = c.env.STRIPE_WEBHOOK_SECRET;

  // No secret means no way to tell Stripe from anyone else. Refusing is the
  // only safe answer — an unsigned webhook that writes to the ledger would be
  // an open door to fabricated contributions.
  if (!secret) {
    console.warn('[stripe] webhook received but STRIPE_WEBHOOK_SECRET is not set — refusing');
    return c.json({ error: 'Webhooks are not configured on this environment.' }, 503);
  }

  const raw = await c.req.text();
  const now = new Date();

  const verified = await verifyWebhookSignature(
    raw,
    c.req.header('stripe-signature') ?? null,
    secret,
    now,
  );

  if (!verified.ok) {
    console.warn(`[stripe] rejected webhook: ${verified.reason}`);
    return c.json({ error: 'Invalid signature.' }, 400);
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(raw) as StripeEvent;
  } catch {
    return c.json({ error: 'Malformed payload.' }, 400);
  }

  // Claim it. A second delivery of the same event stops here.
  const claimed = await claimEvent(c.env, event, now);
  if (!claimed) {
    return c.json({ received: true, duplicate: true });
  }

  try {
    await handle(c.env, event, now);
    await markEventProcessed(c.env, event.id, now);
    return c.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    console.error(`[stripe] handler failed for ${event.type} ${event.id}:`, message);

    // Release the claim so Stripe's retry can have another go. Leaving it
    // claimed would turn a transient failure into permanently lost money.
    await run(c.env.DB, `DELETE FROM billing_events WHERE event_id = ?`, event.id);
    return c.json({ error: 'Handler failed; please retry.' }, 500);
  }
});

async function handle(env: Env, event: StripeEvent, now: Date): Promise<void> {
  const object = event.data.object;

  switch (event.type) {
    /** Onboarding progressed, or a capability was granted or revoked. */
    case 'account.updated': {
      await applyAccountState(
        env,
        {
          id: String(object.id),
          charges_enabled: Boolean(object.charges_enabled),
          payouts_enabled: Boolean(object.payouts_enabled),
          details_submitted: Boolean(object.details_submitted),
          requirements: object.requirements as {
            currently_due?: string[];
            disabled_reason?: string | null;
          },
        },
        now,
      );
      return;
    }

    /**
     * A member contribution settled.
     *
     * Only counted once the money is actually there — `succeeded`, not
     * `created` or `processing`. Billing a percentage of an intent that later
     * fails would invoice a ministry for money it never received.
     */
    case 'payment_intent.succeeded': {
      const orgId = await orgForEvent(env, event, object);
      if (!orgId) {
        console.warn(`[stripe] no org for payment_intent ${String(object.id)} — skipping`);
        return;
      }

      const charges = (object.charges as { data?: Record<string, unknown>[] } | undefined)?.data;
      const charge = charges?.[0];

      await recordSettledContribution(
        env,
        {
          orgId,
          amountCents: Number(object.amount_received ?? object.amount ?? 0),
          processorFeeCents: Number(charge?.application_fee_amount ?? 0),
          paymentIntentId: String(object.id),
          chargeId: charge ? String(charge.id) : undefined,
          memberId: metadataValue(object, 'member_id'),
          householdId: metadataValue(object, 'household_id'),
          settledAt: new Date(event.created * 1000).toISOString(),
        },
        now,
      );
      return;
    }

    /** Money went back to a member. Net it out of the month it came from. */
    case 'charge.refunded': {
      await recordRefund(
        env,
        {
          chargeId: String(object.id),
          refundedCents: Number(object.amount_refunded ?? 0),
        },
        now,
      );
      return;
    }

    /** Our own platform-fee invoice was paid. */
    case 'invoice.paid': {
      await run(
        env.DB,
        `UPDATE billing_periods SET status = 'paid', paid_at = ?, updated_at = ?
          WHERE stripe_invoice_id = ?`,
        nowIso(),
        nowIso(),
        String(object.id),
      );
      return;
    }

    case 'invoice.payment_failed': {
      await run(
        env.DB,
        `UPDATE billing_periods SET status = 'failed', failure_reason = ?, updated_at = ?
          WHERE stripe_invoice_id = ?`,
        'invoice payment failed',
        nowIso(),
        String(object.id),
      );
      return;
    }

    default:
      // Deliberately a no-op with a 200. See rule 3 above.
      return;
  }
}

/**
 * Which ministry an event belongs to.
 *
 * Metadata first, because that is what we set when creating the payment. The
 * connected-account id is the fallback, which covers payments a ministry
 * created in its own Stripe dashboard without going through Auxilium.
 */
async function orgForEvent(
  env: Env,
  event: StripeEvent,
  object: Record<string, unknown>,
): Promise<string | null> {
  const fromMetadata = metadataValue(object, 'org_id');
  if (fromMetadata) return fromMetadata;

  if (event.account) {
    const row = await first<{ org_id: string }>(
      env.DB,
      `SELECT org_id FROM billing_accounts WHERE stripe_account_id = ? AND deleted_at IS NULL`,
      event.account,
    );
    return row?.org_id ?? null;
  }

  return null;
}

function metadataValue(object: Record<string, unknown>, key: string): string | null {
  const metadata = object.metadata as Record<string, string> | undefined;
  const value = metadata?.[key];
  return value && value.length > 0 ? value : null;
}

export default webhook;
