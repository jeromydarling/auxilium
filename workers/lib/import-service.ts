import type { Env } from './env';
import { all, first, batch, json } from './db';
import { audit, auditStatement } from './audit';
import { recomputeMembers } from './nri-service';
import { dedupeKeys } from '../../src/lib/import/dedupe';
import type { NormalizedRow } from '../../src/lib/import/fields';
import { newId } from '../../src/lib/ids';
import { nowIso } from '../../src/lib/utils';

/**
 * Committing an import: turning approved preview rows into members and
 * households.
 *
 * Two properties this function guarantees:
 *
 *   It writes only what a human approved. Rows come from import_rows, which the
 *   preview persisted — not from re-parsing the file, which could differ if the
 *   rule set or the member table changed in between.
 *
 *   It is idempotent per row. Each row is marked committed as part of the same
 *   batch that writes its member, so a retried queue message resumes rather
 *   than duplicating. Queue retries are normal, not exceptional.
 */

export interface CommitResult {
  created: number;
  updated: number;
  skipped: number;
  households_created: number;
}

export async function commitImport(
  env: Env,
  orgId: string,
  importId: string,
  userId: string | null,
): Promise<CommitResult> {
  const rows = await all<CommitRow>(
    env.DB,
    `SELECT id, row_number, normalized, action, matched_member_id
       FROM import_rows
      WHERE import_id = ? AND org_id = ? AND committed = 0 AND action IN ('create', 'update')
      ORDER BY row_number`,
    importId, orgId,
  );

  if (rows.length === 0) {
    await finish(env, orgId, importId, { created: 0, updated: 0, skipped: 0, households_created: 0 });
    return { created: 0, updated: 0, skipped: 0, households_created: 0 };
  }

  const now = nowIso();
  const parsed = rows
    .map((row) => ({ row, data: json<NormalizedRow | null>(row.normalized, null) }))
    .filter((entry): entry is { row: CommitRow; data: NormalizedRow } => entry.data !== null);

  // ── Households first, so members can reference them in the same commit ────
  const householdNames = [...new Set(
    parsed.map((p) => p.data.household_name).filter((n): n is string => Boolean(n)),
  )];
  const householdIds = await resolveHouseholds(env, orgId, householdNames, now);
  const householdsCreated = householdIds.createdCount;

  // ── Members ──────────────────────────────────────────────────────────────
  const statements: D1PreparedStatement[] = [];
  const touchedMembers: string[] = [];
  const touchedHouseholds = new Set<string>();
  let created = 0;
  let updated = 0;

  for (const { row, data } of parsed) {
    const householdId = data.household_name ? householdIds.byName.get(data.household_name) ?? null : null;
    if (householdId) touchedHouseholds.add(householdId);
    const keys = dedupeKeys(data);

    if (row.action === 'update' && row.matched_member_id) {
      updated++;
      touchedMembers.push(row.matched_member_id);

      // Update only the fields the file actually carried. A blank cell in a
      // spreadsheet means "not provided", never "delete what you know" — that
      // distinction is the difference between an import and a data loss event.
      statements.push(
        env.DB.prepare(
          `UPDATE members SET
             first_name = COALESCE(NULLIF(?, ''), first_name),
             last_name = COALESCE(NULLIF(?, ''), last_name),
             email = COALESCE(?, email),
             phone = COALESCE(?, phone),
             date_of_birth = COALESCE(?, date_of_birth),
             member_number = COALESCE(?, member_number),
             status = COALESCE(?, status),
             address_line1 = COALESCE(?, address_line1),
             address_line2 = COALESCE(?, address_line2),
             city = COALESCE(?, city),
             state = COALESCE(?, state),
             postal_code = COALESCE(?, postal_code),
             household_id = COALESCE(?, household_id),
             dedupe_email = COALESCE(?, dedupe_email),
             dedupe_phone = COALESCE(?, dedupe_phone),
             dedupe_name_dob = COALESCE(?, dedupe_name_dob),
             updated_at = ?
           WHERE id = ? AND org_id = ?`,
        ).bind(
          data.first_name, data.last_name, data.email, data.phone, data.date_of_birth,
          data.member_number, data.status, data.address_line1, data.address_line2,
          data.city, data.state, data.postal_code, householdId,
          keys.dedupe_email, keys.dedupe_phone, keys.dedupe_name_dob,
          now, row.matched_member_id, orgId,
        ),
      );
    } else {
      created++;
      const memberId = newId('member');
      touchedMembers.push(memberId);

      statements.push(
        env.DB.prepare(
          `INSERT INTO members
             (id, org_id, household_id, first_name, last_name, email, phone, date_of_birth,
              status, member_number, joined_at, address_line1, address_line2, city, state,
              postal_code, dedupe_email, dedupe_phone, dedupe_name_dob, onboarding_complete,
              financial_stress, notes, source, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 'import', ?, ?)`,
        ).bind(
          memberId, orgId, householdId, data.first_name, data.last_name, data.email, data.phone,
          data.date_of_birth, data.status ?? 'active', data.member_number, data.joined_at,
          data.address_line1, data.address_line2, data.city, data.state, data.postal_code,
          keys.dedupe_email, keys.dedupe_phone, keys.dedupe_name_dob, data.notes, now, now,
        ),
      );

      if (householdId) {
        statements.push(
          env.DB.prepare(
            `INSERT INTO household_members (id, org_id, household_id, member_id, relationship,
                                            is_caregiver, is_dependent, joined_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (household_id, member_id) DO NOTHING`,
          ).bind(
            newId('householdMember'), orgId, householdId, memberId, data.relationship ?? 'member',
            data.is_caregiver ? 1 : 0, data.is_dependent ? 1 : 0, now, now,
          ),
        );
      }
    }

    // Marking the row committed in the same batch is what makes a retry safe.
    statements.push(
      env.DB.prepare('UPDATE import_rows SET committed = 1 WHERE id = ?').bind(row.id),
    );
  }

  // Refresh denormalized household counts — Familia scoring reads them.
  for (const householdId of touchedHouseholds) {
    statements.push(
      env.DB.prepare(
        `UPDATE households SET
           member_count = (SELECT COUNT(*) FROM household_members WHERE household_id = ?),
           dependent_count = (SELECT COUNT(*) FROM household_members WHERE household_id = ? AND is_dependent = 1),
           updated_at = ?
         WHERE id = ? AND org_id = ?`,
      ).bind(householdId, householdId, now, householdId, orgId),
    );
  }

  statements.push(
    auditStatement(env.DB, {
      orgId, actorId: userId, actorKind: 'import', action: 'import.committed',
      subjectType: 'import', subjectId: importId,
      meta: { created, updated, households_created: householdsCreated },
    }),
  );

  await batch(env.DB, statements);

  const result = { created, updated, skipped: 0, households_created: householdsCreated };
  await finish(env, orgId, importId, result);

  // Score the new people. Chunked so a big roster does not build one enormous
  // batch, and best-effort — a scoring failure must not undo a good import.
  const CHUNK = 100;
  for (let i = 0; i < touchedMembers.length; i += CHUNK) {
    try {
      await recomputeMembers(env, orgId, touchedMembers.slice(i, i + CHUNK), 'import.committed');
    } catch (error) {
      console.error('[import] signal recompute failed for a chunk:', error);
    }
  }

  return result;
}

