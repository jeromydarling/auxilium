import type { Context, Next } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { newId } from '../../src/lib/ids';
import { nowIso } from '../../src/lib/utils';
import type { Env } from './env';
import { first, run } from './db';

/**
 * Authentication: PBKDF2 password hashing and opaque session cookies.
 *
 * Nothing here is reversible and nothing is exported. The raw session token
 * exists only in the user's cookie; the database stores its SHA-256. A dump of
 * the sessions table therefore grants nobody a login.
 *
 * Degradation posture: with no JWT_SECRET set, development still works against
 * a fixed dev key and logs a loud warning. Production refuses to issue a
 * session without one, because a predictable signing key in production is worse
 * than an outage.
 */

const SESSION_COOKIE = 'aux_session';
const SESSION_DAYS = 30;
const PBKDF2_ITERATIONS = 100_000;

export interface AuthUser {
  id: string;
  org_id: string;
  email: string;
  name: string;
  role: string;
}

/**
 * Every Hono app in this Worker is typed with this so `c` already carries both
 * the bindings and the memoized user. Declaring it once removes the casts that
 * would otherwise appear in every single route handler.
 */
export type AppEnv = { Bindings: Env; Variables: { user: AuthUser } };
export type AppContext = Context<AppEnv>;

// ── Password hashing ─────────────────────────────────────────────────────────

export async function hashPassword(password: string, saltHex?: string): Promise<{ hash: string; salt: string }> {
  // Copied into a fresh ArrayBuffer-backed view: WebCrypto's BufferSource wants
  // a concrete ArrayBuffer, and a Uint8Array from getRandomValues is typed over
  // ArrayBufferLike, which includes SharedArrayBuffer.
  const salt = new Uint8Array(saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16)));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    256,
  );
  return { hash: bytesToHex(new Uint8Array(bits)), salt: bytesToHex(salt) };
}

export async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
  const { hash: computed } = await hashPassword(password, salt);
  return timingSafeEqual(computed, hash);
}

/** Constant-time comparison — a fast reject leaks the length of the match. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ── Sessions ─────────────────────────────────────────────────────────────────

export async function sha256(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return bytesToHex(new Uint8Array(digest));
}

function signingKey(env: Env): string {
  if (env.SESSION_SECRET) return env.SESSION_SECRET;
  if (env.APP_ENV === 'production') {
    throw new Error('SESSION_SECRET is required in production. Set it with: wrangler secret put SESSION_SECRET --env production');
  }
  console.warn('[auth] SESSION_SECRET is not set — using a development-only key. Do not ship this.');
  return 'auxilium-development-only-key';
}

export async function createSession(c: AppContext, user: AuthUser): Promise<void> {
  const token = `${newId('session')}.${crypto.randomUUID()}`;
  const tokenHash = await sha256(token + signingKey(c.env));
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();

  await run(
    c.env.DB,
    `INSERT INTO sessions (id, user_id, org_id, token_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    newId('session'), user.id, user.org_id, tokenHash, expiresAt, nowIso(),
  );

  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: c.env.APP_ENV !== 'development',
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_DAYS * 86_400,
  });
}

export async function destroySession(c: AppContext): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    const tokenHash = await sha256(token + signingKey(c.env));
    await run(c.env.DB, 'DELETE FROM sessions WHERE token_hash = ?', tokenHash);
  }
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}

/**
 * Resolve the current user. Memoized per request via c.set — several routes
 * and the audit logger all want the user, and one lookup is enough.
 */
export async function currentUser(c: AppContext): Promise<AuthUser | null> {
  const existing = c.get('user');
  if (existing) return existing;

  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;

  const tokenHash = await sha256(token + signingKey(c.env));
  const row = await first<AuthUser & { expires_at: string }>(
    c.env.DB,
    `SELECT u.id, u.org_id, u.email, u.name, u.role, s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND u.deleted_at IS NULL`,
    tokenHash,
  );

  if (!row) return null;
  if (Date.parse(row.expires_at) < Date.now()) {
    await run(c.env.DB, 'DELETE FROM sessions WHERE token_hash = ?', tokenHash);
    return null;
  }

  const user: AuthUser = {
    id: row.id, org_id: row.org_id, email: row.email, name: row.name, role: row.role,
  };
  c.set('user', user);
  return user;
}

/** Middleware: 401 unless a session resolves. */
export async function requireUser(c: AppContext, next: Next) {
  const user = await currentUser(c);
  if (!user) return c.json({ error: 'Not signed in.' }, 401);
  return next();
}

/** Middleware factory: 403 unless the user holds one of these roles. */
export function requireRole(...roles: string[]) {
  return async (c: AppContext, next: Next) => {
    const user = await currentUser(c);
    if (!user) return c.json({ error: 'Not signed in.' }, 401);
    if (!roles.includes(user.role)) {
      return c.json({ error: 'You do not have permission to do that.' }, 403);
    }
    return next();
  };
}

/** Anything but readonly can write. */
export const requireWriteAccess = requireRole('owner', 'admin', 'staff', 'care');

// ── Login rate limiting ──────────────────────────────────────────────────────

/**
 * Per-IP+email failure counting in KV.
 *
 * Fails OPEN by design. A rate limiter that errors closed on a KV blip locks
 * every staff member out of the system on the day they need it — which is a
 * far worse outcome than briefly permitting extra password attempts.
 */
const MAX_ATTEMPTS = 8;
const WINDOW_SECONDS = 900;

export async function checkLoginRate(env: Env, ip: string, email: string): Promise<boolean> {
  try {
    const key = `login:${ip}:${email.toLowerCase()}`;
    const count = Number.parseInt((await env.CACHE.get(key)) ?? '0', 10);
    return count < MAX_ATTEMPTS;
  } catch {
    return true;
  }
}

export async function recordLoginFailure(env: Env, ip: string, email: string): Promise<void> {
  try {
    const key = `login:${ip}:${email.toLowerCase()}`;
    const count = Number.parseInt((await env.CACHE.get(key)) ?? '0', 10);
    await env.CACHE.put(key, String(count + 1), { expirationTtl: WINDOW_SECONDS });
  } catch {
    // Nothing to do — see the fail-open note above.
  }
}

export async function clearLoginFailures(env: Env, ip: string, email: string): Promise<void> {
  try {
    await env.CACHE.delete(`login:${ip}:${email.toLowerCase()}`);
  } catch {
    // ignored
  }
}

// ── hex helpers ──────────────────────────────────────────────────────────────

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
