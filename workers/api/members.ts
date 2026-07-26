import { Hono } from 'hono';
import { requireUser, requireWriteAccess, currentUser, sha256, type AppContext, type AppEnv } from '../lib/auth';
import { all, first, run, encodeCursor, decodeCursor, toBool, toInt } from '../lib/db';
import { param } from '../lib/http';
import { audit } from '../lib/audit';
import { loadSignals, enqueueRecompute } from '../lib/nri-service';
import { buildCompass } from '../../src/lib/nri/engine';
import { dedupeKeys } from '../../src/lib/import/dedupe';
import { newId } from '../../src/lib/ids';
import { nowIso } from '../../src/lib/utils';

const members = new Hono<AppEnv>();
members.use('*', requireUser);

const PAGE_SIZE = 50;

/** How long a portal invite stays live. Long enough to survive a holiday. */
const INVITE_DAYS = 14;

/**
 * List members, keyset-paginated on (last_name, id).
 *
 * OFFSET pagination degrades badly on a roster of any size and gets worse as
 * the ministry grows, which is exactly backwards. The cursor is opaque so a
 * caller cannot turn it into an offset and start scanning.
 */
members.get('/', async (c) => {
  const user = (await currentUser(c))!;
  const search = c.req.query('q')?.trim();
  const status = c.req.query('status');
  const cursor = decodeCursor(c.req.query('cursor'));

  const conditions = ['org_id = ?', 'deleted_at IS NULL'];
  const params: unknown[] = [user.org_id];

  if (status && status !== 'all') {
    conditions.push('status = ?');
    params.push(status);
  }
  if (search) {
    conditions.push('(first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR member_number LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }
  if (cursor && cursor.length === 2) {
    conditions.push('(last_name > ? OR (last_name = ? AND id > ?))');
    params.push(cursor[0], cursor[0], cursor[1]);
  }

  const rows = await all<MemberListRow>(
    c.env.DB,
    `SELECT id, first_name, last_name, email, phone, status, member_number,
            household_id, last_contact_at, onboarding_complete
       FROM members
      WHERE ${conditions.join(' AND ')}
      ORDER BY last_name, id
      LIMIT ?`,
    ...params, PAGE_SIZE + 1,
  );

  const hasMore = rows.length > PAGE_SIZE;
  const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

  // Attach each member's compass so the list can show directional chips without
  // a second round trip per row.
  const signalsBySubject = await loadSignals(c.env.DB, user.org_id, items.map((m) => m.id));

  return c.json({
    items: items.map((m) => {
      const signals = signalsBySubject.get(m.id);
      return {
        ...m,
        onboarding_complete: toBool(m.onboarding_complete),
        compass: signals && signals.length ? buildCompass(signals) : null,
      };
    }),
    nextCursor: hasMore
      ? encodeCursor([items[items.length - 1].last_name, items[items.length - 1].id])
      : null,
  });
});

/** One member, with everything a staff member needs on the detail page. */
members.get('/:id', async (c) => {
  const user = (await currentUser(c))!;
  const id = param(c, 'id');

  const member = await first<Record<string, unknown>>(
    c.env.DB,
    'SELECT * FROM members WHERE id = ? AND org_id = ? AND deleted_at IS NULL',
    id, user.org_id,
  );
  if (!member) return c.json({ error: 'That member was not found.' }, 404);

  const [household, needs, prayers, documents, signals] = await Promise.all([
    member.household_id
      ? first(c.env.DB, 'SELECT * FROM households WHERE id = ? AND org_id = ?', member.household_id, user.org_id)
      : Promise.resolve(null),
    all(
      c.env.DB,
      `SELECT * FROM needs WHERE member_id = ? AND org_id = ? AND deleted_at IS NULL
        ORDER BY created_at DESC`,
      id, user.org_id,
    ),
    all(
      c.env.DB,
      `SELECT * FROM prayer_requests WHERE member_id = ? AND org_id = ? AND deleted_at IS NULL
        ORDER BY created_at DESC`,
      id, user.org_id,
    ),
    all(
      c.env.DB,
      `SELECT id, filename, content_type, size_bytes, created_at FROM documents
        WHERE subject_type = 'member' AND subject_id = ? AND org_id = ? AND deleted_at IS NULL
        ORDER BY created_at DESC`,
      id, user.org_id,
    ),
    loadSignals(c.env.DB, user.org_id, [id]),
  ]);

  const memberSignals = signals.get(id);

  return c.json({
    member: {
      ...member,
      onboarding_complete: toBool(member.onboarding_complete),
      financial_stress: toBool(member.financial_stress),
    },
    household,
    needs,
    prayer_requests: prayers,
    documents,
    compass: memberSignals && memberSignals.length ? buildCompass(memberSignals) : null,
  });
});

members.post('/', requireWriteAccess, async (c) => {
  const user = (await currentUser(c))!;
  const body = await c.req.json<Record<string, unknown>>();

  const firstName = String(body.first_name ?? '').trim();
  const lastName = String(body.last_name ?? '').trim();
  if (!firstName && !lastName) {
    return c.json({ error: 'A member needs at least a first or last name.' }, 400);
  }

  const id = newId('member');
  const now = nowIso();
  const keys = dedupeKeys({
    email: (body.email as string) ?? null,
    phone: (body.phone as string) ?? null,
    first_name: firstName,
    last_name: lastName,
    date_of_birth: (body.date_of_birth as string) ?? null,
  });

  await run(
    c.env.DB,
    `INSERT INTO members
       (id, org_id, household_id, first_name, last_name, email, phone, date_of_birth,
        status, member_number, joined_at, address_line1, city, state, postal_code,
        dedupe_email, dedupe_phone, dedupe_name_dob, onboarding_complete, financial_stress,
        notes, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?)`,
    id, user.org_id, body.household_id ?? null, firstName, lastName,
    body.email ?? null, body.phone ?? null, body.date_of_birth ?? null,
    body.status ?? 'active', body.member_number ?? null, body.joined_at ?? now,
    body.address_line1 ?? null, body.city ?? null, body.state ?? null, body.postal_code ?? null,
    keys.dedupe_email, keys.dedupe_phone, keys.dedupe_name_dob,
    toInt(Boolean(body.onboarding_complete)), toInt(Boolean(body.financial_stress)),
    body.notes ?? null, now, now,
  );

  await audit(c.env.DB, {
    orgId: user.org_id, actorId: user.id, actorKind: 'user', action: 'member.created',
    subjectType: 'member', subjectId: id,
  });
  await enqueueRecompute(c.env, user.org_id, id, 'member.created');

  return c.json({ id }, 201);
});

/** Patch a member. Only the fields present in the body are touched. */
members.patch('/:id', requireWriteAccess, async (c) => {
  const user = (await currentUser(c))!;
  const id = param(c, 'id');
  const body = await c.req.json<Record<string, unknown>>();

  const existing = await first<Record<string, unknown>>(
    c.env.DB, 'SELECT * FROM members WHERE id = ? AND org_id = ? AND deleted_at IS NULL', id, user.org_id,
  );
  if (!existing) return c.json({ error: 'That member was not found.' }, 404);

  const EDITABLE = [
    'first_name', 'last_name', 'email', 'phone', 'date_of_birth', 'status',
    'member_number', 'joined_at', 'household_id', 'address_line1', 'address_line2',
    'city', 'state', 'postal_code', 'notes', 'last_contact_at', 'last_response_at',
  ];
  const BOOLEANS = ['onboarding_complete', 'financial_stress'];

  const sets: string[] = [];
  const params: unknown[] = [];

  for (const field of EDITABLE) {
    if (field in body) {
      sets.push(`${field} = ?`);
      params.push(body[field] ?? null);
    }
  }
  for (const field of BOOLEANS) {
    if (field in body) {
      sets.push(`${field} = ?`);
      params.push(toInt(Boolean(body[field])));
    }
  }

  if (sets.length === 0) return c.json({ error: 'Nothing to update.' }, 400);

  // Any change to an identity field invalidates the dedupe keys.
  const identityChanged = ['first_name', 'last_name', 'email', 'phone', 'date_of_birth']
    .some((f) => f in body);
  if (identityChanged) {
    const keys = dedupeKeys({
      email: (body.email ?? existing.email) as string | null,
      phone: (body.phone ?? existing.phone) as string | null,
      first_name: String(body.first_name ?? existing.first_name ?? ''),
      last_name: String(body.last_name ?? existing.last_name ?? ''),
      date_of_birth: (body.date_of_birth ?? existing.date_of_birth) as string | null,
    });
    sets.push('dedupe_email = ?', 'dedupe_phone = ?', 'dedupe_name_dob = ?');
    params.push(keys.dedupe_email, keys.dedupe_phone, keys.dedupe_name_dob);
  }

  sets.push('updated_at = ?');
  params.push(nowIso(), id, user.org_id);

  await run(c.env.DB, `UPDATE members SET ${sets.join(', ')} WHERE id = ? AND org_id = ?`, ...params);
  await audit(c.env.DB, {
    orgId: user.org_id, actorId: user.id, actorKind: 'user', action: 'member.updated',
    subjectType: 'member', subjectId: id, meta: { fields: Object.keys(body) },
  });
  await enqueueRecompute(c.env, user.org_id, id, 'member.updated');

  return c.json({ ok: true });
});

/** Soft delete. The row stays for audit; every live query filters deleted_at. */
members.delete('/:id', requireRoleAdmin(), async (c) => {
  const user = (await currentUser(c))!;
  const id = param(c, 'id');
  await run(
    c.env.DB,
    'UPDATE members SET deleted_at = ?, updated_at = ? WHERE id = ? AND org_id = ?',
    nowIso(), nowIso(), id, user.org_id,
  );
  await audit(c.env.DB, {
    orgId: user.org_id, actorId: user.id, actorKind: 'user', action: 'member.deleted',
    subjectType: 'member', subjectId: id,
  });
  return c.json({ ok: true });
});

/** Log an outreach attempt — the raw material for the Fides direction. */
members.post('/:id/contact', requireWriteAccess, async (c) => {
  const user = (await currentUser(c))!;
  const id = param(c, 'id');
  const { responded, note } = await c.req.json<{ responded?: boolean; note?: string }>();
  const now = nowIso();

  await run(
    c.env.DB,
    responded
      ? 'UPDATE members SET last_contact_at = ?, last_response_at = ?, updated_at = ? WHERE id = ? AND org_id = ?'
      : 'UPDATE members SET last_contact_at = ?, updated_at = ? WHERE id = ? AND org_id = ?',
    ...(responded ? [now, now, now, id, user.org_id] : [now, now, id, user.org_id]),
  );

  await audit(c.env.DB, {
    orgId: user.org_id, actorId: user.id, actorKind: 'user', action: 'member.contacted',
    subjectType: 'member', subjectId: id, meta: { responded: Boolean(responded), note: note ?? null },
  });
  await enqueueRecompute(c.env, user.org_id, id, 'member.contacted');

  return c.json({ ok: true });
});

function requireRoleAdmin() {
  return async (c: AppContext, next: () => Promise<void>) => {
    const user = await currentUser(c);
    if (!user) return c.json({ error: 'Not signed in.' }, 401);
    if (!['owner', 'admin'].includes(user.role)) {
      return c.json({ error: 'Only an owner or admin can remove a member.' }, 403);
    }
    return next();
  };
}

interface MemberListRow {
  id: string; first_name: string; last_name: string; email: string | null;
  phone: string | null; status: string; member_number: string | null;
  household_id: string | null; last_contact_at: string | null; onboarding_complete: number;
}

/**
 * Invite a member to the portal.
 *
 * Creates the account if it does not exist, mints a single-use link, and
 * returns it. Auxilium does not send the email — the ministry does, from its
 * own address, because a household that has never heard of us is far more
 * likely to open a message from the ministry it belongs to than one from a
 * vendor it has not heard of. That is also why the link is returned in the
 * response rather than only mailed: staff need to be able to read it out over
 * the phone to somebody who cannot find the email.
 *
 * Re-inviting is allowed and expected — people lose links. Every earlier
 * outstanding invite for that account is voided first, so exactly one link is
 * ever live and a screenshot of an old one is worth nothing.
 */
members.post('/:id/invite', requireWriteAccess, async (c) => {
  const user = (await currentUser(c))!;
  const memberId = param(c, 'id');
  const body = await c.req.json<{ email?: string }>().catch(() => ({ email: undefined }));

  const member = await first<{ id: string; email: string | null; first_name: string; last_name: string }>(
    c.env.DB,
    `SELECT id, email, first_name, last_name FROM members
      WHERE id = ? AND org_id = ? AND deleted_at IS NULL`,
    memberId, user.org_id,
  );
  if (!member) return c.json({ error: 'No such member.' }, 404);

  const email = (body.email ?? member.email ?? '').trim();
  if (!email) {
    return c.json(
      { error: 'This member has no email address. Add one, or pass an address to invite them at.' },
      400,
    );
  }

  const now = nowIso();
  let account = await first<{ id: string; status: string }>(
    c.env.DB,
    'SELECT id, status FROM member_accounts WHERE member_id = ? AND deleted_at IS NULL',
    member.id,
  );

  if (!account) {
    const accountId = newId('memberAccount');
    await run(
      c.env.DB,
      `INSERT INTO member_accounts (id, org_id, member_id, email, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'invited', ?, ?)`,
      accountId, user.org_id, member.id, email, now, now,
    );
    account = { id: accountId, status: 'invited' };
  } else if (account.status === 'suspended') {
    // Re-inviting a suspended account would quietly restore access that
    // somebody deliberately revoked. Lifting a suspension is its own decision.
    return c.json({ error: 'This account is suspended. Restore it before inviting again.' }, 409);
  } else {
    await run(
      c.env.DB,
      'UPDATE member_accounts SET email = ?, updated_at = ? WHERE id = ?',
      email, now, account.id,
    );
  }

  // Exactly one live link per account.
  await run(
    c.env.DB,
    'UPDATE member_invites SET used_at = ? WHERE member_account_id = ? AND used_at IS NULL',
    now, account.id,
  );

  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '');
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 86_400_000).toISOString();

  await run(
    c.env.DB,
    `INSERT INTO member_invites (id, org_id, member_account_id, token_hash, expires_at, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    newId('memberInvite'), user.org_id, account.id, await sha256(token), expiresAt, user.id, now,
  );

  await audit(c.env.DB, {
    orgId: user.org_id,
    actorId: user.id,
    actorKind: 'user',
    action: 'member_account.invited',
    subjectType: 'member',
    subjectId: member.id,
    meta: { email },
  });

  const origin = new URL(c.req.url).origin;

  return c.json({
    // Relative too, because a ministry on a custom domain should paste its own
    // hostname into the email rather than whatever this Worker answers on.
    invite_url: `${origin}/app/portal/accept/${token}`,
    invite_path: `/app/portal/accept/${token}`,
    email,
    expires_at: expiresAt,
    name: `${member.first_name} ${member.last_name}`.trim(),
  });
});

/** Revoke portal access without deleting the account or its history. */
members.post('/:id/suspend-portal', requireWriteAccess, async (c) => {
  const user = (await currentUser(c))!;
  const memberId = param(c, 'id');
  const now = nowIso();

  const account = await first<{ id: string }>(
    c.env.DB,
    `SELECT ma.id FROM member_accounts ma
       JOIN members m ON m.id = ma.member_id
      WHERE ma.member_id = ? AND m.org_id = ? AND ma.deleted_at IS NULL`,
    memberId, user.org_id,
  );
  if (!account) return c.json({ error: 'This member has no portal account.' }, 404);

  await run(
    c.env.DB,
    "UPDATE member_accounts SET status = 'suspended', updated_at = ? WHERE id = ?",
    now, account.id,
  );
  // Suspending while a session is live would be theatre.
  await run(c.env.DB, 'DELETE FROM member_sessions WHERE member_account_id = ?', account.id);
  await run(
    c.env.DB,
    'UPDATE member_invites SET used_at = ? WHERE member_account_id = ? AND used_at IS NULL',
    now, account.id,
  );

  await audit(c.env.DB, {
    orgId: user.org_id, actorId: user.id, actorKind: 'user',
    action: 'member_account.suspended', subjectType: 'member', subjectId: memberId,
  });

  return c.json({ ok: true });
});

export default members;
