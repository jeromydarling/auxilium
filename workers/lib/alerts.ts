import type { Env } from './env';
import { all, first, run } from './db';
import { newId } from '../../src/lib/ids';
import { nowIso } from '../../src/lib/utils';
import { sendEmail, render, emailConfigured } from './email';

/**
 * Raising an alert.
 *
 * The gap this fills: the monthly billing close counted its failures and wrote
 * them to `console.log`. A ministry's invoice could fail on the 1st and nobody —
 * not them, not us — would find out. That is money failing silently in a product
 * whose entire argument is that things which fail silently are how families get
 * stranded.
 *
 * Three properties, each of which is the reason a row exists rather than a
 * `sendEmail` call at the point of failure:
 *
 * **Stored before sent.** An unconfigured or broken mail provider produces an
 * undelivered alert, never a lost one. Same rule as the login rate limiter: the
 * infrastructure being down must not be what destroys the information.
 *
 * **Deduped by condition, not by occurrence.** A month that will not reconcile
 * is still broken an hour later. Re-raising bumps a counter; it does not insert
 * a second row and does not send a second email. Without this the first genuinely
 * novel alert arrives in an inbox that has been trained to ignore it.
 *
 * **Resolved silently.** When the condition stops being true the row closes and
 * nobody is emailed. A "this is fixed now" message about something nobody was
 * told about is pure noise, and the ones that were emailed are followed up by a
 * human who already knows.
 */

export type AlertAudience = 'operator' | 'ministry';
export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface RaiseAlert {
  /** Null for the platform itself rather than any one ministry. */
  orgId?: string | null;
  audience: AlertAudience;
  severity: AlertSeverity;
  /** Stable identifier for the condition: 'billing.close_failed'. */
  kind: string;
  /** What makes two raisings the same problem. Defaults to kind + org. */
  dedupeKey?: string;
  title: string;
  /** Plain words, aimed at the audience. Never a stack trace for a ministry. */
  body: string;
  meta?: Record<string, unknown>;
}

export interface RaisedAlert {
  id: string;
  created: boolean;
  emailed: boolean;
}

export async function raiseAlert(env: Env, alert: RaiseAlert): Promise<RaisedAlert> {
  const now = nowIso();
  const dedupeKey = alert.dedupeKey ?? `${alert.kind}:${alert.orgId ?? 'platform'}`;

  // Bump first and read the row count, rather than select-then-update. Two
  // firings of the daily cron overlapping would otherwise both see no existing
  // row and both insert — and the second would fail the one-live-alert index
  // rather than doing the harmless thing. This way the update either matched
  // (still broken, nothing more to do) or it did not (genuinely new).
  //
  // Keyed on `dedupe_key` throughout, which is safe without a tenant predicate
  // for the same reason a Stripe event id is: the key embeds the organization,
  // so it is globally unique by construction. It has to work that way — a
  // platform-level alert has no org at all.
  const bumped = await env.DB
    .prepare(
      `UPDATE alerts SET last_seen_at = ?, seen_count = seen_count + 1, updated_at = ?
        WHERE dedupe_key = ? AND resolved_at IS NULL`,
    )
    .bind(now, now, dedupeKey)
    .run();

  if (bumped.meta.changes > 0) {
    const existing = await first<{ id: string }>(
      env.DB,
      'SELECT id FROM alerts WHERE dedupe_key = ? AND resolved_at IS NULL',
      dedupeKey,
    );
    // Still broken. The email already went; sending it hourly is how an alert
    // channel becomes a filter rule.
    return { id: existing?.id ?? '', created: false, emailed: false };
  }

  const id = newId('alert');
  await run(
    env.DB,
    `INSERT INTO alerts
       (id, org_id, audience, severity, kind, dedupe_key, title, body, meta,
        first_seen_at, last_seen_at, seen_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    id, alert.orgId ?? null, alert.audience, alert.severity, alert.kind, dedupeKey,
    alert.title, alert.body, JSON.stringify(alert.meta ?? {}), now, now, now, now,
  );

  const emailed = await deliver(env, id, alert);
  return { id, created: true, emailed };
}

/**
 * Stop showing an alert, because the condition is no longer true.
 *
 * Idempotent and silent. Called on every successful run of whatever raised it,
 * so a transient failure that fixes itself closes without anybody chasing it.
 */
export async function resolveAlert(env: Env, dedupeKey: string): Promise<void> {
  const now = nowIso();
  await run(
    env.DB,
    'UPDATE alerts SET resolved_at = ?, updated_at = ? WHERE dedupe_key = ? AND resolved_at IS NULL',
    now, now, dedupeKey,
  );
}

/**
 * Who hears about it.
 *
 * Operator alerts go to `ALERT_EMAIL`. Ministry alerts go to that ministry's
 * owners and admins — not every staff account, because "your ledger may be
 * incomplete" is not a thing to send to a volunteer with read access, and an
 * alert that goes to everybody is one nobody owns.
 */
async function recipients(env: Env, alert: RaiseAlert): Promise<string[]> {
  if (alert.audience === 'operator') {
    return (env.ALERT_EMAIL ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  }
  if (!alert.orgId) return [];

  const rows = await all<{ email: string }>(
    env.DB,
    `SELECT email FROM users
      WHERE org_id = ? AND deleted_at IS NULL AND role IN ('owner', 'admin')`,
    alert.orgId,
  );
  return rows.map((r) => r.email);
}

async function deliver(env: Env, id: string, alert: RaiseAlert): Promise<boolean> {
  const to = await recipients(env, alert);
  if (to.length === 0) {
    if (emailConfigured(env)) {
      console.warn(`[alerts] ${alert.kind} raised with no recipient for ${alert.audience}`);
    }
    return false;
  }

  const result = await sendEmail(env, {
    to,
    // Severity in the subject so a phone notification is triageable without
    // opening it. The kind is not: a subject line full of dotted identifiers
    // reads as machine noise and gets muted.
    subject: alert.severity === 'critical' ? `Action needed: ${alert.title}` : alert.title,
    text: render({
      title: alert.title,
      body: alert.body,
      // Structured detail is for whoever fixes it. A ministry gets the sentence
      // and nothing else — a list of charge ids is not information to them, it
      // is evidence that something technical is wrong, which is alarming and
      // unactionable in equal measure.
      meta: alert.audience === 'operator' ? alert.meta : undefined,
      appUrl: alert.audience === 'ministry' && env.APP_HOST
        ? `https://${env.APP_HOST}/app`
        : undefined,
    }),
  });

  if (result.status === 'sent') {
    await run(env.DB, 'UPDATE alerts SET emailed_at = ?, updated_at = ? WHERE id = ?',
      nowIso(), nowIso(), id);
    return true;
  }
  return false;
}

/** Live alerts for one ministry, newest first. Never returns operator alerts. */
export async function ministryAlerts(env: Env, orgId: string) {
  return all<Record<string, unknown>>(
    env.DB,
    `SELECT id, severity, kind, title, body, first_seen_at, last_seen_at, seen_count, acked_at
       FROM alerts
      WHERE org_id = ? AND audience = 'ministry' AND resolved_at IS NULL
      ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
               last_seen_at DESC`,
    orgId,
  );
}
