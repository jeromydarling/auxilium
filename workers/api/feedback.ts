import { Hono } from 'hono';
import { requireUser, currentUser, type AppEnv } from '../lib/auth';
import { all, run } from '../lib/db';
import { audit } from '../lib/audit';
import { newId } from '../../src/lib/ids';
import { nowIso } from '../../src/lib/utils';
import { sendEmail, render, emailConfigured } from '../lib/email';
import { summariseReport, validateReport, type ReportDraft } from '../../src/lib/feedback/report';

/**
 * Telling us something is wrong.
 *
 * Staff only — `requireUser`, and there is deliberately no public counterpart.
 * A member reaches their ministry the way they already do for everything else;
 * an anonymous free-text channel from somebody in a medical crisis is a records
 * problem we would have to hold, and the person who can actually describe what
 * the software did is the staff member who was using it.
 *
 * **Stored before sent**, the rule the alerts table already follows. A report is
 * a row first and an email second, so an unconfigured or broken mail path
 * produces an undelivered report rather than a lost one. The reporter is told it
 * was received on the strength of the row, which is the honest thing to key that
 * confirmation on: the row is the part we can guarantee.
 */

const feedback = new Hono<AppEnv>();
feedback.use('*', requireUser);

feedback.post('/', async (c) => {
  const user = (await currentUser(c))!;
  const draft = await c.req.json<ReportDraft>().catch(() => null);

  const issues = validateReport(draft);
  if (issues.length > 0 || !draft) {
    return c.json({ error: issues[0]?.message ?? 'That report was empty.', issues }, 422);
  }

  const id = newId('feedback');
  const now = nowIso();

  await run(
    c.env.DB,
    `INSERT INTO feedback
       (id, org_id, user_id, kind, body, route, app_version, user_agent,
        recent_errors, request_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, user.org_id, user.id, draft.kind, draft.body.trim(),
    draft.route ?? null,
    c.env.APP_VERSION ?? null,
    // Truncated rather than rejected. A long user-agent is not a reason to
    // refuse somebody's bug report.
    (c.req.header('user-agent') ?? '').slice(0, 500) || null,
    JSON.stringify(draft.recentErrors ?? []),
    draft.requestId ?? null,
    now, now,
  );

  await audit(c.env.DB, {
    orgId: user.org_id, actorId: user.id, actorKind: 'user',
    action: draft.kind === 'bug' ? 'feedback.bug_reported' : 'feedback.idea_submitted',
    subjectType: 'feedback', subjectId: id,
  });

  // Operator audience, always. A ministry's own bug report is not something to
  // mail back to the ministry, and this is the one channel where a delay of a
  // day matters — so it goes straight out rather than waiting for somebody to
  // open a dashboard nobody has built yet.
  //
  // Deliberately not routed through `raiseAlert`. That table dedupes by
  // condition, which is right for "this month will not reconcile" and wrong
  // here: two ministries reporting the same broken page are two reports, and
  // collapsing them would silently discard the second person's description —
  // which is the part of a bug report worth having.
  let emailed = false;
  if (emailConfigured(c.env)) {
    const result = await sendEmail(c.env, {
      to: (c.env.ALERT_EMAIL ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      subject: `${draft.kind === 'bug' ? 'Bug' : 'Idea'}: ${summariseReport(draft.body)}`,
      text: render({
        title: draft.kind === 'bug' ? 'A ministry reported a bug' : 'A ministry suggested something',
        body: draft.body.trim(),
        meta: {
          org: user.org_id,
          reporter: user.email,
          route: draft.route ?? 'unknown',
          version: c.env.APP_VERSION ?? 'unknown',
          request_id: draft.requestId ?? 'none',
          // The errors that preceded it, flattened to one line each. This is
          // what makes the difference between a report somebody can act on and
          // one that says "the members page did not work".
          errors: (draft.recentErrors ?? [])
            .map((e) => `${e.at} ${e.route} ${e.status ?? ''} ${e.message}`)
            .join(' | ') || 'none recorded',
        },
      }),
    });
    emailed = result.status === 'sent';
    if (emailed) {
      await run(c.env.DB, 'UPDATE feedback SET emailed_at = ?, updated_at = ? WHERE id = ?',
        nowIso(), nowIso(), id);
    }
  }

  // `emailed` is reported but the response is a success either way. The report
  // exists; whether our mail is configured is not the reporter's problem and
  // not something to show them.
  return c.json({ ok: true, id, emailed });
});

/**
 * What this ministry has already told us.
 *
 * Exists so somebody does not report the same thing three times wondering
 * whether it went anywhere. Deliberately carries no status beyond the fact it
 * was sent — a "triaged"/"closed" column a ministry can watch is a promise
 * about response times that nobody has made, and an unanswered report showing
 * "new" for three weeks reads worse than a report that simply says it arrived.
 */
feedback.get('/', async (c) => {
  const user = (await currentUser(c))!;
  const items = await all<Record<string, unknown>>(
    c.env.DB,
    `SELECT id, kind, body, route, created_at
       FROM feedback WHERE org_id = ? ORDER BY created_at DESC LIMIT 20`,
    user.org_id,
  );
  return c.json({ items });
});

export default feedback;
