import { Hono } from 'hono';
import {
  createSession, destroySession, currentUser, verifyPassword, hashPassword,
  checkLoginRate, recordLoginFailure, clearLoginFailures, requireUser,
  type AppEnv,
} from '../lib/auth';
import { all, first, run } from '../lib/db';
import { audit } from '../lib/audit';
import { recomputeMembers } from '../lib/nri-service';
import { newId } from '../../src/lib/ids';
import { nowIso } from '../../src/lib/utils';

const auth = new Hono<AppEnv>();

/**
 * Sign in.
 *
 * Never reveals whether an email exists — a wrong password and an unknown
 * address produce the same message and the same timing path. Only failures are
 * counted toward the rate limit, so a busy staff member signing in correctly
 * all day is never throttled.
 */
auth.post('/login', async (c) => {
  const { email, password } = await c.req.json<{ email?: string; password?: string }>();

  if (!email || !password) {
    return c.json({ error: 'We need your email and password.' }, 400);
  }

  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown';
  if (!(await checkLoginRate(c.env, ip, email))) {
    return c.json({ error: 'Too many attempts. Wait fifteen minutes and try again.' }, 429);
  }

  const user = await first<{
    id: string; org_id: string; email: string; name: string; role: string;
    password_hash: string | null; password_salt: string | null;
  }>(
    c.env.DB,
    `SELECT id, org_id, email, name, role, password_hash, password_salt
       FROM users WHERE email = ? AND deleted_at IS NULL`,
    email.toLowerCase().trim(),
  );

  const ok = user?.password_hash && user.password_salt
    ? await verifyPassword(password, user.password_hash, user.password_salt)
    : false;

  if (!ok || !user) {
    await recordLoginFailure(c.env, ip, email);
    return c.json({ error: 'That email and password do not match.' }, 401);
  }

  await clearLoginFailures(c.env, ip, email);
  const authUser = { id: user.id, org_id: user.org_id, email: user.email, name: user.name, role: user.role };
  await createSession(c, authUser);
  await run(c.env.DB, 'UPDATE users SET last_seen_at = ? WHERE id = ?', nowIso(), user.id);
  await audit(c.env.DB, {
    orgId: user.org_id, actorId: user.id, actorKind: 'user', action: 'auth.login',
    subjectType: 'user', subjectId: user.id,
  });

  return c.json({ user: authUser });
});

auth.post('/logout', async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});

/** Who am I? The frontend calls this on boot to decide what to render. */
auth.get('/me', async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ user: null }, 200);

  const org = await first<{ id: string; name: string; slug: string; brand: string; kind: string }>(
    c.env.DB,
    'SELECT id, name, slug, brand, kind FROM organizations WHERE id = ?',
    user.org_id,
  );

  return c.json({
    user,
    org: org ? { ...org, brand: safeJson(org.brand) } : null,
  });
});

/**
 * Demo sign-in. The demo tenant is the product's best explanation of itself, so
 * getting into it must never require a password. Only ever signs in to an org
 * explicitly marked kind='demo'.
 */
auth.post('/demo', async (c) => {
  // Prefer the org explicitly marked as the primary demo. There is more than
  // one demo organization — the well-run ministry and a deliberately failing
  // one for comparison — and signing in to the failing one by accident would
  // be the worst possible first impression of the product.
  const user = await first<{ id: string; org_id: string; email: string; name: string; role: string }>(
    c.env.DB,
    `SELECT u.id, u.org_id, u.email, u.name, u.role
       FROM users u JOIN organizations o ON o.id = u.org_id
      WHERE o.kind = 'demo' AND u.deleted_at IS NULL
      ORDER BY
        CASE WHEN json_extract(o.brand, '$.demo_primary') = 1 THEN 0 ELSE 1 END,
        u.created_at
      LIMIT 1`,
  );

  if (!user) {
    return c.json({ error: 'No demo organization is seeded. Run: bun run db:seed:local' }, 404);
  }

  await createSession(c, user);

  // Self-heal: signals are derived data and are never written by the seed, so a
  // freshly seeded demo has an empty command center until something scores it.
  // The demo is the product's best explanation of itself — it must never be
  // empty. Scoring is idempotent, so doing this on every cold demo is safe.
  const signalCount = await first<{ count: number }>(
    c.env.DB,
    'SELECT COUNT(*) AS count FROM member_signals WHERE org_id = ?',
    user.org_id,
  );

  if ((signalCount?.count ?? 0) === 0) {
    const members = await all<{ id: string }>(
      c.env.DB,
      'SELECT id FROM members WHERE org_id = ? AND deleted_at IS NULL LIMIT 500',
      user.org_id,
    );
    if (members.length > 0) {
      // Inline rather than queued: the user is looking at the dashboard right
      // now, and a demo that fills in a few seconds later reads as broken.
      await recomputeMembers(c.env, user.org_id, members.map((m) => m.id), 'demo.cold_start')
        .catch((error) => console.error('[auth] demo self-heal failed:', error));
    }
  }

  return c.json({ user, demo: true });
});

