import { Hono } from 'hono';
import { requireUser, requireWriteAccess, currentUser, type AppEnv } from '../lib/auth';
import { all, first, run, batch, toInt } from '../lib/db';
import { param } from '../lib/http';
import { audit } from '../lib/audit';
import { loadSignals, enqueueRecompute } from '../lib/nri-service';
import { buildCompass } from '../../src/lib/nri/engine';
import { newId } from '../../src/lib/ids';
import { nowIso } from '../../src/lib/utils';

const households = new Hono<AppEnv>();
households.use('*', requireUser);

households.get('/', async (c) => {
  const user = (await currentUser(c))!;
  const search = c.req.query('q')?.trim();

  const conditions = ['org_id = ?', 'deleted_at IS NULL'];
  const params: unknown[] = [user.org_id];
  if (search) {
    conditions.push('name LIKE ?');
    params.push(`%${search}%`);
  }

  const rows = await all<Record<string, unknown>>(
    c.env.DB,
    `SELECT id, name, member_count, dependent_count, city, state, share_amount_cents, updated_at
       FROM households
      WHERE ${conditions.join(' AND ')}
      ORDER BY name
      LIMIT 200`,
    ...params,
  );

  return c.json({ items: rows });
});

/** One household, its people, and the aggregate Familia picture. */
households.get('/:id', async (c) => {
  const user = (await currentUser(c))!;
  const id = param(c, 'id');

  const household = await first<Record<string, unknown>>(
    c.env.DB, 'SELECT * FROM households WHERE id = ? AND org_id = ? AND deleted_at IS NULL', id, user.org_id,
  );
  if (!household) return c.json({ error: 'That household was not found.' }, 404);

  const people = await all<Record<string, unknown>>(
    c.env.DB,
    `SELECT m.id, m.first_name, m.last_name, m.email, m.phone, m.date_of_birth, m.status,
            hm.relationship, hm.is_caregiver, hm.is_dependent
       FROM household_members hm
       JOIN members m ON m.id = hm.member_id
      WHERE hm.household_id = ? AND hm.org_id = ? AND m.deleted_at IS NULL
      ORDER BY
        CASE hm.relationship
          WHEN 'primary' THEN 0 WHEN 'spouse' THEN 1 WHEN 'dependent' THEN 2 ELSE 3
        END,
        m.date_of_birth`,
    id, user.org_id,
  );

  const needs = await all<Record<string, unknown>>(
    c.env.DB,
    `SELECT * FROM needs WHERE household_id = ? AND org_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC LIMIT 25`,
    id, user.org_id,
  );

  const memberIds = people.map((p) => p.id as string);
  const signals = await loadSignals(c.env.DB, user.org_id, memberIds);

  return c.json({
    household,
    members: people.map((p) => {
      const s = signals.get(p.id as string);
      return { ...p, compass: s && s.length ? buildCompass(s) : null };
    }),
    needs,
  });
});

