import { Hono } from 'hono';
import {
  type AppEnv, hashPassword, verifyPassword, sha256, createMemberSession,
  destroyMemberSession, currentMember, requireMember,
  checkLoginRate, recordLoginFailure, clearLoginFailures,
} from '../lib/auth';
import { all, first, run } from '../lib/db';
import { param } from '../lib/http';
import { evaluateSla, buildTracker, type ClaimStage } from '../../src/lib/claims/sla';
import { nowIso } from '../../src/lib/utils';
import { audit } from '../lib/audit';

/**
 * The member portal's front door.
 *
 * Members are not staff with fewer permissions. They are a different audience
 * against a different table, reached through a different cookie, and the whole
 * point of keeping them separate is that no staff query can accidentally
 * include them and no member session can accidentally satisfy a staff route.
 *
 * Two rules shape everything here:
 *
 *   • **A member sets their own password.** Staff issue an invite link; nobody
 *     ever chooses a credential on a member's behalf. A ministry mailing five
 *     thousand households a password it picked would put the same secret in an
 *     inbox, a support ticket, and a spreadsheet.
 *   • **Failures are indistinguishable.** Wrong password, unknown email,
 *     suspended account, never-invited account — all return the same message.
 *     Anything else turns this endpoint into a directory of who is a member of
 *     a health sharing ministry, which is not a fact we get to leak.
 */
const memberAuth = new Hono<AppEnv>();

/** Shown for every failed sign-in, whatever actually went wrong. */
const GENERIC_FAILURE = 'That email and password do not match an account.';

memberAuth.post('/login', async (c) => {
  const { email, password } = await c.req.json<{ email?: string; password?: string }>();
  if (!email || !password) {
    return c.json({ error: 'Enter your email and password.' }, 400);
  }

  const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
  if (!(await checkLoginRate(c.env, ip, email))) {
    return c.json({ error: 'Too many attempts. Wait fifteen minutes and try again.' }, 429);
  }

  const account = await first<{
    id: string; org_id: string; member_id: string; email: string;
    password_hash: string | null; password_salt: string | null; status: string;
    first_name: string; last_name: string;
  }>(
    c.env.DB,
    `SELECT ma.id, ma.org_id, ma.member_id, ma.email, ma.password_hash, ma.password_salt,
            ma.status, m.first_name, m.last_name
       FROM member_accounts ma
       JOIN members m ON m.id = ma.member_id
      WHERE lower(ma.email) = lower(?) AND ma.deleted_at IS NULL AND m.deleted_at IS NULL`,
    email,
  );

  // Every one of these is the same answer to the caller. An account that has
  // been invited but never activated has no password hash, so it fails here
  // rather than anywhere that would reveal it exists.
  const ok = account?.password_hash && account.password_salt && account.status === 'active'
    ? await verifyPassword(password, account.password_hash, account.password_salt)
    : false;

  if (!ok || !account) {
    await recordLoginFailure(c.env, ip, email);
    return c.json({ error: GENERIC_FAILURE }, 401);
  }

  await clearLoginFailures(c.env, ip, email);
  await run(
    c.env.DB,
    'UPDATE member_accounts SET last_seen_at = ?, updated_at = ? WHERE id = ?',
    nowIso(), nowIso(), account.id,
  );

  await createMemberSession(c, account);

  return c.json({
    member: {
      id: account.id,
      member_id: account.member_id,
      org_id: account.org_id,
      email: account.email,
      name: `${account.first_name} ${account.last_name}`.trim(),
      role: 'member',
    },
  });
});

memberAuth.post('/logout', async (c) => {
  await destroyMemberSession(c);
  return c.json({ ok: true });
});

memberAuth.get('/me', requireMember, async (c) => {
  const member = (await currentMember(c))!;
  const org = await first<{ name: string; slug: string; brand: string }>(
    c.env.DB,
    'SELECT name, slug, brand FROM organizations WHERE id = ?',
    member.org_id,
  );
  return c.json({ member, org });
});

/**
 * Look at an invite without redeeming it.
 *
 * Lets the set-password screen greet the person by name and show the address
 * the invite was sent to, so someone forwarded a link can tell immediately
 * that it is not theirs. Deliberately returns nothing else about the account.
 */
memberAuth.get('/invite/:token', async (c) => {
  const invite = await loadInvite(c.env.DB, c.req.param('token'));
  if (!invite) return c.json({ error: 'This invitation is no longer valid.' }, 404);
  return c.json({
    email: invite.email,
    name: `${invite.first_name} ${invite.last_name}`.trim(),
    org_name: invite.org_name,
  });
});

