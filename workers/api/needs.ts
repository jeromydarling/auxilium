import { Hono } from 'hono';
import { requireUser, requireWriteAccess, currentUser, type AppEnv } from '../lib/auth';
import { all, first, run, batch } from '../lib/db';
import { param } from '../lib/http';
import { audit } from '../lib/audit';
import { enqueueRecompute } from '../lib/nri-service';
import { newId } from '../../src/lib/ids';
import { nowIso } from '../../src/lib/utils';

const needs = new Hono<AppEnv>();
needs.use('*', requireUser);

const TERMINAL = ['completed', 'declined', 'withdrawn'];

needs.get('/', async (c) => {
  const user = (await currentUser(c))!;
  const status = c.req.query('status');
  const assigned = c.req.query('assigned_to');

  const conditions = ['n.org_id = ?', 'n.deleted_at IS NULL'];
  const params: unknown[] = [user.org_id];

  if (status === 'open') {
    conditions.push(`n.status NOT IN (${TERMINAL.map(() => '?').join(',')})`);
    params.push(...TERMINAL);
  } else if (status && status !== 'all') {
    conditions.push('n.status = ?');
    params.push(status);
  }
  if (assigned === 'unassigned') {
    conditions.push('n.assigned_to IS NULL');
  } else if (assigned) {
    conditions.push('n.assigned_to = ?');
    params.push(assigned);
  }

  const rows = await all<Record<string, unknown>>(
    c.env.DB,
    `SELECT n.*, m.first_name, m.last_name, u.name AS assignee_name
       FROM needs n
       JOIN members m ON m.id = n.member_id
       LEFT JOIN users u ON u.id = n.assigned_to
      WHERE ${conditions.join(' AND ')}
      ORDER BY
        CASE n.urgency WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
        n.amount_requested_cents DESC
      LIMIT 200`,
    ...params,
  );

  return c.json({ items: rows });
});

needs.get('/:id', async (c) => {
  const user = (await currentUser(c))!;
  const id = param(c, 'id');

  const need = await first<Record<string, unknown>>(
    c.env.DB,
    `SELECT n.*, m.first_name, m.last_name, m.email, m.phone
       FROM needs n JOIN members m ON m.id = n.member_id
      WHERE n.id = ? AND n.org_id = ? AND n.deleted_at IS NULL`,
    id, user.org_id,
  );
  if (!need) return c.json({ error: 'That case was not found.' }, 404);

  const updates = await all<Record<string, unknown>>(
    c.env.DB,
    `SELECT nu.*, u.name AS author_name
       FROM need_updates nu LEFT JOIN users u ON u.id = nu.author_id
      WHERE nu.need_id = ? AND nu.org_id = ?
      ORDER BY nu.created_at DESC`,
    id, user.org_id,
  );

  return c.json({ need, updates });
});

