/**
 * A small Stripe client for the Worker runtime.
 *
 * Written rather than imported, for the same reason the CSV parser was: this
 * runs in a Worker where bundle size is real, and the surface actually needed
 * here is five endpoints and a signature check. The official SDK is ~500KB and
 * carries a Node HTTP client that has to be swapped out to work here at all.
 *
 * Everything is form-encoded, because that is what Stripe's API accepts —
 * including nested keys like `metadata[org_id]`.
 */

import type { Env } from './env';

const API = 'https://api.stripe.com/v1';

/** Thrown for any non-2xx from Stripe, carrying the decoded error. */
export class StripeError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = 'StripeError';
  }
}

/** Billing is off, not broken, when no key is configured. */
export function stripeConfigured(env: Env): boolean {
  return Boolean(env.STRIPE_SECRET_KEY);
}

/**
 * Flatten an object into Stripe's bracket notation.
 * `{ metadata: { org_id: 'x' } }` → `metadata[org_id]=x`
 */
function encodeForm(data: Record<string, unknown>, prefix = ''): string[] {
  const parts: string[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;

    if (typeof value === 'object' && !Array.isArray(value)) {
      parts.push(...encodeForm(value as Record<string, unknown>, name));
    } else if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (typeof item === 'object') {
          parts.push(...encodeForm(item as Record<string, unknown>, `${name}[${i}]`));
        } else {
          parts.push(`${encodeURIComponent(`${name}[${i}]`)}=${encodeURIComponent(String(item))}`);
        }
      });
    } else {
      parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
    }
  }

  return parts;
}

interface CallOptions {
  /** Stripe's own idempotency key. Set it on anything that moves money. */
  idempotencyKey?: string;
  /** Act on behalf of a connected account. */
  stripeAccount?: string;
}

async function call<T>(
  env: Env,
  method: 'GET' | 'POST',
  path: string,
  body?: Record<string, unknown>,
  opts: CallOptions = {},
): Promise<T> {
  if (!env.STRIPE_SECRET_KEY) {
    throw new StripeError(0, 'not_configured', 'Stripe is not configured on this environment.');
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
    'Content-Type': 'application/x-www-form-urlencoded',
    // Pinned deliberately. Stripe ships breaking changes behind version dates,
    // and a silently-upgraded API is a billing outage nobody deployed.
    'Stripe-Version': '2024-06-20',
  };
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
  if (opts.stripeAccount) headers['Stripe-Account'] = opts.stripeAccount;

  const encoded = body ? encodeForm(body).join('&') : undefined;
  const url = method === 'GET' && encoded ? `${API}${path}?${encoded}` : `${API}${path}`;

  const response = await fetch(url, {
    method,
    headers,
    body: method === 'POST' ? encoded : undefined,
  });

  const payload = (await response.json()) as { error?: { message: string; code?: string } };

  if (!response.ok) {
    throw new StripeError(
      response.status,
      payload.error?.code,
      payload.error?.message ?? `Stripe returned ${response.status}`,
    );
  }

  return payload as T;
}

// ── Connect ──────────────────────────────────────────────────────────────────

export interface StripeAccount {
  id: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  country?: string;
  default_currency?: string;
  requirements?: { currently_due?: string[]; disabled_reason?: string | null };
}

/**
 * Create a connected account for a ministry.
 *
 * `controller` rather than the legacy `type: 'express'`: the ministry owns the
 * relationship with its members and is liable for its own refunds and disputes,
 * while Stripe handles the onboarding and dashboard. Fees are the ministry's
 * responsibility to pay, which matches how the pricing page describes it.
 */
export function createConnectedAccount(
  env: Env,
  input: { orgId: string; email?: string; country?: string; businessName?: string },
): Promise<StripeAccount> {
  return call<StripeAccount>(
    env,
    'POST',
    '/accounts',
    {
      country: input.country ?? 'US',
      email: input.email,
      business_profile: input.businessName ? { name: input.businessName } : undefined,
      controller: {
        losses: { payments: 'stripe' },
        fees: { payer: 'account' },
        stripe_dashboard: { type: 'full' },
      },
      metadata: { org_id: input.orgId, platform: 'auxilium' },
    },
    { idempotencyKey: `acct:${input.orgId}` },
  );
}

export function retrieveAccount(env: Env, accountId: string): Promise<StripeAccount> {
  return call<StripeAccount>(env, 'GET', `/accounts/${accountId}`);
}

/**
 * A single-use onboarding link.
 *
 * Deliberately not stored: account links expire in minutes and are single-use,
 * so a cached one is a support ticket. Generate on demand, every time.
 */
export function createAccountLink(
  env: Env,
  input: { accountId: string; refreshUrl: string; returnUrl: string },
): Promise<{ url: string; expires_at: number }> {
  return call(env, 'POST', '/account_links', {
    account: input.accountId,
    refresh_url: input.refreshUrl,
    return_url: input.returnUrl,
    type: 'account_onboarding',
  });
}

/** A short-lived link into the connected account's own Stripe dashboard. */
export function createLoginLink(env: Env, accountId: string): Promise<{ url: string }> {
  return call(env, 'POST', `/accounts/${accountId}/login_links`, {});
}

// ── Invoicing the platform fee ───────────────────────────────────────────────

export interface StripeInvoice {
  id: string;
  status: string;
  hosted_invoice_url?: string | null;
  amount_due: number;
}

