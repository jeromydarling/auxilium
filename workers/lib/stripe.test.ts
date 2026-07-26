import { describe, it, expect } from 'vitest';
import { verifyWebhookSignature } from './stripe';

/**
 * Webhook signature tests.
 *
 * This is the only unauthenticated write path in the application. If it accepts
 * something it should not, anyone who finds the URL can fabricate settled
 * contributions and move a ministry's invoice. Each of these is a way that has
 * actually gone wrong in real integrations.
 */

const SECRET = 'whsec_test_do_not_use_anywhere_real';

/** Produce a genuine Stripe-style signature header. */
async function sign(payload: string, timestamp: number, secret = SECRET): Promise<string> {
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
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `t=${timestamp},v1=${hex}`;
}

const NOW = new Date('2026-07-26T01:00:00Z');
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000);
const BODY = JSON.stringify({ id: 'evt_1', type: 'payment_intent.succeeded' });

describe('webhook signature verification', () => {
  it('accepts a correctly signed, current request', async () => {
    const header = await sign(BODY, NOW_SECONDS);
    expect(await verifyWebhookSignature(BODY, header, SECRET, NOW)).toEqual({ ok: true });
  });

  it('refuses a request with no signature at all', async () => {
    const result = await verifyWebhookSignature(BODY, null, SECRET, NOW);
    expect(result.ok).toBe(false);
  });

  it('refuses a signature made with the wrong secret', async () => {
    const header = await sign(BODY, NOW_SECONDS, 'whsec_someone_elses_secret');
    const result = await verifyWebhookSignature(BODY, header, SECRET, NOW);
    expect(result).toEqual({ ok: false, reason: 'no matching signature' });
  });

  it('refuses a valid signature over a different body', async () => {
    // The exact attack the signature exists to stop: a real signed envelope
    // with the amount edited.
    const header = await sign(BODY, NOW_SECONDS);
    const tampered = JSON.stringify({ id: 'evt_1', type: 'payment_intent.succeeded', amount: 999 });
    const result = await verifyWebhookSignature(tampered, header, SECRET, NOW);
    expect(result.ok).toBe(false);
  });

  it('refuses a replay from outside the tolerance window', async () => {
    // Signing the body alone rather than timestamp.body would make a captured
    // request valid forever.
    const header = await sign(BODY, NOW_SECONDS - 3600);
    const result = await verifyWebhookSignature(BODY, header, SECRET, NOW);
    expect(result).toEqual({ ok: false, reason: 'timestamp outside tolerance' });
  });

  it('refuses a timestamp from the future beyond tolerance', async () => {
    const header = await sign(BODY, NOW_SECONDS + 3600);
    const result = await verifyWebhookSignature(BODY, header, SECRET, NOW);
    expect(result).toEqual({ ok: false, reason: 'timestamp outside tolerance' });
  });

  it('accepts a request at the edge of the window', async () => {
    const header = await sign(BODY, NOW_SECONDS - 299);
    expect(await verifyWebhookSignature(BODY, header, SECRET, NOW)).toEqual({ ok: true });
  });

  it('refuses a malformed header rather than throwing', async () => {
    for (const header of ['', 'garbage', 't=', 'v1=abc', 't=abc,v1=def']) {
      const result = await verifyWebhookSignature(BODY, header, SECRET, NOW);
      expect(result.ok, `accepted "${header}"`).toBe(false);
    }
  });

  it('accepts when any one of several offered signatures matches', async () => {
    // Stripe sends multiple v1 signatures during a secret rotation.
    const real = await sign(BODY, NOW_SECONDS);
    const hex = real.split('v1=')[1];
    const header = `t=${NOW_SECONDS},v1=${'0'.repeat(64)},v1=${hex}`;
    expect(await verifyWebhookSignature(BODY, header, SECRET, NOW)).toEqual({ ok: true });
  });

  it('is not fooled by a signature of the right length but wrong content', async () => {
    const header = `t=${NOW_SECONDS},v1=${'a'.repeat(64)}`;
    const result = await verifyWebhookSignature(BODY, header, SECRET, NOW);
    expect(result).toEqual({ ok: false, reason: 'no matching signature' });
  });
});