needs.post('/', requireWriteAccess, async (c) => {
  const user = (await currentUser(c))!;
  const body = await c.req.json<Record<string, unknown>>();

  const memberId = String(body.member_id ?? '');
  const title = String(body.title ?? '').trim();
  if (!memberId || !title) {
    return c.json({ error: 'A case needs a member and a short title.' }, 400);
  }

  const member = await first<{ id: string; household_id: string | null }>(
    c.env.DB, 'SELECT id, household_id FROM members WHERE id = ? AND org_id = ? AND deleted_at IS NULL',
    memberId, user.org_id,
  );
  if (!member) return c.json({ error: 'That member was not found.' }, 404);

  const id = newId('need');
  const now = nowIso();

  await batch(c.env.DB, [
    c.env.DB.prepare(
      `INSERT INTO needs (id, org_id, member_id, household_id, title, description, category,
                          status, amount_requested_cents, incident_date, submitted_at,
                          last_status_change_at, assigned_to, urgency, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id, user.org_id, memberId, member.household_id, title, body.description ?? null,
      body.category ?? 'medical', body.status ?? 'submitted',
      Number(body.amount_requested_cents ?? 0), body.incident_date ?? null, now, now,
      body.assigned_to ?? null, body.urgency ?? 'normal', now, now,
    ),
    c.env.DB.prepare(
      `INSERT INTO need_updates (id, org_id, need_id, author_id, kind, body, meta, created_at)
       VALUES (?, ?, ?, ?, 'status_change', 'Case opened.', ?, ?)`,
    ).bind(newId('needUpdate'), user.org_id, id, user.id, JSON.stringify({ to: body.status ?? 'submitted' }), now),
  ]);

  await audit(c.env.DB, {
    orgId: user.org_id, actorId: user.id, actorKind: 'user', action: 'need.created',
    subjectType: 'need', subjectId: id, meta: { member_id: memberId, amount_cents: body.amount_requested_cents },
  });
  await enqueueRecompute(c.env, user.org_id, memberId, 'need.created');

  return c.json({ id }, 201);
});

/**
 * Update a case. A status change writes its own timeline entry and refreshes
 * last_status_change_at, which is what the Onus "stalled" rule reads — so a
 * case that is actually being worked never looks stalled.
 */
needs.patch('/:id', requireWriteAccess, async (c) => {
  const user = (await currentUser(c))!;
  const id = param(c, 'id');
  const body = await c.req.json<Record<string, unknown>>();

  const existing = await first<{ member_id: string; status: string }>(
    c.env.DB, 'SELECT member_id, status FROM needs WHERE id = ? AND org_id = ? AND deleted_at IS NULL',
    id, user.org_id,
  );
  if (!existing) return c.json({ error: 'That case was not found.' }, 404);

  const EDITABLE = [
    'title', 'description', 'category', 'status', 'amount_requested_cents',
    'amount_approved_cents', 'amount_shared_cents', 'incident_date', 'assigned_to', 'urgency',
  ];

  const sets: string[] = [];
  const params: unknown[] = [];
  for (const field of EDITABLE) {
    if (field in body) {
      sets.push(`${field} = ?`);
      params.push(body[field] ?? null);
    }
  }
  if (sets.length === 0) return c.json({ error: 'Nothing to update.' }, 400);

  const now = nowIso();
  const statusChanged = 'status' in body && body.status !== existing.status;
  if (statusChanged) {
    sets.push('last_status_change_at = ?');
    params.push(now);
  }
  sets.push('updated_at = ?');
  params.push(now, id, user.org_id);

  const statements = [
    c.env.DB.prepare(`UPDATE needs SET ${sets.join(', ')} WHERE id = ? AND org_id = ?`).bind(...params),
  ];

  if (statusChanged) {
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO need_updates (id, org_id, need_id, author_id, kind, body, meta, created_at)
         VALUES (?, ?, ?, ?, 'status_change', ?, ?, ?)`,
      ).bind(
        newId('needUpdate'), user.org_id, id, user.id,
        `Status changed from ${existing.status} to ${body.status}.`,
        JSON.stringify({ from: existing.status, to: body.status }), now,
      ),
    );
  }

  await batch(c.env.DB, statements);
  await audit(c.env.DB, {
    orgId: user.org_id, actorId: user.id, actorKind: 'user', action: 'need.updated',
    subjectType: 'need', subjectId: id, meta: { fields: Object.keys(body) },
  });
  await enqueueRecompute(c.env, user.org_id, existing.member_id, 'need.updated');

  return c.json({ ok: true });
});

/** Add a note, an outreach record, or a payment to the case timeline. */
needs.post('/:id/updates', requireWriteAccess, async (c) => {
  const user = (await currentUser(c))!;
  const id = param(c, 'id');
  const { kind, body: text, meta } = await c.req.json<{
    kind?: string; body?: string; meta?: Record<string, unknown>;
  }>();

  const need = await first<{ member_id: string }>(
    c.env.DB, 'SELECT member_id FROM needs WHERE id = ? AND org_id = ? AND deleted_at IS NULL',
    id, user.org_id,
  );
  if (!need) return c.json({ error: 'That case was not found.' }, 404);

  const updateId = newId('needUpdate');
  const now = nowIso();

  await run(
    c.env.DB,
    `INSERT INTO need_updates (id, org_id, need_id, author_id, kind, body, meta, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    updateId, user.org_id, id, user.id, kind ?? 'note', text ?? null,
    JSON.stringify(meta ?? {}), now,
  );

  // Logging outreach touches the member's contact timestamp, which is what
  // keeps Fides honest about whether anyone actually reached out.
  if (kind === 'outreach') {
    await run(
      c.env.DB, 'UPDATE members SET last_contact_at = ?, updated_at = ? WHERE id = ? AND org_id = ?',
      now, now, need.member_id, user.org_id,
    );
  }

  await enqueueRecompute(c.env, user.org_id, need.member_id, `need.${kind ?? 'note'}`);
  return c.json({ id: updateId }, 201);
});

export default needs;
