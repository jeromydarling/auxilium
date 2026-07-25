import { Hono } from 'hono';
import { requireUser, requireWriteAccess, currentUser, type AppEnv } from '../lib/auth';
import { all, first, run, batch } from '../lib/db';
import { param } from '../lib/http';
import { audit } from '../lib/audit';
import { enqueueRecompute } from '../lib/nri-service';
import { guidelineForMember } from '../lib/integrity-service';
import { validateIntake, hasBlockingIssue, describeMissing } from '../../src/lib/claims/intake';
import { evaluateSla, computeDueAt, buildTracker, type ClaimStage } from '../../src/lib/claims/sla';
import { reprice, summarizeRepricing, DEFAULT_MULTIPLIER_BPS } from '../../src/lib/claims/repricing';
import { assessEligibility } from '../../src/lib/claims/eligibility';
import { newId } from '../../src/lib/ids';
import { nowIso } from '../../src/lib/utils';

const claims = new Hono<AppEnv>();
claims.use('*', requireUser);

/**
 * Claims operations: intake that refuses what cannot be worked, an SLA clock
 * that escalates on its own, repricing against Medicare, and appeals.
 *
 * The organizing idea: a member should never have to call to find out that
 * nothing is happening.
 */

/** Check a claim before creating it. The UI calls this as the form is filled. */
claims.post('/validate', async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  const issues = validateIntake(
    {
      member_id: body.member_id as string,
      procedure_code: body.procedure_code as string,
      diagnosis_code: body.diagnosis_code as string,
      provider_npi: body.provider_npi as string,
      provider_name: body.provider_name as string,
      service_date: body.service_date as string,
      billed_cents: body.billed_cents as number,
      has_itemized_bill: Boolean(body.has_itemized_bill),
    },
    nowIso(),
  );

  return c.json({
    issues,
    accepted: !hasBlockingIssue(issues),
    missing: describeMissing(issues),
  });
});

/**
 * Submit a claim.
 *
 * Refuses anything with a blocking gap — this is the whole mechanism. A claim
 * accepted without a procedure code or an itemized bill is a claim that sits
 * unworked for months while the member believes it is in progress.
 */
