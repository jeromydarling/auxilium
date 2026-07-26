import { Hono } from 'hono';
import {
  requireUser, requireWriteAccess, currentUser, sha256, checkApplyRate, type AppEnv,
} from '../lib/auth';
import { all, first, run, json } from '../lib/db';
import { param } from '../lib/http';
import { newId } from '../../src/lib/ids';
import { nowIso } from '../../src/lib/utils';
import { audit } from '../lib/audit';
import {
  DEFAULT_FORM, HEALTH_DISCLOSURE_NOTE, APPLICATION_STATUSES,
  type ApplicationSubmission, type ApplicationStatus,
} from '../../src/lib/applications/schema';
import { validateApplication, pruneAnswers } from '../../src/lib/applications/validate';
import { scoreSubmission } from '../../src/lib/applications/spam';
import {
  loadForm, currentGuidelineId, recentFromIp, existingForEmail,
  acceptApplication, markOpened,
} from '../lib/application-service';

/**
 * Membership applications.
 *
 * This file contains the product's **second unauthenticated write path**. The
 * first is the Stripe webhook, which is defended by a signature; there is no
 * equivalent here, because the entire point is that a stranger who found the
 * ministry can apply. What defends it instead:
 *
 *   • Nothing is reachable until a ministry publishes its form.
 *   • Answers are pruned to what the form actually asked, so nobody can write
 *     arbitrary keys into a ministry's records through a field that was never
 *     rendered.
 *   • Submissions are scored for spam and sorted, never dropped. A silent drop
 *     tells an applicant their form was sent when it does not exist, and the
 *     cost of a false positive here is a family's membership.
 *   • The source address is stored hashed. Enough to count, not enough to keep
 *     an address against a medical-adjacent record.
 *
 * The public routes are mounted separately from the staff ones precisely so the
 * auth middleware cannot be applied to the wrong half by accident.
 */

// ── Public ───────────────────────────────────────────────────────────────────

export const publicApplications = new Hono<AppEnv>();

/** The form a ministry publishes, by slug. Nothing here identifies a member. */
publicApplications.get('/:slug', async (c) => {
  const org = await first<{ id: string; name: string; brand: string }>(
    c.env.DB,
    'SELECT id, name, brand FROM organizations WHERE slug = ? AND deleted_at IS NULL',
    param(c, 'slug'),
  );
  // A ministry that has not published and one that does not exist get the same
  // answer. Otherwise this endpoint enumerates which ministries use Auxilium.
  if (!org) return c.json({ error: 'No application form here.' }, 404);

  const form = await loadForm(c.env, org.id);
  if (!form.published) return c.json({ error: 'No application form here.' }, 404);

  return c.json({
    org_name: org.name,
    // For many applicants this page is the first thing they ever see of the
    // ministry. It should look like the ministry, not like us.
    brand: json(org.brand, {}),
    version: form.version,
    intro: form.intro,
    sections: form.sections,
    health_note: HEALTH_DISCLOSURE_NOTE,
  });
});