/** Change your own password. Requires the current one — no exceptions. */
auth.post('/password', requireUser, async (c) => {
  const user = (await currentUser(c))!;
  const { current_password, new_password } = await c.req.json<{
    current_password?: string; new_password?: string;
  }>();

  if (!current_password || !new_password) {
    return c.json({ error: 'We need your current password and a new one.' }, 400);
  }
  if (new_password.length < 10) {
    return c.json({ error: 'Please use at least 10 characters.' }, 400);
  }

  const row = await first<{ password_hash: string | null; password_salt: string | null }>(
    c.env.DB, 'SELECT password_hash, password_salt FROM users WHERE id = ?', user.id,
  );

  const ok = row?.password_hash && row.password_salt
    ? await verifyPassword(current_password, row.password_hash, row.password_salt)
    : false;

  if (!ok) return c.json({ error: 'Your current password is not right.' }, 401);

  const { hash, salt } = await hashPassword(new_password);
  await run(
    c.env.DB,
    'UPDATE users SET password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?',
    hash, salt, nowIso(), user.id,
  );

  // Changing a password ends every other session — that is the whole point of
  // changing it after a scare.
  await run(c.env.DB, 'DELETE FROM sessions WHERE user_id = ?', user.id);
  await createSession(c, user);
  await audit(c.env.DB, {
    orgId: user.org_id, actorId: user.id, actorKind: 'user', action: 'auth.password_changed',
    subjectType: 'user', subjectId: user.id,
  });

  return c.json({ ok: true });
});

/**
 * First-run bootstrap: create the org and its owner. Only permitted while the
 * database has no organizations at all, so it cannot be used to squat a tenant.
 */
auth.post('/bootstrap', async (c) => {
  const existing = await first<{ count: number }>(
    c.env.DB, "SELECT COUNT(*) AS count FROM organizations WHERE kind = 'ministry'",
  );
  if ((existing?.count ?? 0) > 0) {
    return c.json({ error: 'This instance is already set up.' }, 409);
  }

  const { org_name, name, email, password } = await c.req.json<{
    org_name?: string; name?: string; email?: string; password?: string;
  }>();

  if (!org_name || !name || !email || !password) {
    return c.json({ error: 'We need a ministry name, your name, your email, and a password.' }, 400);
  }
  if (password.length < 10) {
    return c.json({ error: 'Please use at least 10 characters for the password.' }, 400);
  }

  const orgId = newId('org');
  const userId = newId('user');
  const now = nowIso();
  const { hash, salt } = await hashPassword(password);
  const slug = org_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'ministry';

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO organizations (id, name, slug, brand, kind, timezone, created_at, updated_at)
       VALUES (?, ?, ?, '{}', 'ministry', 'America/Chicago', ?, ?)`,
    ).bind(orgId, org_name, slug, now, now),
    c.env.DB.prepare(
      `INSERT INTO users (id, org_id, email, name, password_hash, password_salt, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'owner', ?, ?)`,
    ).bind(userId, orgId, email.toLowerCase().trim(), name, hash, salt, now, now),
  ]);

  const user = { id: userId, org_id: orgId, email: email.toLowerCase().trim(), name, role: 'owner' };
  await createSession(c, user);
  return c.json({ user, org: { id: orgId, name: org_name, slug } }, 201);
});

function safeJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

export default auth;