/**
 * Bill a ministry for one month's platform fee.
 *
 * Three calls, in this order, because Stripe builds an invoice from pending
 * items: create the line item, create the invoice, then finalize it. The
 * idempotency keys are derived from org and period so a retried close cannot
 * raise a second invoice for the same month.
 *
 * This charges the ministry's own Stripe customer for our fee. It is not an
 * application fee skimmed from member contributions — those settle to the
 * ministry untouched, which is what lets the pricing page say sharing funds are
 * never held as Auxilium operating money.
 */
export async function invoicePlatformFee(
  env: Env,
  input: {
    customerId: string;
    orgId: string;
    period: string;
    amountCents: number;
    currency?: string;
    description: string;
  },
): Promise<StripeInvoice> {
  const key = `fee:${input.orgId}:${input.period}`;
  const currency = input.currency ?? 'usd';

  await call(
    env,
    'POST',
    '/invoiceitems',
    {
      customer: input.customerId,
      amount: input.amountCents,
      currency,
      description: input.description,
      metadata: { org_id: input.orgId, period: input.period },
    },
    { idempotencyKey: `${key}:item` },
  );

  const invoice = await call<StripeInvoice>(
    env,
    'POST',
    '/invoices',
    {
      customer: input.customerId,
      collection_method: 'charge_automatically',
      auto_advance: true,
      description: input.description,
      metadata: { org_id: input.orgId, period: input.period },
    },
    { idempotencyKey: `${key}:invoice` },
  );

  return call<StripeInvoice>(
    env,
    'POST',
    `/invoices/${invoice.id}/finalize`,
    {},
    { idempotencyKey: `${key}:finalize` },
  );
}

export function createCustomer(
  env: Env,
  input: { orgId: string; name: string; email?: string },
): Promise<{ id: string }> {
  return call(
    env,
    'POST',
    '/customers',
    {
      name: input.name,
      email: input.email,
      metadata: { org_id: input.orgId, platform: 'auxilium' },
    },
    { idempotencyKey: `cust:${input.orgId}` },
  );
}

// ── Webhook signatures ───────────────────────────────────────────────────────

/**
 * Verify a `Stripe-Signature` header.
 *
 * Implemented here rather than pulled in, because the SDK's version needs Node
 * crypto. The three things that make this a real check rather than theatre:
 *
 *   • The signed payload is `timestamp.body` — signing the body alone would let
 *     an old valid request be replayed forever.
 *   • The timestamp is compared against a tolerance, so a captured request goes
 *     stale. Five minutes is Stripe's own default.
 *   • The comparison is constant-time. A fast-exit compare leaks the expected
 *     signature one byte at a time to anyone willing to measure.
 */
/**
 * Charges Stripe says settled into a connected account in a window.
 *
 * This exists for one reason: the webhook is defended against being processed
 * *twice* and not at all against never arriving. Every guard on that path — the
 * signature, the exactly-once claim, the release-on-failure — assumes the event
 * shows up. An endpoint that was disabled for a day, a signing secret rotated
 * mid-flight, or a deploy that 500'd through Stripe's whole retry schedule all
 * end the same way: money that settled and a ledger that never heard about it.
 *
 * Silent under-recording looks exactly like a quiet month, which is why it needs
 * a second source rather than a better handler.
 *
 * Read-only. It answers "what does Stripe think happened"; comparing that with
 * the ledger is `reconcilePeriod`'s job, and neither of them writes anything.
 */
export async function listSettledCharges(
  env: Env,
  stripeAccount: string,
  createdGte: number,
  createdLt: number,
): Promise<{ id: string; amount: number; created: number; payment_intent: string | null }[]> {
  const collected: { id: string; amount: number; created: number; payment_intent: string | null }[] = [];
  let startingAfter: string | undefined;

  // Paged to exhaustion rather than capped. A cap would make reconciliation
  // silently agree with the ledger on exactly the busiest months — the ones
  // where a missed event matters most.
  for (let page = 0; page < 40; page += 1) {
    const result = await call<{
      data: { id: string; amount: number; created: number; status: string; payment_intent: string | null }[];
      has_more: boolean;
    }>(
      env,
      'GET',
      '/charges',
      {
        limit: 100,
        'created[gte]': createdGte,
        'created[lt]': createdLt,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      },
      { stripeAccount },
    );

    collected.push(
      ...result.data
        .filter((charge) => charge.status === 'succeeded')
        .map(({ id, amount, created, payment_intent }) => ({ id, amount, created, payment_intent })),
    );

    if (!result.has_more || result.data.length === 0) return collected;
    startingAfter = result.data[result.data.length - 1].id;
  }

  return collected;
}

export async function verifyWebhookSignature(
  payload: string,
  signatureHeader: string | null,
  secret: string,
  now: Date,
  toleranceSeconds = 300,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!signatureHeader) return { ok: false, reason: 'missing signature header' };

  const parts = new Map<string, string[]>();
  for (const segment of signatureHeader.split(',')) {
    const [k, v] = segment.split('=', 2);
    if (!k || !v) continue;
    parts.set(k.trim(), [...(parts.get(k.trim()) ?? []), v.trim()]);
  }

  const timestamp = parts.get('t')?.[0];
  const signatures = parts.get('v1') ?? [];
  if (!timestamp || signatures.length === 0) {
    return { ok: false, reason: 'malformed signature header' };
  }

  const age = Math.abs(Math.floor(now.getTime() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > toleranceSeconds) {
    return { ok: false, reason: 'timestamp outside tolerance' };
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestamp}.${payload}`),
  );
  const expected = [...new Uint8Array(mac)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  for (const candidate of signatures) {
    if (timingSafeEqual(candidate, expected)) return { ok: true };
  }
  return { ok: false, reason: 'no matching signature' };
}

/** Constant-time string comparison. Length is not secret; content is. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