households.post('/', requireWriteAccess, async (c) => {
  const user = (await currentUser(c))!;
  const body = await c.req.json<Record<string, unknown>>();
  const name = String(body.name ?? '').trim();
  if (!name) return c.json({ error: 'A household needs a name.' }, 400);

  const id = newId('household');
  const now = nowIso();
  await run(
    c.env.DB,
    `INSERT INTO households (id, org_id, name, address_line1, city, state, postal_code,
                             share_amount_cents, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, user.org_id, name, body.address_line1 ?? null, body.city ?? null, body.state ?? null,
    body.postal_code ?? null, Number(body.share_amount_cents ?? 0), body.notes ?? null, now, now,
  );

  await audit(c.env.DB, {
    orgId: user.org_id, actorId: user.id, actorKind: 'user', action: 'household.created',
    subjectType: 'household', subjectId: id,
  });
  return c.json({ id }, 201);
});

/**
 * Add a member to a household. Writes the link, points the member at the
 * household, refreshes the denormalized counts, and re-scores — all in one
 * batch so the counts can never disagree with the links.
 */
households.post('/:id/members', requireWriteAccess, async (c) => {
  const user = (await currentUser(c))!;
  const householdId = param(c, 'id');
  const { member_id, relationship, is_caregiver, is_dependent } = await c.req.json<{
    member_id?: string; relationship?: string; is_caregiver?: boolean; is_dependent?: boolean;
  }>();

  if (!member_id) return c.json({ error: 'Which member should be added?' }, 400);

  const member = await first<{ id: string }>(
    c.env.DB, 'SELECT id FROM members WHERE id = ? AND org_id = ? AND deleted_at IS NULL',
    member_id, user.org_id,
  );
  if (!member) return c.json({ error: 'That member was not found.' }, 404);

  const relation = relationship ?? 'member';
  const dependent = is_dependent ?? relation === 'dependent';
  const now = nowIso();

  await batch(c.env.DB, [
    c.env.DB.prepare(
      `INSERT INTO household_members (id, org_id, household_id, member_id, relationship,
                                      is_caregiver, is_dependent, joined_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (household_id, member_id) DO UPDATE SET
         relationship = excluded.relationship,
         is_caregiver = excluded.is_caregiver,
         is_dependent = excluded.is_dependent`,
    ).bind(
      newId('householdMember'), user.org_id, householdId, member_id, relation,
      toInt(Boolean(is_caregiver)), toInt(dependent), now, now,
    ),
    c.env.DB.prepare('UPDATE members SET household_id = ?, updated_at = ? WHERE id = ? AND org_id = ?')
      .bind(householdId, now, member_id, user.org_id),
    ...recountStatements(c.env.DB, householdId, user.org_id, now),
  ]);

  await audit(c.env.DB, {
    orgId: user.org_id, actorId: user.id, actorKind: 'user', action: 'household.member_added',
    subjectType: 'household', subjectId: householdId, meta: { member_id, relationship: relation },
  });
  await enqueueRecompute(c.env, user.org_id, member_id, 'household.member_added');

  return c.json({ ok: true }, 201);
});

households.delete('/:id/members/:memberId', requireWriteAccess, async (c) => {
  const user = (await currentUser(c))!;
  const householdId = param(c, 'id');
  const memberId = param(c, 'memberId');
  const now = nowIso();

  await batch(c.env.DB, [
    c.env.DB.prepare('DELETE FROM household_members WHERE household_id = ? AND member_id = ? AND org_id = ?')
      .bind(householdId, memberId, user.org_id),
    c.env.DB.prepare('UPDATE members SET household_id = NULL, updated_at = ? WHERE id = ? AND org_id = ?')
      .bind(now, memberId, user.org_id),
    ...recountStatements(c.env.DB, householdId, user.org_id, now),
  ]);

  await audit(c.env.DB, {
    orgId: user.org_id, actorId: user.id, actorKind: 'user', action: 'household.member_removed',
    subjectType: 'household', subjectId: householdId, meta: { member_id: memberId },
  });
  await enqueueRecompute(c.env, user.org_id, memberId, 'household.member_removed');

  return c.json({ ok: true });
});

/**
 * Recompute the denormalized counts from the links. Always run as part of the
 * same batch as the membership change — the counts feed Familia scoring, and a
 * stale count is a wrong signal.
 */
export function recountStatements(
  db: D1Database,
  householdId: string,
  orgId: string,
  now: string,
): D1PreparedStatement[] {
  return [
    db.prepare(
      `UPDATE households SET
         member_count = (SELECT COUNT(*) FROM household_members WHERE household_id = ?),
         dependent_count = (SELECT COUNT(*) FROM household_members WHERE household_id = ? AND is_dependent = 1),
         updated_at = ?
       WHERE id = ? AND org_id = ?`,
    ).bind(householdId, householdId, now, householdId, orgId),
  ];
}

export default households;
