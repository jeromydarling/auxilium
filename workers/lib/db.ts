import type { Env } from './env';

/**
 * Thin D1 helpers. Not an ORM — the queries in this codebase are hand-written
 * and readable, which matters more than saving a few keystrokes when you are
 * debugging why a member did or did not surface.
 *
 * The one rule these helpers enforce: every tenant-scoped read takes an org_id.
 * There is no query in this product without a tenant scope.
 */

export async function all<T>(db: D1Database, sql: string, ...params: unknown[]): Promise<T[]> {
  const { results } = await db.prepare(sql).bind(...params).all<T>();
  return results ?? [];
}

export async function first<T>(db: D1Database, sql: string, ...params: unknown[]): Promise<T | null> {
  return (await db.prepare(sql).bind(...params).first<T>()) ?? null;
}

export async function run(db: D1Database, sql: string, ...params: unknown[]): Promise<D1Result> {
  return db.prepare(sql).bind(...params).run();
}

/**
 * D1 batches are atomic and count as one round trip. Use them for anything that
 * writes more than a couple of rows — the per-request subrequest budget is real
 * and an import commit can be thousands of statements.
 */
export async function batch(db: D1Database, statements: D1PreparedStatement[]): Promise<void> {
  if (statements.length === 0) return;
  // D1 caps a single batch; chunk so a large import commit still goes through.
  const CHUNK = 100;
  for (let i = 0; i < statements.length; i += CHUNK) {
    await db.batch(statements.slice(i, i + CHUNK));
  }
}

/** SQLite has no booleans. Convert at the boundary, both ways, in one place. */
export const toInt = (value: boolean): number => (value ? 1 : 0);
export const toBool = (value: unknown): boolean => value === 1 || value === true;

/** Parse a JSON text column, falling back rather than throwing on bad data. */
export function json<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || value === '') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/**
 * Keyset pagination. Cursors are opaque base64 so a caller cannot turn one into
 * an offset and start scanning the org.
 */
export function encodeCursor(parts: (string | number)[]): string {
  return btoa(JSON.stringify(parts)).replace(/=+$/, '');
}

export function decodeCursor(cursor: string | undefined | null): (string | number)[] | null {
  if (!cursor) return null;
  try {
    const decoded = JSON.parse(atob(cursor));
    return Array.isArray(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

/** Config read-through cache in KV. D1 stays the source of truth. */
export async function cachedConfig<T>(
  env: Env,
  key: string,
  ttlSeconds: number,
  load: () => Promise<T>,
): Promise<T> {
  const cached = await env.CONFIG.get(key, 'json');
  if (cached !== null) return cached as T;
  const fresh = await load();
  // Fire-and-forget: a cache write must never fail a request.
  await env.CONFIG.put(key, JSON.stringify(fresh), { expirationTtl: ttlSeconds }).catch(() => {});
  return fresh;
}
