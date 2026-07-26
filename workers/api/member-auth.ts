import { Hono } from 'hono';
import {
  type AppEnv, hashPassword, verifyPassword, sha256, createMemberSession,
  destroyMemberSession, currentMember, requireMember,
  checkLoginRate, recordLoginFailure, clearLoginFailures,
} from '../lib/auth';
import { all, first, run, json } from '../lib/db';
import { param } from '../lib/http';
import { evaluateSla, buildTracker, type ClaimStage } from '../../src/lib/claims/sla';
import { nowIso } from '../../src/lib/utils';
import { audit } from '../lib/audit';
import {
  DEFAULT_HEALTH_FORM, validateDisclosure, lookbackLabel, type HealthDisclosureForm,
} from '../../src/lib/applications/health';
import { newId } from '../../src/lib/ids';

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
  // Parsed here rather than in the browser. The portal styles itself from this
  // on first paint, and a client that has to JSON.parse a column first would
  // flash our colours before the ministry's.
  return c.json({
    member,
    org: org ? { ...org, brand: json(org.brand, {}) } : null,
  });
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
    // Scoped by the org the invite belongs to as well as by the account id. The
    // id came from a single-use token so it cannot be forged, but a statement
    // that carries its own tenant cannot be widened by a later change to the
    // lookup above.
    `UPDATE member_accounts
        SET password_hash = ?, password_salt = ?, status = 'active', updated_at = ?
      WHERE id = ? AND org_id = ?`,
    hash, salt, now, invite.member_account_id, invite.org_id,
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

// ── Health disclosure ────────────────────────────────────────────────────────

/**
 * The second stage of joining.
 *
 * This is why the public application asks nothing medical. A member reaches
 * this signed in, against a known account, and every submission is audited.
 *
 * Scoped by `member_id` like everything else on this side: a member discloses
 * for themselves. Household members who cannot sign in are disclosed for by
 * staff, which is a different route and a different record.
 */

/** The ministry's questions, and what this member has said so far. */
memberAuth.get('/health-disclosure', requireMember, async (c) => {
  const member = (await currentMember(c))!;
  const form = await loadHealthForm(c.env, member.org_id);

  const existing = await first<{
    id: string; answers: string; completed_at: string | null; lookback_months: number;
  }>(
    c.env.DB,
    `SELECT id, answers, completed_at, lookback_months
       FROM member_health_disclosures
      WHERE member_id = ? AND superseded_at IS NULL`,
    member.member_id,
  );

  return c.json({
    // Rendered here rather than in the browser so the wording a member reads
    // and the wording a reviewer reads come from one function.
    form: { ...form, lookbackLabel: lookbackLabel(form.lookback_months) },
    disclosure: existing
      ? {
          answers: json(existing.answers, {}),
          completed_at: existing.completed_at,
          // What they were actually asked. A "no" to a 24-month question is not
          // a "no" to a 36-month one, so the window they answered under travels
          // with the answers.
          lookback_months: existing.lookback_months,
        }
      : null,
  });
});

/**
 * Save or submit.
 *
 * A draft can be edited freely. Submitting closes it: what somebody disclosed
 * is evidence, and evidence that can be quietly edited afterwards is not
 * evidence. A member who remembers something later supersedes rather than
 * overwrites, so the original and the correction both survive — the gap between
 * them is occasionally the whole question.
 */