claims.post('/', requireWriteAccess, async (c) => {
  const user = (await currentUser(c))!;
  const body = await c.req.json<Record<string, unknown>>();
  const now = nowIso();

  const intake = {
    member_id: body.member_id as string,
    procedure_code: body.procedure_code as string,
    diagnosis_code: body.diagnosis_code as string,
    provider_npi: body.provider_npi as string,
    provider_name: body.provider_name as string,
    service_date: body.service_date as string,
    billed_cents: Number(body.billed_cents ?? 0),
    has_itemized_bill: Boolean(body.has_itemized_bill),
  };

  const issues = validateIntake(intake, now);
  if (hasBlockingIssue(issues)) {
    return c.json({
      error: describeMissing(issues) ?? 'This claim is missing information required to process it.',
      issues,
    }, 422);
  }

  const member = await first<{ id: string; household_id: string | null }>(
    c.env.DB,
    'SELECT id, household_id FROM members WHERE id = ? AND org_id = ? AND deleted_at IS NULL',
    intake.member_id, user.org_id,
  );
  if (!member) return c.json({ error: 'That member was not found.' }, 404);

  const org = await first<{ sla_days: number }>(
    c.env.DB, 'SELECT sla_days FROM organizations WHERE id = ?', user.org_id,
  );
  const slaDays = org?.sla_days ?? 17;

  const id = newId('need');

  await batch(c.env.DB, [
    c.env.DB.prepare(
      `INSERT INTO needs (id, org_id, member_id, household_id, title, description, category,
                          status, amount_requested_cents, billed_cents, incident_date,
                          submitted_at, last_status_change_at, sla_due_at, urgency,
                          procedure_code, diagnosis_code, provider_npi, provider_name,
                          service_date, has_itemized_bill, secondary_payer_status,
                          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'submitted', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    ).bind(
      id, user.org_id, intake.member_id, member.household_id,
      body.title ?? `${intake.procedure_code} — ${intake.provider_name}`,
      body.description ?? null, body.category ?? 'medical',
      Number(body.amount_requested_cents ?? intake.billed_cents), intake.billed_cents,
      intake.service_date, now, now, computeDueAt(now, slaDays), body.urgency ?? 'normal',
      intake.procedure_code, intake.diagnosis_code, intake.provider_npi, intake.provider_name,
      intake.service_date, body.secondary_payer_status ?? 'not_required', now, now,
    ),
    c.env.DB.prepare(
      `INSERT INTO need_updates (id, org_id, need_id, author_id, kind, body, meta, created_at)
       VALUES (?, ?, ?, ?, 'status_change', ?, ?, ?)`,
    ).bind(
      newId('needUpdate'), user.org_id, id, user.id,
      `Claim received. We have committed to a decision within ${slaDays} days.`,
      JSON.stringify({ to: 'submitted', sla_days: slaDays }), now,
    ),
  ]);

  await audit(c.env.DB, {
    orgId: user.org_id, actorId: user.id, actorKind: 'user', action: 'claim.submitted',
    subjectType: 'need', subjectId: id,
    meta: { billed_cents: intake.billed_cents, procedure: intake.procedure_code },
  });
  await enqueueRecompute(c.env, user.org_id, intake.member_id, 'claim.submitted');

  return c.json({ id, sla_due_at: computeDueAt(now, slaDays), warnings: issues }, 201);
});

/** Everything past its commitment, worst first — the daily escalation worklist. */
claims.get('/escalations', async (c) => {
  const user = (await currentUser(c))!;
  const now = nowIso();

  const org = await first<{ sla_days: number }>(
    c.env.DB, 'SELECT sla_days FROM organizations WHERE id = ?', user.org_id,
  );
  const slaDays = org?.sla_days ?? 17;

  const rows = await all<{
    id: string; status: string; title: string; submitted_at: string | null; created_at: string;
    sla_due_at: string | null; first_response_at: string | null;
    last_status_change_at: string | null; amount_requested_cents: number;
    assigned_to: string | null; member_id: string;
    first_name: string; last_name: string; assignee_name: string | null;
  }>(
    c.env.DB,
    `SELECT n.id, n.status, n.title, n.submitted_at, n.created_at, n.sla_due_at,
            n.first_response_at, n.last_status_change_at, n.amount_requested_cents,
            n.assigned_to, n.member_id, m.first_name, m.last_name, u.name AS assignee_name
       FROM needs n
       JOIN members m ON m.id = n.member_id
       LEFT JOIN users u ON u.id = n.assigned_to
      WHERE n.org_id = ? AND n.deleted_at IS NULL
        AND n.status NOT IN ('completed', 'declined', 'withdrawn')
      ORDER BY n.sla_due_at ASC NULLS LAST
      LIMIT 200`,
    user.org_id,
  );

  const evaluated = rows
    .map((row) => ({
      claim: row,
      sla: evaluateSla({
        stage: row.status as ClaimStage,
        submitted_at: row.submitted_at,
        created_at: row.created_at,
        sla_due_at: row.sla_due_at,
        first_response_at: row.first_response_at,
        last_status_change_at: row.last_status_change_at,
        sla_days: slaDays,
      }, now),
    }))
    .filter((e) => e.sla.needs_escalation)
    .sort((a, b) => b.sla.days_over - a.sla.days_over);

  return c.json({
    items: evaluated,
    total_at_stake_cents: evaluated.reduce((sum, e) => sum + e.claim.amount_requested_cents, 0),
    sla_days: slaDays,
  });
});

/** The member-facing tracker. Package-tracking UX for a medical bill. */
claims.get('/:id/tracker', async (c) => {
  const user = (await currentUser(c))!;
  const id = param(c, 'id');

  const claim = await first<{
    id: string; status: string; title: string; submitted_at: string | null; created_at: string;
    sla_due_at: string | null; first_response_at: string | null;
    last_status_change_at: string | null; amount_requested_cents: number;
    denial_reason_code: string | null; denial_note: string | null;
  }>(
    c.env.DB,
    `SELECT id, status, title, submitted_at, created_at, sla_due_at, first_response_at,
            last_status_change_at, amount_requested_cents, denial_reason_code, denial_note
       FROM needs WHERE id = ? AND org_id = ? AND deleted_at IS NULL`,
    id, user.org_id,
  );
  if (!claim) return c.json({ error: 'That claim was not found.' }, 404);

  const org = await first<{ sla_days: number }>(
    c.env.DB, 'SELECT sla_days FROM organizations WHERE id = ?', user.org_id,
  );

  const paid = await first<{ paid_at: string }>(
    c.env.DB,
    "SELECT paid_at FROM disbursements WHERE need_id = ? AND category = 'share' ORDER BY paid_at LIMIT 1",
    id,
  );

  const sla = evaluateSla({
    stage: claim.status as ClaimStage,
    submitted_at: claim.submitted_at,
    created_at: claim.created_at,
    sla_due_at: claim.sla_due_at,
    first_response_at: claim.first_response_at,
    last_status_change_at: claim.last_status_change_at,
    sla_days: org?.sla_days ?? 17,
  });

  return c.json({
    claim,
    sla,
    steps: buildTracker({
      stage: claim.status as ClaimStage,
      submitted_at: claim.submitted_at,
      created_at: claim.created_at,
      first_response_at: claim.first_response_at,
      paid_at: paid?.paid_at ?? null,
    }),
  });
});

/**
 * Record that a human engaged. Stops the "nobody has looked at this" clock,
 * which is a different and more damaging failure than a slow decision.
 */
claims.post('/:id/acknowledge', requireWriteAccess, async (c) => {
  const user = (await currentUser(c))!;
  const id = param(c, 'id');
  const now = nowIso();

  await run(
    c.env.DB,
    `UPDATE needs SET first_response_at = COALESCE(first_response_at, ?),
                      assigned_to = COALESCE(assigned_to, ?), updated_at = ?
      WHERE id = ? AND org_id = ?`,
    now, user.id, now, id, user.org_id,
  );

  return c.json({ ok: true });
});

/**
 * Deny a claim — and require it to cite the guideline that permits the denial.
 *
 * This is the single most important validation in the product. Denials that
 * cite nothing are what members cannot check, ministries cannot defend, and
 * regulators find first.
 */
claims.post('/:id/deny', requireWriteAccess, async (c) => {
  const user = (await currentUser(c))!;
  const id = param(c, 'id');
  const { reason_code, guideline_ref, note } = await c.req.json<{
    reason_code?: string; guideline_ref?: string; note?: string;
  }>();

  if (!reason_code || !guideline_ref) {
    return c.json({
      error:
        'A denial has to cite both a reason and the guideline provision that permits it. ' +
        'A denial the member cannot check is one the ministry cannot defend.',
    }, 400);
  }

  const claim = await first<{ member_id: string; service_date: string | null; created_at: string }>(
    c.env.DB,
    'SELECT member_id, service_date, created_at FROM needs WHERE id = ? AND org_id = ? AND deleted_at IS NULL',
    id, user.org_id,
  );
  if (!claim) return c.json({ error: 'That claim was not found.' }, 404);

  // Warn — loudly, but without blocking — when the cited provision does not
  // authorize this reason, or post-dates the member joining. Blocking here
  // would push staff to pick whatever provision the form accepts; a recorded
  // warning keeps the honest record instead.
  const member = await first<{ joined_at: string | null }>(
    c.env.DB, 'SELECT joined_at FROM members WHERE id = ?', claim.member_id,
  );
  const guideline = await guidelineForMember(
    c.env, user.org_id, claim.service_date ?? claim.created_at,
  );

  const warnings: string[] = [];
  const provision = guideline?.provisions.find((p) => p.code === guideline_ref);

  if (!guideline) {
    warnings.push('No guideline version is on record for this date of service.');
  } else if (!provision) {
    warnings.push(`Provision "${guideline_ref}" does not exist in guideline ${guideline.version}.`);
  } else {
    if (!provision.supports_denial_codes.includes(reason_code)) {
      warnings.push(
        `Provision ${provision.code} does not authorize "${reason_code}". It permits: ` +
        `${provision.supports_denial_codes.join(', ') || 'no denials at all'}.`,
      );
    }
    if (member?.joined_at && guideline.effective_from > member.joined_at.slice(0, 10)) {
      warnings.push(
        `Guideline ${guideline.version} took effect ${guideline.effective_from}, after this member ` +
        `joined on ${member.joined_at.slice(0, 10)}. They never agreed to this rule.`,
      );
    }
  }

  const now = nowIso();
  const org = await first<{ appeal_sla_days: number }>(
    c.env.DB, 'SELECT appeal_sla_days FROM organizations WHERE id = ?', user.org_id,
  );

  await batch(c.env.DB, [
    c.env.DB.prepare(
      `UPDATE needs SET status = 'declined', denial_reason_code = ?, denial_guideline_ref = ?,
                        denial_note = ?, last_status_change_at = ?, updated_at = ?
        WHERE id = ? AND org_id = ?`,
    ).bind(reason_code, guideline_ref, note ?? null, now, now, id, user.org_id),
    c.env.DB.prepare(
      `INSERT INTO need_updates (id, org_id, need_id, author_id, kind, body, meta, created_at)
       VALUES (?, ?, ?, ?, 'status_change', ?, ?, ?)`,
    ).bind(
      newId('needUpdate'), user.org_id, id, user.id,
      note ?? `Not shared: ${reason_code}.`,
      JSON.stringify({ to: 'declined', reason_code, guideline_ref, warnings }), now,
    ),
  ]);

  await audit(c.env.DB, {
    orgId: user.org_id, actorId: user.id, actorKind: 'user', action: 'claim.denied',
    subjectType: 'need', subjectId: id,
    meta: { reason_code, guideline_ref, warnings },
  });
  await enqueueRecompute(c.env, user.org_id, claim.member_id, 'claim.denied');
  await c.env.CACHE.delete(`integrity:${user.org_id}`).catch(() => {});

  return c.json({
    ok: true,
    warnings,
    appeal_window_days: org?.appeal_sla_days ?? 30,
  });
});

// ── Repricing ────────────────────────────────────────────────────────────────

claims.post('/:id/reprice', requireWriteAccess, async (c) => {
  const user = (await currentUser(c))!;
  const id = param(c, 'id');
  const { medicare_cents, multiplier_bps, method, notes } = await c.req.json<{
    medicare_cents?: number; multiplier_bps?: number; method?: string; notes?: string;
  }>();

  const claim = await first<{ billed_cents: number; amount_requested_cents: number }>(
    c.env.DB,
    'SELECT billed_cents, amount_requested_cents FROM needs WHERE id = ? AND org_id = ? AND deleted_at IS NULL',
    id, user.org_id,
  );
  if (!claim) return c.json({ error: 'That claim was not found.' }, 404);

  const org = await first<{ repricing_multiplier_bps: number }>(
    c.env.DB, 'SELECT repricing_multiplier_bps FROM organizations WHERE id = ?', user.org_id,
  );

  const billed = claim.billed_cents || claim.amount_requested_cents;
  const result = reprice({
    billed_cents: billed,
    medicare_cents: Number(medicare_cents ?? 0),
    multiplier_bps: multiplier_bps ?? org?.repricing_multiplier_bps ?? DEFAULT_MULTIPLIER_BPS,
    method: (method as 'medicare_reference') ?? 'medicare_reference',
  });

  const recordId = newId('audit');
  const now = nowIso();

  await run(
    c.env.DB,
    `INSERT INTO claim_repricing (id, org_id, need_id, billed_cents, medicare_cents,
                                  multiplier_bps, repriced_cents, savings_cents, method,
                                  status, notes, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'proposed', ?, ?, ?, ?)`,
    recordId, user.org_id, id, result.billed_cents, result.medicare_cents,
    result.multiplier_bps, result.repriced_cents, result.savings_cents, result.method,
    notes ?? null, user.id, now, now,
  );

  await audit(c.env.DB, {
    orgId: user.org_id, actorId: user.id, actorKind: 'user', action: 'claim.repriced',
    subjectType: 'need', subjectId: id,
    meta: { savings_cents: result.savings_cents, multiplier_bps: result.multiplier_bps },
  });

  return c.json({ id: recordId, result }, 201);
});

/** What repricing is actually saving, across the org. */
claims.get('/repricing/summary', async (c) => {
  const user = (await currentUser(c))!;
  const rows = await all<{
    billed_cents: number; medicare_cents: number; multiplier_bps: number;
  }>(
    c.env.DB,
    `SELECT billed_cents, medicare_cents, multiplier_bps FROM claim_repricing
      WHERE org_id = ? AND status IN ('proposed', 'accepted', 'settled')`,
    user.org_id,
  );

  const summary = summarizeRepricing(
    rows.map((r) => reprice({
      billed_cents: r.billed_cents,
      medicare_cents: r.medicare_cents,
      multiplier_bps: r.multiplier_bps,
    })),
  );

  return c.json({ summary });
});

// ── Eligibility, before the procedure ────────────────────────────────────────

claims.post('/eligibility', async (c) => {
  const user = (await currentUser(c))!;
  const body = await c.req.json<Record<string, unknown>>();

  const memberId = String(body.member_id ?? '');
  const member = await first<{ joined_at: string | null; created_at: string }>(
    c.env.DB,
    'SELECT joined_at, created_at FROM members WHERE id = ? AND org_id = ? AND deleted_at IS NULL',
    memberId, user.org_id,
  );
  if (!member) return c.json({ error: 'That member was not found.' }, 404);

  const category = String(body.category ?? 'medical');
  const plannedDate = String(body.planned_date ?? nowIso());

  const [guideline, history, sharedThisYear] = await Promise.all([
    guidelineForMember(c.env, user.org_id, plannedDate),
    first<{ submitted: number; denied: number; reasons: string | null }>(
      c.env.DB,
      `SELECT COUNT(*) AS submitted,
              SUM(CASE WHEN status = 'declined' THEN 1 ELSE 0 END) AS denied,
              GROUP_CONCAT(DISTINCT denial_reason_code) AS reasons
         FROM needs
        WHERE org_id = ? AND category = ? AND deleted_at IS NULL`,
      user.org_id, category,
    ),
    first<{ total: number }>(
      c.env.DB,
      `SELECT COALESCE(SUM(amount_cents), 0) AS total FROM disbursements
        WHERE org_id = ? AND member_id = ? AND category = 'share'
          AND paid_at >= datetime('now', 'start of year')`,
      user.org_id, memberId,
    ),
  ]);

  const assessment = assessEligibility(
    {
      category,
      estimated_cents: Number(body.estimated_cents ?? 0),
      planned_date: plannedDate,
      member_joined_at: member.joined_at ?? member.created_at,
      is_preexisting: Boolean(body.is_preexisting),
      shared_this_year_cents: sharedThisYear?.total ?? 0,
    },
    guideline,
    history && history.submitted > 0
      ? {
          category,
          submitted: history.submitted,
          denied: history.denied ?? 0,
          common_denial_reasons: (history.reasons ?? '').split(',').filter(Boolean),
        }
      : null,
  );

  // Every pre-determination is logged. A member who was told "likely shared"
  // and then denied should be able to point at the record of what they were
  // told, and when.
  await audit(c.env.DB, {
    orgId: user.org_id, actorId: user.id, actorKind: 'user', action: 'eligibility.checked',
    subjectType: 'member', subjectId: memberId,
    meta: {
      category, estimated_cents: body.estimated_cents,
      verdict: assessment.verdict, guideline_version: assessment.guideline_version,
    },
  });

  return c.json({ assessment });
});

// ── Appeals ──────────────────────────────────────────────────────────────────

claims.get('/appeals', async (c) => {
  const user = (await currentUser(c))!;
  const status = c.req.query('status') ?? 'open';

  const conditions = ['a.org_id = ?'];
  const params: unknown[] = [user.org_id];
  if (status === 'open') {
    conditions.push("a.status IN ('submitted', 'in_review', 'more_info')");
  } else if (status !== 'all') {
    conditions.push('a.status = ?');
    params.push(status);
  }

  const rows = await all<Record<string, unknown>>(
    c.env.DB,
    `SELECT a.*, m.first_name, m.last_name, n.title AS claim_title,
            n.amount_requested_cents, n.denial_reason_code,
            CASE WHEN a.due_at IS NOT NULL AND a.due_at < ? THEN 1 ELSE 0 END AS overdue
       FROM appeals a
       JOIN members m ON m.id = a.member_id
       JOIN needs n ON n.id = a.need_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY overdue DESC, a.due_at ASC
      LIMIT 200`,
    nowIso(), ...params,
  );

  return c.json({ items: rows });
});

claims.post('/:id/appeal', requireWriteAccess, async (c) => {
  const user = (await currentUser(c))!;
  const needId = param(c, 'id');
  const { member_statement } = await c.req.json<{ member_statement?: string }>();

  if (!member_statement?.trim()) {
    return c.json({ error: 'An appeal needs the member’s own account of why the decision is wrong.' }, 400);
  }

  const claim = await first<{ member_id: string; status: string }>(
    c.env.DB,
    'SELECT member_id, status FROM needs WHERE id = ? AND org_id = ? AND deleted_at IS NULL',
    needId, user.org_id,
  );
  if (!claim) return c.json({ error: 'That claim was not found.' }, 404);

  const org = await first<{ appeal_sla_days: number }>(
    c.env.DB, 'SELECT appeal_sla_days FROM organizations WHERE id = ?', user.org_id,
  );
  const appealDays = org?.appeal_sla_days ?? 30;

  const id = newId('audit');
  const now = nowIso();
  const dueAt = new Date(Date.parse(now) + appealDays * 86_400_000).toISOString();

  await run(
    c.env.DB,
    `INSERT INTO appeals (id, org_id, need_id, member_id, status, member_statement,
                          submitted_at, due_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'submitted', ?, ?, ?, ?, ?)`,
    id, user.org_id, needId, claim.member_id, member_statement.trim(), now, dueAt, now, now,
  );

  await audit(c.env.DB, {
    orgId: user.org_id, actorId: user.id, actorKind: 'user', action: 'appeal.submitted',
    subjectType: 'need', subjectId: needId, meta: { appeal_id: id, due_at: dueAt },
  });
  await enqueueRecompute(c.env, user.org_id, claim.member_id, 'appeal.submitted');

  return c.json({ id, due_at: dueAt }, 201);
});

claims.post('/appeals/:appealId/decide', requireWriteAccess, async (c) => {
  const user = (await currentUser(c))!;
  const appealId = param(c, 'appealId');
  const { outcome, decision_note, guideline_ref } = await c.req.json<{
    outcome?: string; decision_note?: string; guideline_ref?: string;
  }>();

  if (outcome !== 'upheld' && outcome !== 'overturned') {
    return c.json({ error: 'An appeal is either upheld or overturned.' }, 400);
  }
  if (!decision_note?.trim()) {
    return c.json({ error: 'Tell the member why. A decision with no reasoning is not a decision.' }, 400);
  }

  const appeal = await first<{ need_id: string; member_id: string }>(
    c.env.DB, 'SELECT need_id, member_id FROM appeals WHERE id = ? AND org_id = ?', appealId, user.org_id,
  );
  if (!appeal) return c.json({ error: 'That appeal was not found.' }, 404);

  const now = nowIso();
  const statements = [
    c.env.DB.prepare(
      `UPDATE appeals SET status = ?, decision_note = ?, decision_guideline_ref = ?,
                          decided_at = ?, decided_by = ?, updated_at = ?
        WHERE id = ? AND org_id = ?`,
    ).bind(outcome, decision_note.trim(), guideline_ref ?? null, now, user.id, now, appealId, user.org_id),
  ];

  // Overturning puts the claim back into review, where it belongs — an
  // overturned appeal that leaves the claim marked declined has changed
  // nothing for the member.
  if (outcome === 'overturned') {
    statements.push(
      c.env.DB.prepare(
        `UPDATE needs SET status = 'in_review', denial_reason_code = NULL,
                          denial_guideline_ref = NULL, last_status_change_at = ?, updated_at = ?
          WHERE id = ? AND org_id = ?`,
      ).bind(now, now, appeal.need_id, user.org_id),
    );
  }

  await batch(c.env.DB, statements);
  await audit(c.env.DB, {
    orgId: user.org_id, actorId: user.id, actorKind: 'user', action: `appeal.${outcome}`,
    subjectType: 'need', subjectId: appeal.need_id, meta: { appeal_id: appealId },
  });
  await enqueueRecompute(c.env, user.org_id, appeal.member_id, `appeal.${outcome}`);

  return c.json({ ok: true });
});

/**
 * The audit-ready export.
 *
 * Orlando Health sued Liberty HealthShare for $1.1 million; asked to verify
 * the balances, Liberty could not produce patient names, procedures, dates, or
 * account numbers for its own claims. This endpoint is the answer to that
 * request, generated in one call instead of reconstructed under subpoena.
 */
claims.get('/export', requireWriteAccess, async (c) => {
  const user = (await currentUser(c))!;
  const providerNpi = c.req.query('provider_npi');
  const since = c.req.query('since');

  const conditions = ['n.org_id = ?', 'n.deleted_at IS NULL'];
  const params: unknown[] = [user.org_id];

  if (providerNpi) {
    conditions.push('n.provider_npi = ?');
    params.push(providerNpi);
  }
  if (since) {
    conditions.push('n.created_at >= ?');
    params.push(since);
  }

  const rows = await all<Record<string, unknown>>(
    c.env.DB,
    `SELECT n.id AS claim_id, m.first_name, m.last_name, m.member_number,
            n.service_date, n.procedure_code, n.diagnosis_code,
            n.provider_npi, n.provider_name, n.billed_cents, n.amount_requested_cents,
            n.amount_approved_cents, n.amount_shared_cents, n.status,
            n.submitted_at, n.last_status_change_at, n.denial_reason_code,
            n.denial_guideline_ref,
            (SELECT COALESCE(SUM(d.amount_cents), 0) FROM disbursements d
              WHERE d.need_id = n.id AND d.category = 'share') AS paid_cents,
            (SELECT MAX(d.paid_at) FROM disbursements d WHERE d.need_id = n.id) AS last_paid_at
       FROM needs n JOIN members m ON m.id = n.member_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY n.service_date DESC
      LIMIT 5000`,
    ...params,
  );

  await audit(c.env.DB, {
    orgId: user.org_id, actorId: user.id, actorKind: 'user', action: 'claims.exported',
    subjectType: 'org', subjectId: user.org_id,
    meta: { rows: rows.length, provider_npi: providerNpi ?? null, since: since ?? null },
  });

  return c.json({
    generated_at: nowIso(),
    filters: { provider_npi: providerNpi ?? null, since: since ?? null },
    count: rows.length,
    claims: rows,
  });
});

export default claims;