/** Find-or-create households by name, returning a name → id map. */
async function resolveHouseholds(
  env: Env,
  orgId: string,
  names: string[],
  now: string,
): Promise<{ byName: Map<string, string>; createdCount: number }> {
  const byName = new Map<string, string>();
  if (names.length === 0) return { byName, createdCount: 0 };

  const CHUNK = 200;
  for (let i = 0; i < names.length; i += CHUNK) {
    const slice = names.slice(i, i + CHUNK);
    const existing = await all<{ id: string; name: string }>(
      env.DB,
      `SELECT id, name FROM households
        WHERE org_id = ? AND deleted_at IS NULL AND name IN (${slice.map(() => '?').join(',')})`,
      orgId, ...slice,
    );
    for (const row of existing) byName.set(row.name, row.id);
  }

  const missing = names.filter((n) => !byName.has(n));
  if (missing.length > 0) {
    await batch(
      env.DB,
      missing.map((name) => {
        const id = newId('household');
        byName.set(name, id);
        return env.DB.prepare(
          `INSERT INTO households (id, org_id, name, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
        ).bind(id, orgId, name, now, now);
      }),
    );
  }

  return { byName, createdCount: missing.length };
}

async function finish(env: Env, orgId: string, importId: string, result: CommitResult): Promise<void> {
  const now = nowIso();
  await env.DB.prepare(
    `UPDATE imports SET status = 'completed', created_count = ?, updated_count = ?,
                        skipped_count = ?, committed_at = ?, updated_at = ?
      WHERE id = ? AND org_id = ?`,
  ).bind(result.created, result.updated, result.skipped, now, now, importId, orgId).run();

  await env.CACHE.delete(`triage:${orgId}`).catch(() => {});
}

/** Mark an import failed with a message the user can act on. */
export async function failImport(
  env: Env,
  orgId: string,
  importId: string,
  message: string,
): Promise<void> {
  const now = nowIso();
  await env.DB.prepare(
    "UPDATE imports SET status = 'failed', error_message = ?, updated_at = ? WHERE id = ? AND org_id = ?",
  ).bind(message, now, importId, orgId).run();

  await audit(env.DB, {
    orgId, actorId: null, actorKind: 'queue', action: 'import.failed',
    subjectType: 'import', subjectId: importId, meta: { message },
  });
}

/** Does this import still have uncommitted work? Used by the queue consumer. */
export async function hasPendingRows(env: Env, orgId: string, importId: string): Promise<boolean> {
  const row = await first<{ count: number }>(
    env.DB,
    `SELECT COUNT(*) AS count FROM import_rows
      WHERE import_id = ? AND org_id = ? AND committed = 0 AND action IN ('create', 'update')`,
    importId, orgId,
  );
  return (row?.count ?? 0) > 0;
}

interface CommitRow {
  id: string;
  row_number: number;
  normalized: string | null;
  action: string;
  matched_member_id: string | null;
}