publicApplications.post('/:slug', async (c) => {
  const now = nowIso();
  const org = await first<{ id: string; name: string }>(
    c.env.DB,
    'SELECT id, name FROM organizations WHERE slug = ? AND deleted_at IS NULL',
    param(c, 'slug'),
  );
  if (!org) return c.json({ error: 'No application form here.' }, 404);

  const form = await loadForm(c.env, org.id);
  if (!form.published) return c.json({ error: 'No application form here.' }, 404);

  const body = await c.req.json<
    ApplicationSubmission & { honeypot?: string; started_at?: string }
  >().catch(() => null);
  if (!body?.spine) return c.json({ error: 'That did not come through. Please try again.' }, 400);

  const submission: ApplicationSubmission = {
    spine: {
      ...body.spine,
      household: Array.isArray(body.spine.household) ? body.spine.household.slice(0, 25) : [],
    },
    answers: pruneAnswers(form, body.answers ?? {}),
  };

  const issues = validateApplication(form, submission);
  if (issues.length > 0) return c.json({ issues }, 422);

  const ipHash = await sha256(
    `${c.req.header('cf-connecting-ip') ?? 'unknown'}:${org.id}`,
  );

  // A volume ceiling, not a filter. Checked after validation so somebody who
  // has typed a real application still gets their field errors back rather than
  // a 429 that tells them nothing about what to fix.
  const rate = await checkApplyRate(c.env, ipHash);
  if (!rate.ok) {
    return c.json(
      {
        error:
          'That is a lot of applications from one connection in a short time. Wait a few minutes ' +
          'and try again — or call the ministry directly and they can take it over the phone.',
      },
      429,
      { 'Retry-After': String(rate.retryAfterSeconds) },
    );
  }

  const spam = scoreSubmission(submission, {
    honeypot: body.honeypot,
    fillMs: body.started_at ? Date.parse(now) - Date.parse(body.started_at) : undefined,
    recentFromSameIp: await recentFromIp(c.env, ipHash, now),
    existingForEmail: await existingForEmail(c.env, org.id, submission.spine.email),
  });

  const id = newId('application');
  const s = submission.spine;

  await run(
    c.env.DB,
    `INSERT INTO member_applications
       (id, org_id, first_name, last_name, email, phone, date_of_birth,
        address_line1, address_line2, city, state, postal_code, household,
        requested_start_date, answers, form_version, guideline_version_id,
        status, submitted_at, spam_score, spam_reasons, source_ip_hash,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?, ?, ?, ?, ?, ?)`,
    id, org.id,
    s.first_name.trim(), s.last_name.trim(), s.email.trim().toLowerCase(),
    s.phone ?? null, s.date_of_birth ?? null,
    s.address_line1 ?? null, s.address_line2 ?? null,
    s.city ?? null, s.state ?? null, s.postal_code ?? null,
    JSON.stringify(s.household),
    s.requested_start_date ?? null,
    JSON.stringify(submission.answers),
    form.version,
    // The guideline version in force right now. Under the enrolment rule this
    // is the document that binds them, so it is captured at submission rather
    // than looked up later, when it may have been superseded.
    await currentGuidelineId(c.env, org.id, now),
    now, spam.score, JSON.stringify(spam.reasons), ipHash, now, now,
  );

  await audit(c.env.DB, {
    orgId: org.id, actorId: null, actorKind: 'system',
    action: 'application.submitted', subjectType: 'application', subjectId: id,
    meta: { spam_score: spam.score },
  });

  // The same answer whatever the spam score. Telling a suspected bot it was
  // flagged tells a real applicant their application is being treated as junk.
  return c.json({ ok: true, reference: id }, 201);
});

// ── Staff ────────────────────────────────────────────────────────────────────

const applications = new Hono<AppEnv>();
applications.use('*', requireUser);

/** The board. `status` filters; `suspicious` is the low-confidence tab. */
applications.get('/', async (c) => {
  const user = (await currentUser(c))!;
  const status = c.req.query('status');
  const suspicious = c.req.query('suspicious') === 'true';

  const clauses = ['org_id = ?', 'deleted_at IS NULL'];
  const params: unknown[] = [user.org_id];

  if (status && APPLICATION_STATUSES.includes(status as ApplicationStatus)) {
    clauses.push('status = ?');
    params.push(status);
  } else if (!status) {
    clauses.push("status IN ('submitted', 'in_review', 'needs_info')");
  }

  // The threshold matches the one in the scoring module. Both tabs are real
  // applications a human reads; this only decides the order they are met in.
  clauses.push(suspicious ? 'spam_score >= 60' : 'spam_score < 60');

  const items = await all<Record<string, unknown>>(
    c.env.DB,
    `SELECT id, first_name, last_name, email, phone, status, submitted_at, first_opened_at,
            requested_start_date, household, spam_score, decided_at
       FROM member_applications
      WHERE ${clauses.join(' AND ')}
      ORDER BY submitted_at ASC
      LIMIT 200`,
    ...params,
  );

  return c.json({
    items: items.map((row) => ({ ...row, household: json(row.household as string, []) })),
  });
});

/** One application, in full. Opening it is what stops the "nobody has looked" clock. */
applications.get('/:id', async (c) => {
  const user = (await currentUser(c))!;
  const id = param(c, 'id');

  const row = await first<Record<string, unknown>>(
    c.env.DB,
    `SELECT * FROM member_applications WHERE id = ? AND org_id = ? AND deleted_at IS NULL`,
    id, user.org_id,
  );
  if (!row) return c.json({ error: 'No such application.' }, 404);

  await markOpened(c.env, user.org_id, id);

  // The form as it was when they answered it, not as it is now. Rendering
  // today's questions against last month's answers mislabels them.
  const form = await loadForm(c.env, user.org_id);

  return c.json({
    application: {
      ...row,
      household: json(row.household as string, []),
      answers: json(row.answers as string, {}),
      spam_reasons: json(row.spam_reasons as string, []),
      // Never returned. It exists to count submissions from a source, and a
      // reviewer has no use for it.
      source_ip_hash: undefined,
    },
    form: { version: form.version, sections: form.sections },
    stale_form: form.version !== row.form_version,
  });
});

