import { Hono } from 'hono';
import { requireUser, requireRole, currentUser, hashPassword, type AppEnv } from '../lib/auth';
import { all, first, run, json } from '../lib/db';
import { param } from '../lib/http';
import { audit } from '../lib/audit';
import { storeDocument, readDocument } from '../lib/storage';
import { newId } from '../../src/lib/ids';
import { nowIso } from '../../src/lib/utils';

const admin = new Hono<AppEnv>();
admin.use('*', requireUser);

const requireAdmin = requireRole('owner', 'admin');

/** Team roster. */
admin.get('/users', async (c) => {
  const user = (await currentUser(c))!;
  const users = await all<Record<string, unknown>>(
    c.env.DB,
    `SELECT id, email, name, role, last_seen_at, created_at
       FROM users WHERE org_id = ? AND deleted_at IS NULL ORDER BY name`,
    user.org_id,
  );
  return c.json({ items: users });
});

admin.post('/users', requireAdmin, async (c) => {
  const user = (await currentUser(c))!;
  const { email, name, role, password } = await c.req.json<{
    email?: string; name?: string; role?: string; password?: string;
  }>();

  if (!email || !name) return c.json({ error: 'We need a name and an email address.' }, 400);
  if (password && password.length < 10) {
    return c.json({ error: 'Please use at least 10 characters for the password.' }, 400);
  }

  const id = newId('user');
  const now = nowIso();
  const credentials = password ? await hashPassword(password) : { hash: null, salt: null };

  try {
    await run(
      c.env.DB,
      `INSERT INTO users (id, org_id, email, name, password_hash, password_salt, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, user.org_id, email.toLowerCase().trim(), name,
      credentials.hash, credentials.salt, role ?? 'staff', now, now,
    );
  } catch {
    return c.json({ error: 'Someone with that email is already on the team.' }, 409);
  }

  await audit(c.env.DB, {
    orgId: user.org_id, actorId: user.id, actorKind: 'user', action: 'user.created',
    subjectType: 'user', subjectId: id, meta: { role: role ?? 'staff' },
  });

  return c.json({ id }, 201);
});

/** Removing someone ends their sessions immediately, everywhere. */
admin.delete('/users/:id', requireAdmin, async (c) => {
  const user = (await currentUser(c))!;
  const id = param(c, 'id');

  if (id === user.id) return c.json({ error: 'You cannot remove yourself.' }, 400);

  const target = await first<{ role: string }>(
    c.env.DB, 'SELECT role FROM users WHERE id = ? AND org_id = ?', id, user.org_id,
  );
  if (!target) return c.json({ error: 'That person was not found.' }, 404);
  if (target.role === 'owner') return c.json({ error: 'The owner cannot be removed.' }, 400);

  const now = nowIso();
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET deleted_at = ?, updated_at = ? WHERE id = ? AND org_id = ?')
      .bind(now, now, id, user.org_id),
    c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id),
  ]);

  await audit(c.env.DB, {
    orgId: user.org_id, actorId: user.id, actorKind: 'user', action: 'user.removed',
    subjectType: 'user', subjectId: id,
  });
  return c.json({ ok: true });
});

/** Organization settings, including the white-label brand payload. */
admin.get('/org', async (c) => {
  const user = (await currentUser(c))!;
  const org = await first<Record<string, unknown>>(
    c.env.DB, 'SELECT * FROM organizations WHERE id = ?', user.org_id,
  );
  if (!org) return c.json({ error: 'Organization not found.' }, 404);
  return c.json({ org: { ...org, brand: json(org.brand, {}) } });
});

admin.patch('/org', requireAdmin, async (c) => {
  const user = (await currentUser(c))!;
  const body = await c.req.json<Record<string, unknown>>();

  const sets: string[] = [];
  const params: unknown[] = [];

  for (const field of ['name', 'timezone']) {
    if (field in body) {
      sets.push(`${field} = ?`);
      params.push(body[field]);
    }
  }
  if ('brand' in body) {
    sets.push('brand = ?');
    params.push(JSON.stringify(body.brand ?? {}));
  }
  if (sets.length === 0) return c.json({ error: 'Nothing to update.' }, 400);

  sets.push('updated_at = ?');
  params.push(nowIso(), user.org_id);

  await run(c.env.DB, `UPDATE organizations SET ${sets.join(', ')} WHERE id = ?`, ...params);
  await audit(c.env.DB, {
    orgId: user.org_id, actorId: user.id, actorKind: 'user', action: 'org.updated',
    subjectType: 'org', subjectId: user.org_id, meta: { fields: Object.keys(body) },
  });

  return c.json({ ok: true });
});

/** The audit trail, filterable by subject. */
admin.get('/audit', requireAdmin, async (c) => {
  const user = (await currentUser(c))!;
  const subjectId = c.req.query('subject_id');
  const action = c.req.query('action');

  const conditions = ['a.org_id = ?'];
  const params: unknown[] = [user.org_id];
  if (subjectId) {
    conditions.push('a.subject_id = ?');
    params.push(subjectId);
  }
  if (action) {
    conditions.push('a.action LIKE ?');
    params.push(`${action}%`);
  }

  const rows = await all<Record<string, unknown>>(
    c.env.DB,
    `SELECT a.*, u.name AS actor_name
       FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY a.created_at DESC
      LIMIT 200`,
    ...params,
  );

  return c.json({ items: rows.map((r) => ({ ...r, meta: json(r.meta, {}) })) });
});

// ── Documents (R2) ───────────────────────────────────────────────────────────

/**
 * Upload a file against a member, household, or case. Everything lands under
 * an org-prefixed R2 key with a fresh document ID, so two people uploading the
 * same filename in the same second cannot collide.
 */
admin.post('/documents', async (c) => {
  const user = (await currentUser(c))!;
  const form = await c.req.formData();
  const file = form.get('file');
  const subjectType = String(form.get('subject_type') ?? 'org');
  const subjectId = form.get('subject_id') ? String(form.get('subject_id')) : null;

  if (!(file instanceof File)) return c.json({ error: 'Please choose a file to upload.' }, 400);

  const MAX_BYTES = 25 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    return c.json({ error: 'That file is larger than 25 MB. Please upload a smaller one.' }, 413);
  }

  const VALID = ['member', 'household', 'need', 'import', 'org'];
  if (!VALID.includes(subjectType)) {
    return c.json({ error: 'That is not a valid attachment target.' }, 400);
  }

  const stored = await storeDocument(c.env, {
    orgId: user.org_id,
    subjectType: subjectType as 'member' | 'household' | 'need' | 'import' | 'org',
    subjectId,
    filename: file.name,
    contentType: file.type || 'application/octet-stream',
    body: await file.arrayBuffer(),
    uploadedBy: user.id,
  });

  await audit(c.env.DB, {
    orgId: user.org_id, actorId: user.id, actorKind: 'user', action: 'document.uploaded',
    subjectType, subjectId, meta: { document_id: stored.id, filename: stored.filename },
  });

  return c.json(stored, 201);
});

admin.get('/documents/:id', async (c) => {
  const user = (await currentUser(c))!;
  const id = param(c, 'id');

  const record = await first<{ r2_key: string; filename: string; content_type: string }>(
    c.env.DB,
    'SELECT r2_key, filename, content_type FROM documents WHERE id = ? AND org_id = ? AND deleted_at IS NULL',
    id, user.org_id,
  );
  if (!record) return c.json({ error: 'That document was not found.' }, 404);

  const object = await readDocument(c.env, user.org_id, record.r2_key);
  if (!object) return c.json({ error: 'That file is no longer in storage.' }, 410);

  return new Response(object.body, {
    headers: {
      'Content-Type': record.content_type,
      'Content-Disposition': `inline; filename="${record.filename}"`,
      'Cache-Control': 'private, max-age=300',
    },
  });
});

export default admin;
