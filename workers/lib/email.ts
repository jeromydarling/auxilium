import type { Env } from './env';

/**
 * Sending email.
 *
 * The product's first hard third-party dependency, and it is deliberately the
 * smallest one available: one POST to one endpoint, no SDK, the same reasoning
 * as the hand-written Stripe client and the hand-written CSV parser. A mail SDK
 * would be a megabyte of code in a Worker to build a JSON body.
 *
 * **It degrades like everything else.** With no API key configured this logs
 * what it would have sent and reports `not_configured`. That matters more here
 * than convenience: alerts are stored as rows before any email is attempted, so
 * an unconfigured or broken mail provider means an undelivered alert, never a
 * lost one. The rule this follows is the same one the login limiter follows —
 * infrastructure being down must not be the thing that destroys information.
 *
 * Nothing member-facing goes through here. Portal invitations are still emailed
 * by the ministry from its own address, because a household that has never heard
 * of Auxilium will treat a message from an unknown vendor about their medical
 * bills as phishing — which is the correct instinct. This is for operational
 * alerts to people who have accounts.
 */

const RESEND_API = 'https://api.resend.com/emails';

/** A slow mail API must not hold a cron or a request open. */
const TIMEOUT_MS = 10_000;

export type EmailResult =
  | { status: 'sent'; id: string }
  | { status: 'not_configured' }
  | { status: 'failed'; error: string };

export function emailConfigured(env: Env): boolean {
  return Boolean(env.RESEND_API_KEY && env.ALERT_FROM_EMAIL);
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
    // environment without a key, this is the only record that the alert
    // pipeline actually fired, and "did the email get sent" is the first
    // question anybody asks.
    console.log(
      `[email] not configured — would have sent to ${message.to.join(', ')}: ${message.subject}`,
    );
    return { status: 'not_configured' };
  }

  const recipients = message.to.filter((address) => address.includes('@'));
  if (recipients.length === 0) return { status: 'failed', error: 'No usable recipient address.' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(RESEND_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.ALERT_FROM_EMAIL,
        to: recipients,
        subject: message.subject,
        text: message.text,
      }),
      signal: controller.signal,
    });

    const payload = await response
      .json<{ id?: string; message?: string }>()
      .catch(() => ({} as { id?: string; message?: string }));

    if (!response.ok) {
      const error = payload.message ?? `Mail provider returned ${response.status}`;
      console.warn(`[email] failed: ${error}`);
      return { status: 'failed', error };
    }

    return { status: 'sent', id: payload.id ?? 'unknown' };
  } catch (error) {
    const message_ = error instanceof Error ? error.message : 'unknown';
    console.warn(`[email] failed: ${message_}`);
    return { status: 'failed', error: message_ };
  } finally {
    clearTimeout(timer);
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