memberAuth.post('/health-disclosure', requireMember, async (c) => {
  const member = (await currentMember(c))!;
  const { answers, submit } = await c.req.json<{
    answers?: Record<string, { answer: boolean; detail?: string }>;
    submit?: boolean;
  }>();

  const form = await loadHealthForm(c.env, member.org_id);

  if (submit) {
    const issues = validateDisclosure(form, { answers: answers ?? {} });
    if (issues.length > 0) return c.json({ issues }, 422);
  }

  const now = nowIso();
  const existing = await first<{ id: string; completed_at: string | null }>(
    c.env.DB,
    'SELECT id, completed_at FROM member_health_disclosures WHERE member_id = ? AND superseded_at IS NULL',
    member.member_id,
  );

  if (existing?.completed_at) {
    // Already submitted. The correction supersedes it; the original stays.
    //
    // Order matters and is not interchangeable. The old row is retired first so
    // the one-live-row index is free, then the new row is inserted pointing
    // backwards at it — so the foreign key always references a row that exists.
    // Doing it the other way round fails one constraint or the other.
    const id = newId('healthDisclosure');
    await c.env.DB.batch([
      c.env.DB.prepare(
        // Same reasoning as the draft update below: the tenant predicate is
        // restated so the statement is safe read on its own.
        `UPDATE member_health_disclosures
            SET superseded_at = ?, updated_at = ?
          WHERE id = ? AND member_id = ?`,
      ).bind(now, now, existing.id, member.member_id),
      c.env.DB.prepare(
        `INSERT INTO member_health_disclosures
           (id, org_id, member_id, answers, form_version, lookback_months,
            completed_at, supersedes_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        id, member.org_id, member.member_id, JSON.stringify(answers ?? {}),
        form.version, form.lookback_months, submit ? now : null, existing.id, now, now,
      ),
    ]);

    await audit(c.env.DB, {
      orgId: member.org_id, actorId: member.id, actorKind: 'member',
      action: 'health_disclosure.corrected', subjectType: 'member', subjectId: member.member_id,
      meta: { supersedes: existing.id },
    });

    return c.json({ ok: true, corrected: true });
  }

  if (existing) {
    await run(
      c.env.DB,
      // `member_id` restated even though `existing.id` came from a member-scoped
      // read. It costs one bind parameter and makes the statement safe on its own
      // terms — a reviewer does not have to trace where the id came from, and a
      // later refactor of the read above cannot silently widen the write.
      `UPDATE member_health_disclosures
          SET answers = ?, form_version = ?, lookback_months = ?, completed_at = ?, updated_at = ?
        WHERE id = ? AND member_id = ?`,
      JSON.stringify(answers ?? {}), form.version, form.lookback_months,
      submit ? now : null, now, existing.id, member.member_id,
    );
  } else {
    await run(
      c.env.DB,
      `INSERT INTO member_health_disclosures
         (id, org_id, member_id, answers, form_version, lookback_months, completed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      newId('healthDisclosure'), member.org_id, member.member_id,
      JSON.stringify(answers ?? {}), form.version, form.lookback_months,
      submit ? now : null, now, now,
    );
  }

  if (submit) {
    await audit(c.env.DB, {
      orgId: member.org_id, actorId: member.id, actorKind: 'member',
      action: 'health_disclosure.submitted', subjectType: 'member', subjectId: member.member_id,
    });
  }

  return c.json({ ok: true, submitted: Boolean(submit) });
});

/** The ministry's health form, or the default. */
async function loadHealthForm(db: AppEnv['Bindings'], orgId: string): Promise<HealthDisclosureForm & { version: number }> {
  const row = await first<{
    lookback_months: number; extended: string; intro: string | null;
    questions: string; version: number;
  }>(
    db.DB,
    'SELECT lookback_months, extended, intro, questions, version FROM health_disclosure_forms WHERE org_id = ?',
    orgId,
  );

  if (!row) return { ...DEFAULT_HEALTH_FORM, version: 1 };

  const questions = json(row.questions, []) as HealthDisclosureForm['questions'];
  return {
    lookback_months: row.lookback_months,
    extended: json(row.extended, []) as HealthDisclosureForm['extended'],
    intro: row.intro ?? undefined,
    // A stored form with no questions is a ministry mid-edit, not an intent to
    // ask nothing — and a health disclosure that asks nothing is worse than
    // none, because it looks answered.
    questions: questions.length > 0 ? questions : DEFAULT_HEALTH_FORM.questions,
    version: row.version,
  };
}

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