/** Move an application along. Accepting is a separate route because it creates people. */
applications.post('/:id/status', requireWriteAccess, async (c) => {
  const user = (await currentUser(c))!;
  const { status, note } = await c.req.json<{ status?: string; note?: string }>();

  if (status === 'accepted') {
    return c.json({ error: 'Use the accept endpoint — accepting creates real members.' }, 400);
  }
  if (!status || !APPLICATION_STATUSES.includes(status as ApplicationStatus)) {
    return c.json({ error: 'That is not a status an application can be in.' }, 400);
  }
  // Declining without saying why leaves the applicant with nothing to act on
  // and the ministry with nothing to defend. Same rule as declining a need.
  if (status === 'declined' && !note?.trim()) {
    return c.json({ error: 'A decline needs a reason the applicant can be told.' }, 400);
  }

  const now = nowIso();
  const terminal = status === 'declined' || status === 'withdrawn';

  const result = await c.env.DB
    .prepare(
      `UPDATE member_applications
          SET status = ?, decision_note = ?,
              decided_at = CASE WHEN ? THEN ? ELSE decided_at END,
              decided_by = CASE WHEN ? THEN ? ELSE decided_by END,
              updated_at = ?
        WHERE id = ? AND org_id = ? AND deleted_at IS NULL AND status != 'accepted'`,
    )
    .bind(
      status, note ?? null,
      terminal ? 1 : 0, now,
      terminal ? 1 : 0, user.id,
      now, param(c, 'id'), user.org_id,
    )
    .run();

  if (!result.meta.changes) {
    return c.json({ error: 'No such application, or it has already been accepted.' }, 404);
  }

  await audit(c.env.DB, {
    orgId: user.org_id, actorId: user.id, actorKind: 'user',
    action: `application.${status}`, subjectType: 'application', subjectId: param(c, 'id'),
  });

  return c.json({ ok: true });
});

/** Accept: create the household and everyone on it. */
applications.post('/:id/accept', requireWriteAccess, async (c) => {
  const user = (await currentUser(c))!;
  const { note } = await c.req.json<{ note?: string }>().catch(() => ({ note: undefined }));

  const result = await acceptApplication(c.env, user.org_id, param(c, 'id'), user.id, note);
  if ('error' in result) return c.json(result, 409);

  return c.json(result, 201);
});

// ── The form ─────────────────────────────────────────────────────────────────

/** The ministry's own form, published or not. */
applications.get('/form/current', async (c) => {
  const user = (await currentUser(c))!;
  const form = await loadForm(c.env, user.org_id);
  const org = await first<{ slug: string }>(
    c.env.DB, 'SELECT slug FROM organizations WHERE id = ?', user.org_id,
  );

  return c.json({
    form,
    public_path: `/apply/${org?.slug ?? ''}`,
    default_sections: DEFAULT_FORM.sections,
  });
});

applications.put('/form/current', requireWriteAccess, async (c) => {
  const user = (await currentUser(c))!;
  const { intro, sections, publish } = await c.req.json<{
    intro?: string; sections?: unknown; publish?: boolean;
  }>();

  if (!Array.isArray(sections)) {
    return c.json({ error: 'A form needs a list of sections.' }, 400);
  }

  // Structural validation only. A ministry is entitled to ask whatever it
  // wants; what it is not entitled to do is store something the renderer
  // cannot draw or the validator cannot check.
  for (const section of sections as { key?: string; fields?: unknown }[]) {
    if (!section?.key || !Array.isArray(section.fields)) {
      return c.json({ error: 'Every section needs a key and a list of fields.' }, 400);
    }
    for (const field of section.fields as { key?: string; type?: string }[]) {
      if (!field?.key || !field.type) {
        return c.json({ error: 'Every field needs a key and a type.' }, 400);
      }
    }
  }

  const now = nowIso();
  const existing = await first<{ version: number }>(
    c.env.DB, 'SELECT version FROM application_forms WHERE org_id = ?', user.org_id,
  );

  // The version bumps on publish, not on save. A ministry editing a draft over
  // an afternoon should not produce six versions, and the version is what a
  // submission records to prove which questions it answered.
  const version = (existing?.version ?? 0) + (publish ? 1 : 0) || 1;

  if (existing) {
    await run(
      c.env.DB,
      `UPDATE application_forms
          SET intro = ?, sections = ?, version = ?,
              published_at = CASE WHEN ? THEN ? ELSE published_at END,
              updated_at = ?
        WHERE org_id = ?`,
      intro ?? null, JSON.stringify(sections), version,
      publish ? 1 : 0, now, now, user.org_id,
    );
  } else {
    await run(
      c.env.DB,
      `INSERT INTO application_forms (id, org_id, version, intro, sections, published_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      newId('applicationForm'), user.org_id, version, intro ?? null,
      JSON.stringify(sections), publish ? now : null, now, now,
    );
  }

  await audit(c.env.DB, {
    orgId: user.org_id, actorId: user.id, actorKind: 'user',
    action: publish ? 'application_form.published' : 'application_form.saved',
    subjectType: 'org', subjectId: user.org_id, meta: { version },
  });

  return c.json({ ok: true, version, published: Boolean(publish) });
});

export default applications;