/**
 * Redeem an invite: set a password, activate, and sign in.
 *
 * The invite is marked used in the same statement that reads it as unused, so
 * two tabs racing the same link cannot both succeed.
 */
memberAuth.post('/invite/:token', async (c) => {
  const { password } = await c.req.json<{ password?: string }>();

  // Length is the only rule. Composition rules — a number, a symbol, a capital
  // — are well established to push people toward "Password1!" and a sticky
  // note, and this is a portal people sign into a few times a year.
  if (!password || password.length < 10) {
    return c.json({ error: 'Choose a password of at least 10 characters.' }, 400);
  }

  const token = c.req.param('token');
  const invite = await loadInvite(c.env.DB, token);
  if (!invite) return c.json({ error: 'This invitation is no longer valid.' }, 404);

  const now = nowIso();
  const claimed = await c.env.DB
    .prepare('UPDATE member_invites SET used_at = ? WHERE id = ? AND used_at IS NULL')
    .bind(now, invite.id)
    .run();

  // Whoever lost the race gets the same answer as a stale link, because from
  // the caller's side that is exactly what it now is.
  if (!claimed.meta.changes) {
    return c.json({ error: 'This invitation is no longer valid.' }, 404);
  }

  const { hash, salt } = await hashPassword(password);
  await run(
    c.env.DB,
    `UPDATE member_accounts
        SET password_hash = ?, password_salt = ?, status = 'active', updated_at = ?
      WHERE id = ?`,
    hash, salt, now, invite.member_account_id,
  );

  await audit(c.env.DB, {
    orgId: invite.org_id,
    actorId: invite.member_account_id,
    actorKind: 'member',
    action: 'member_account.activated',
    subjectType: 'member_account',
    subjectId: invite.member_account_id,
  });

  await createMemberSession(c, { id: invite.member_account_id });

  return c.json({ ok: true, email: invite.email });
});

/** Change your own password. Requires the current one — a live session is not enough. */
memberAuth.post('/password', requireMember, async (c) => {
  const member = (await currentMember(c))!;
  const { current, next } = await c.req.json<{ current?: string; next?: string }>();

  if (!next || next.length < 10) {
    return c.json({ error: 'Choose a password of at least 10 characters.' }, 400);
  }

  const account = await first<{ password_hash: string; password_salt: string }>(
    c.env.DB,
    'SELECT password_hash, password_salt FROM member_accounts WHERE id = ?',
    member.id,
  );

  // A borrowed laptop with a live session must not be enough to lock the real
  // member out of their own medical record.
  if (!account || !(await verifyPassword(current ?? '', account.password_hash, account.password_salt))) {
    return c.json({ error: 'Your current password is not correct.' }, 401);
  }

  const { hash, salt } = await hashPassword(next);
  await run(
    c.env.DB,
    'UPDATE member_accounts SET password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?',
    hash, salt, nowIso(), member.id,
  );

  // Every other session is dropped. A password change is usually a response to
  // believing someone else has access, and leaving their session alive would
  // make the change theatre.
  await run(
    c.env.DB,
    'DELETE FROM member_sessions WHERE member_account_id = ?',
    member.id,
  );
  await createMemberSession(c, { id: member.id });

  await audit(c.env.DB, {
    orgId: member.org_id,
    actorId: member.id,
    actorKind: 'member',
    action: 'member_account.password_changed',
    subjectType: 'member_account',
    subjectId: member.id,
  });

  return c.json({ ok: true });
});

// ── The member's own record ──────────────────────────────────────────────────

/**
 * Every query below is scoped by `member_id`, not by `org_id`.
 *
 * That is the authorization boundary and it is the only one that matters here.
 * Staff routes scope by org because a staff member may legitimately see any
 * member in their ministry; a member may see exactly one person's medical
 * circumstances — their own. An org-scoped query on this side would hand every
 * member the whole roster's claims, and it would look completely normal in
 * review.
 */

