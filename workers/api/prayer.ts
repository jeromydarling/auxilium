import { Hono } from 'hono';
import { requireUser, requireWriteAccess, currentUser, type AppEnv } from '../lib/auth';
import { all, first, run, toInt } from '../lib/db';
import { param } from '../lib/http';
import { audit } from '../lib/audit';
import { enqueueRecompute } from '../lib/nri-service';
import { newId } from '../../src/lib/ids';
import { nowIso } from '../../src/lib/utils';

const prayer = new Hono<AppEnv>();
prayer.use('*', requireUser);

/**
 * The prayer board.
 *
 * Ordering is the feature here: urgent first, then anything with an overdue
 * follow-up, then newest. A prayer board sorted by date alone quietly buries
 * the person who has been waiting longest, which is the exact failure the
 * board exists to prevent.
 */
prayer.get('/', async (c) => {
  const user = (await currentUser(c))!;
  const status = c.req.query('status') ?? 'open';
  const category = c.req.query('category');

  const conditions = ['p.org_id = ?', 'p.deleted_at IS NULL'];
  const params: unknown[] = [user.org_id];

  if (status === 'open') {
    conditions.push("p.status IN ('open', 'praying')");
  } else if (status !== 'all') {
    conditions.push('p.status = ?');
    params.push(status);
  }
  if (category) {
    conditions.push('p.category = ?');
    params.push(category);
  }

  const rows = await all<Record<string, unknown>>(
    c.env.DB,
    `SELECT p.*, m.first_name, m.last_name, u.name AS assignee_name,
            CASE WHEN p.followup_due_at IS NOT NULL AND p.followup_due_at < ?
                 THEN 1 ELSE 0 END AS followup_overdue
       FROM prayer_requests p
       LEFT JOIN members m ON m.id = p.member_id
       LEFT JOIN users u ON u.id = p.assigned_to
      WHERE ${conditions.join(' AND ')}
      ORDER BY p.is_urgent DESC, followup_overdue DESC, p.created_at DESC
      LIMIT 200`,
    nowIso(), ...params,
  );

  return c.json({ items: rows });
});

prayer.post('/', requireWriteAccess, async (c) => {
  const user = (await currentUser(c))!;
  const body = await c.req.json<Record<string, unknown>>();
  const title = String(body.title ?? '').trim();
  if (!title) return c.json({ error: 'A request needs a short title.' }, 400);

  const id = newId('prayer');
  const now = nowIso();

  // Keep household_id consistent with the member so household-level care views
  // find the request without a join through members.
  let householdId = body.household_id ?? null;
  if (body.member_id && !householdId) {
    const member = await first<{ household_id: string | null }>(
      c.env.DB, 'SELECT household_id FROM members WHERE id = ? AND org_id = ?',
      body.member_id, user.org_id,
    );
    householdId = member?.household_id ?? null;
  }

  await run(
    c.env.DB,
    `INSERT INTO prayer_requests (id, org_id, member_id, household_id, need_id, title, body,
                                  category, status, visibility, is_urgent, assigned_to,
                                  followup_due_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?)`,
    id, user.org_id, body.member_id ?? null, householdId, body.need_id ?? null,
    title, body.body ?? null, body.category ?? 'general', body.visibility ?? 'staff',
    toInt(Boolean(body.is_urgent)), body.assigned_to ?? null, body.followup_due_at ?? null,
    now, now,
  );

  await audit(c.env.DB, {
    orgId: user.org_id, actorId: user.id, actorKind: 'user', action: 'prayer.created',
    subjectType: 'prayer', subjectId: id, meta: { category: body.category, urgent: Boolean(body.is_urgent) },
  });

  if (body.member_id) {
    await enqueueRecompute(c.env, user.org_id, String(body.member_id), 'prayer.created');
  }

  return c.json({ id }, 201);
});

prayer.patch('/:id', requireWriteAccess, async (c) => {
  const user = (await currentUser(c))!;
  const id = param(c, 'id');
  const body = await c.req.json<Record<string, unknown>>();

  const existing = await first<{ member_id: string | null }>(
    c.env.DB, 'SELECT member_id FROM prayer_requests WHERE id = ? AND org_id = ? AND deleted_at IS NULL',
    id, user.org_id,
  );
  if (!existing) return c.json({ error: 'That request was not found.' }, 404);

  const EDITABLE = ['title', 'body', 'category', 'status', 'visibility', 'assigned_to', 'followup_due_at'];
  const sets: string[] = [];
  const params: unknown[] = [];

  for (const field of EDITABLE) {
    if (field in body) {
      sets.push(`${field} = ?`);
      params.push(body[field] ?? null);
    }
  }
  if ('is_urgent' in body) {
    sets.push('is_urgent = ?');
    params.push(toInt(Boolean(body.is_urgent)));
  }
  if (sets.length === 0) return c.json({ error: 'Nothing to update.' }, 400);

  sets.push('updated_at = ?');
  params.push(nowIso(), id, user.org_id);

  await run(c.env.DB, `UPDATE prayer_requests SET ${sets.join(', ')} WHERE id = ? AND org_id = ?`, ...params);

  if (existing.member_id) {
    await enqueueRecompute(c.env, user.org_id, existing.member_id, 'prayer.updated');
  }
  return c.json({ ok: true });
});

/**
 * Record that someone followed up. Clears the overdue state and schedules the
 * next check-in, so "we said we'd call back" stays a live commitment rather
 * than a one-time reminder that fires and disappears.
 */
prayer.post('/:id/followup', requireWriteAccess, async (c) => {
  const user = (await currentUser(c))!;
  const id = param(c, 'id');
  const { note, next_followup_days } = await c.req.json<{
    note?: string; next_followup_days?: number;
  }>();

  const existing = await first<{ member_id: string | null }>(
    c.env.DB, 'SELECT member_id FROM prayer_requests WHERE id = ? AND org_id = ?', id, user.org_id,
  );
  if (!existing) return c.json({ error: 'That request was not found.' }, 404);

  const now = nowIso();
  const nextDue = next_followup_days && next_followup_days > 0
    ? new Date(Date.now() + next_followup_days * 86_400_000).toISOString()
    : null;

  await run(
    c.env.DB,
    `UPDATE prayer_requests SET last_followup_at = ?, followup_due_at = ?, updated_at = ?
      WHERE id = ? AND org_id = ?`,
    now, nextDue, now, id, user.org_id,
  );

  if (existing.member_id) {
    await run(
      c.env.DB, 'UPDATE members SET last_contact_at = ?, updated_at = ? WHERE id = ? AND org_id = ?',
      now, now, existing.member_id, user.org_id,
    );
    await enqueueRecompute(c.env, user.org_id, existing.member_id, 'prayer.followup');
  }

  await audit(c.env.DB, {
    orgId: user.org_id, actorId: user.id, actorKind: 'user', action: 'prayer.followup',
    subjectType: 'prayer', subjectId: id, meta: { note: note ?? null, next_due: nextDue },
  });

  return c.json({ ok: true });
});

/** "I prayed for this." A counter, not an analytics event. */
prayer.post('/:id/pray', async (c) => {
  const user = (await currentUser(c))!;
  const id = param(c, 'id');
  await run(
    c.env.DB,
    'UPDATE prayer_requests SET prayer_count = prayer_count + 1 WHERE id = ? AND org_id = ?',
    id, user.org_id,
  );
  return c.json({ ok: true });
});

export default prayer;
