import { newId } from '../../src/lib/ids';
import { nowIso } from '../../src/lib/utils';
import { run } from './db';

/**
 * The audit log answers "why did this happen" months later.
 *
 * NRI recomputes write here as well as user actions, because "why did this
 * member surface on the board in March" is exactly the sort of question a
 * ministry director asks in June.
 */

export interface AuditEntry {
  orgId: string;
  actorId: string | null;
  // 'member' is distinct from 'user' deliberately. "A member activated their
  // own account" and "staff activated an account for a member" are different
  // events, and a reviewer reading this log months later must be able to tell
  // them apart without inferring it from the action string.
  actorKind: 'user' | 'member' | 'system' | 'queue' | 'import';
  action: string;
  subjectType?: string | null;
  subjectId?: string | null;
  meta?: Record<string, unknown>;
}

export async function audit(db: D1Database, entry: AuditEntry): Promise<void> {
  await run(
    db,
    `INSERT INTO audit_log (id, org_id, actor_id, actor_kind, action, subject_type, subject_id, meta, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    newId('audit'), entry.orgId, entry.actorId, entry.actorKind, entry.action,
    entry.subjectType ?? null, entry.subjectId ?? null,
    JSON.stringify(entry.meta ?? {}), nowIso(),
  );
}

/** Prepared form, for batching an audit row alongside the write it describes. */
export function auditStatement(db: D1Database, entry: AuditEntry): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO audit_log (id, org_id, actor_id, actor_kind, action, subject_type, subject_id, meta, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      newId('audit'), entry.orgId, entry.actorId, entry.actorKind, entry.action,
      entry.subjectType ?? null, entry.subjectId ?? null,
      JSON.stringify(entry.meta ?? {}), nowIso(),
    );
}