/** My claims, newest first, each with its live SLA state. */
memberAuth.get('/claims', requireMember, async (c) => {
  const member = (await currentMember(c))!;

  const org = await first<{ sla_days: number }>(
    c.env.DB, 'SELECT sla_days FROM organizations WHERE id = ?', member.org_id,
  );
  const slaDays = org?.sla_days ?? 17;

  const rows = await all<{
    id: string; status: string; title: string; submitted_at: string | null; created_at: string;
    sla_due_at: string | null; first_response_at: string | null; last_status_change_at: string | null;
    amount_requested_cents: number; denial_reason_code: string | null;
    denial_guideline_ref: string | null; denial_note: string | null;
  }>(
    c.env.DB,
    `SELECT id, status, title, submitted_at, created_at, sla_due_at, first_response_at,
            last_status_change_at, amount_requested_cents, denial_reason_code,
            denial_guideline_ref, denial_note
       FROM needs
      WHERE member_id = ? AND deleted_at IS NULL
      ORDER BY COALESCE(submitted_at, created_at) DESC
      LIMIT 100`,
    member.member_id,
  );

  return c.json({
    claims: rows.map((claim) => ({
      claim,
      sla: evaluateSla({
        stage: claim.status as ClaimStage,
        submitted_at: claim.submitted_at,
        created_at: claim.created_at,
        sla_due_at: claim.sla_due_at,
        first_response_at: claim.first_response_at,
        last_status_change_at: claim.last_status_change_at,
        sla_days: slaDays,
      }),
    })),
  });
});

/** One claim, with the tracker. Package-tracking UX for a medical bill. */
memberAuth.get('/claims/:id', requireMember, async (c) => {
  const member = (await currentMember(c))!;

  const claim = await first<{
    id: string; status: string; title: string; submitted_at: string | null; created_at: string;
    sla_due_at: string | null; first_response_at: string | null; last_status_change_at: string | null;
    amount_requested_cents: number; denial_reason_code: string | null;
    denial_guideline_ref: string | null; denial_note: string | null;
  }>(
    c.env.DB,
    `SELECT id, status, title, submitted_at, created_at, sla_due_at, first_response_at,
            last_status_change_at, amount_requested_cents, denial_reason_code,
            denial_guideline_ref, denial_note
       FROM needs
      WHERE id = ? AND member_id = ? AND deleted_at IS NULL`,
    param(c, 'id'), member.member_id,
  );
  // Somebody else's claim and a claim that does not exist are the same answer.
  // Anything else confirms which ids are real.
  if (!claim) return c.json({ error: 'That claim was not found.' }, 404);

  const org = await first<{ sla_days: number }>(
    c.env.DB, 'SELECT sla_days FROM organizations WHERE id = ?', member.org_id,
  );
  const paid = await first<{ paid_at: string }>(
    c.env.DB,
    "SELECT paid_at FROM disbursements WHERE need_id = ? AND category = 'share' ORDER BY paid_at LIMIT 1",
    claim.id,
  );

  return c.json({
    claim,
    sla: evaluateSla({
      stage: claim.status as ClaimStage,
      submitted_at: claim.submitted_at,
      created_at: claim.created_at,
      sla_due_at: claim.sla_due_at,
      first_response_at: claim.first_response_at,
      last_status_change_at: claim.last_status_change_at,
      sla_days: org?.sla_days ?? 17,
    }),
    steps: buildTracker({
      stage: claim.status as ClaimStage,
      submitted_at: claim.submitted_at,
      created_at: claim.created_at,
      first_response_at: claim.first_response_at,
      paid_at: paid?.paid_at ?? null,
    }),
  });
});

interface InviteRow {
  id: string;
  org_id: string;
  member_account_id: string;
  email: string;
  first_name: string;
  last_name: string;
  org_name: string;
}

/** An invite that exists, has not been used, and has not expired. */
async function loadInvite(db: D1Database, token: string): Promise<InviteRow | null> {
  if (!token || token.length < 20) return null;
  const tokenHash = await sha256(token);
  const row = await first<InviteRow & { expires_at: string }>(
    db,
    `SELECT i.id, i.org_id, i.member_account_id, i.expires_at,
            ma.email, m.first_name, m.last_name, o.name AS org_name
       FROM member_invites i
       JOIN member_accounts ma ON ma.id = i.member_account_id
       JOIN members m ON m.id = ma.member_id
       JOIN organizations o ON o.id = i.org_id
      WHERE i.token_hash = ? AND i.used_at IS NULL
        AND ma.deleted_at IS NULL AND m.deleted_at IS NULL`,
    tokenHash,
  );
  if (!row) return null;
  if (Date.parse(row.expires_at) < Date.now()) return null;
  return row;
}

export default memberAuth;
