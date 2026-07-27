import type { Env } from './env';

/**
 * Sending email.
 *
 * This goes through Cloudflare's own Email Sending binding — `env.EMAIL.send()`
 * — rather than a third-party mail API. The reasoning is the same one that
 * keeps the Stripe client and the CSV parser hand-written, taken one step
 * further: there is no HTTP call, no API key, no SDK, and no vendor to be down
 * separately from the Worker. The binding is the whole client.
 *
 * **It degrades like everything else.** With no binding or no From address this
 * logs what it would have sent and reports `not_configured`. That matters more
 * here than convenience: alerts are stored as rows before any email is
 * attempted, so an unconfigured or broken mail path means an undelivered alert,
 * never a lost one. The rule is the same one the login limiter follows —
 * infrastructure being down must not be the thing that destroys information.
 *
 * **Two facts about Cloudflare Email Sending that shape the deployment**, both
 * worth knowing before anybody debugs a quiet inbox:
 *
 * 1. Until a sending domain is onboarded, a Worker may send **only to verified
 *    destination addresses** in the Cloudflare account. That is free and needs
 *    nothing but Email Routing, and it is enough for operator alerts, which go
 *    to one address we control. It is *not* enough for ministry alerts, which go
 *    to whatever address an owner signed up with. Onboarding the sending domain
 *    is what makes those work, and until it happens they will fail rather than
 *    silently vanish — the failure is returned, logged, and leaves `emailed_at`
 *    unset on the alert row.
 * 2. Mail sent from a Worker through this binding shows up in the **Email
 *    Routing summary as "dropped", even when it was delivered**. That is a
 *    reporting quirk of Routing, not a delivery problem. Read the Email Sending
 *    metrics instead. It is written here because somebody will otherwise spend
 *    an afternoon chasing a fault that does not exist.
 *
 * Nothing member-facing goes through here. Portal invitations are still emailed
 * by the ministry from its own address, because a household that has never heard
 * of Auxilium will treat a message from an unknown vendor about their medical
 * bills as phishing — which is the correct instinct. This is for operational
 * alerts to people who have accounts.
 */

/**
 * A send must not hold a cron open indefinitely.
 *
 * This is a race, not a cancellation: the binding call has no abort signal, so
 * on a timeout we stop waiting and report `failed` while the send may still
 * land. That asymmetry is the right way round. The alert row is already
 * written, so the worst case is an email that arrived with `emailed_at` unset —
 * a delivered alert recorded as undelivered. The reverse (marking a send that
 * never happened) is the one that would let a real fault go unnoticed.
 */
const TIMEOUT_MS = 10_000;

/**
 * Cloudflare's own ceiling on `to` + `cc` + `bcc` for a single message. We only
 * ever populate `to`, and a ministry with more than fifty owners and admins is
 * not a thing that exists — but a silent truncation would be, so it is checked.
 */
const MAX_RECIPIENTS = 50;

export type EmailResult =
  | { status: 'sent'; id: string }
  | { status: 'not_configured' }
  | { status: 'failed'; error: string };

export function emailConfigured(env: Env): boolean {
  return Boolean(env.EMAIL && env.ALERT_FROM_EMAIL);
}

export interface Email {
  to: string[];
  subject: string;
  /** Plain text. See the note on `render` about why there is no HTML. */
  text: string;
}

export async function sendEmail(env: Env, message: Email): Promise<EmailResult> {
  if (!emailConfigured(env)) {
    // Logged in full rather than swallowed: in development and in any
    // environment without a From address, this is the only record that the
    // alert pipeline actually fired, and "did the email get sent" is the first
    // question anybody asks.
    console.log(
      `[email] not configured — would have sent to ${message.to.join(', ')}: ${message.subject}`,
    );
    return { status: 'not_configured' };
  }

  const usable = message.to.filter((address) => address.includes('@'));
  if (usable.length === 0) return { status: 'failed', error: 'No usable recipient address.' };

  const recipients = usable.slice(0, MAX_RECIPIENTS);
  if (usable.length > recipients.length) {
    console.warn(
      `[email] ${usable.length} recipients exceeds the ${MAX_RECIPIENTS} limit; ` +
        `${usable.length - recipients.length} not mailed for: ${message.subject}`,
    );
  }

  try {
    const result = await Promise.race([
      env.EMAIL!.send({
        from: env.ALERT_FROM_EMAIL!,
        to: recipients,
        subject: message.subject,
        text: message.text,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`No response after ${TIMEOUT_MS}ms`)), TIMEOUT_MS),
      ),
    ]);

    return { status: 'sent', id: result.messageId ?? 'unknown' };
  } catch (error) {
    // Errors arrive as ordinary Errors carrying a `code`. The code is the part
    // worth keeping: "the destination address is not verified" and "the sending
    // domain is not onboarded" both read as generic refusals in the message, and
    // they are the two configuration mistakes this product will actually hit.
    const code = (error as { code?: string | number } | null)?.code;
    const detail = error instanceof Error ? error.message : 'unknown';
    const reason = code ? `${code}: ${detail}` : detail;
    console.warn(`[email] failed: ${reason}`);
    return { status: 'failed', error: reason };
  }
}

/**
 * Plain text, not HTML.
 *
 * These are operational alerts read on a phone at an awkward hour, and a plain
 * message renders identically everywhere, cannot break in a client, and cannot
 * be mistaken for marketing. It also means there is no template to keep in sync
 * with the in-app wording — the same string serves both, which is the same
 * argument that keeps `member_message` derived from the SLA engine rather than
 * written twice.
 */
export function render(alert: {
  title: string;
  body: string;
  meta?: Record<string, unknown>;
  appUrl?: string;
}): string {
  const lines = [alert.title, '', alert.body];

  // Structured detail, for the person who has to fix it. Sorted so two emails
  // about the same condition are diffable rather than merely similar.
  const entries = Object.entries(alert.meta ?? {});
  if (entries.length > 0) {
    lines.push('', '---');
    for (const [key, value] of entries.sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`);
    }
  }

  if (alert.appUrl) lines.push('', alert.appUrl);

  return lines.join('\n');
}
