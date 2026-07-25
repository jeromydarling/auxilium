import { computeSignals, buildCompass, shouldResurface } from '../../src/lib/nri/engine';
import { RULES_VERSION } from '../../src/lib/nri/rules';
import type { MemberFacts, NeedFacts, PrayerFacts, NriSignal } from '../../src/lib/nri/types';
import type { NriCompass } from '../../src/lib/nri/types';
import { newId } from '../../src/lib/ids';
import { nowIso } from '../../src/lib/utils';
import type { Env } from './env';
import { all, batch, json, toBool } from './db';
import { auditStatement } from './audit';

/**
 * The bridge between D1 and the pure NRI engine.
 *
 * Everything database-shaped lives here; everything rule-shaped lives in
 * src/lib/nri. The split is what keeps the rules testable without a database
 * and the queries optimizable without touching the rules.
 */

/** Gather the facts for a set of members in a fixed number of queries. */
export async function gatherFacts(
  db: D1Database,
  orgId: string,
  memberIds: string[],
): Promise<MemberFacts[]> {
  if (memberIds.length === 0) return [];
  const placeholders = memberIds.map(() => '?').join(',');

  // A fixed number of queries regardless of member count. The alternative —
  // one query per member — blows the subrequest budget on any real recompute.
  const [members, households, needs, prayers, outreach, primaries] = await Promise.all([
    all<MemberRow>(
      db,
      `SELECT id, org_id, household_id, status, created_at, joined_at, last_contact_at,
              last_response_at, onboarding_complete, financial_stress
         FROM members
        WHERE org_id = ? AND deleted_at IS NULL AND id IN (${placeholders})`,
      orgId, ...memberIds,
    ),
    all<HouseholdRow>(
      db,
      `SELECT h.id, h.member_count, h.dependent_count, h.share_amount_cents,
              (SELECT COUNT(*) FROM household_members hm
                WHERE hm.household_id = h.id AND hm.is_caregiver = 1) AS caregiver_count,
              (SELECT COUNT(*) FROM household_members hm
                WHERE hm.household_id = h.id
                  AND hm.created_at >= datetime('now', '-90 days')) AS recent_membership_changes
         FROM households h
        WHERE h.org_id = ? AND h.deleted_at IS NULL
          AND h.id IN (SELECT household_id FROM members
                        WHERE org_id = ? AND id IN (${placeholders}) AND household_id IS NOT NULL)`,
      orgId, orgId, ...memberIds,
    ),
    all<NeedRow>(
      db,
      `SELECT id, member_id, status, category, urgency, amount_requested_cents,
              submitted_at, last_status_change_at, created_at, assigned_to
         FROM needs
        WHERE org_id = ? AND deleted_at IS NULL AND member_id IN (${placeholders})`,
      orgId, ...memberIds,
    ),
    all<PrayerRow>(
      db,
      `SELECT id, member_id, category, status, is_urgent, created_at,
              followup_due_at, last_followup_at
         FROM prayer_requests
        WHERE org_id = ? AND deleted_at IS NULL AND member_id IN (${placeholders})`,
      orgId, ...memberIds,
    ),
    // Outreach with no member response since: the raw material for Fides.
    all<{ member_id: string; attempts: number }>(
      db,
      `SELECT n.member_id AS member_id, COUNT(*) AS attempts
         FROM need_updates nu
         JOIN needs n ON n.id = nu.need_id
        WHERE nu.org_id = ? AND nu.kind = 'outreach'
          AND n.member_id IN (${placeholders})
          AND nu.created_at >= datetime('now', '-120 days')
          AND (
            (SELECT m.last_response_at FROM members m WHERE m.id = n.member_id) IS NULL
            OR nu.created_at > (SELECT m.last_response_at FROM members m WHERE m.id = n.member_id)
          )
        GROUP BY n.member_id`,
      orgId, ...memberIds,
    ),
    // Which members are their household's primary contact, and which
    // households have no primary at all. Household-structure Familia rules
    // score on the primary only — see the note in src/lib/nri/types.ts.
    all<{ household_id: string; member_id: string }>(
      db,
      `SELECT household_id, member_id FROM household_members
        WHERE org_id = ? AND relationship = 'primary'`,
      orgId,
    ),
  ]);

  const householdById = new Map(households.map((h) => [h.id, h]));
  const primaryByHousehold = new Map(primaries.map((p) => [p.household_id, p.member_id]));
  const needsByMember = groupBy(needs, (n) => n.member_id);
  const prayersByMember = groupBy(prayers, (p) => p.member_id);
  const outreachByMember = new Map(outreach.map((o) => [o.member_id, o.attempts]));

  return members.map((m) => {
    const household = m.household_id ? householdById.get(m.household_id) : undefined;
    const primaryId = m.household_id ? primaryByHousehold.get(m.household_id) : undefined;
    return {
      id: m.id,
      org_id: m.org_id,
      status: m.status as MemberFacts['status'],
      created_at: m.created_at,
      joined_at: m.joined_at,
      last_contact_at: m.last_contact_at,
      last_response_at: m.last_response_at,
      onboarding_complete: toBool(m.onboarding_complete),
      financial_stress: toBool(m.financial_stress),
      household: household
        ? {
            id: household.id,
            member_count: household.member_count,
            dependent_count: household.dependent_count,
            caregiver_count: household.caregiver_count,
            share_amount_cents: household.share_amount_cents,
            recent_membership_changes: household.recent_membership_changes,
          }
        : null,
      // No household, or a household with nobody marked primary (common after a
      // messy import), falls back to true — better a duplicated signal than a
      // complex family nobody sees.
      is_primary_contact: !m.household_id || primaryId === undefined || primaryId === m.id,
      needs: (needsByMember.get(m.id) ?? []).map(toNeedFacts),
      prayer_requests: (prayersByMember.get(m.id) ?? []).map(toPrayerFacts),
      unanswered_outreach: outreachByMember.get(m.id) ?? 0,
    };
  });
}

/**
 * Recompute and persist signals for a set of members.
 *
 * Dismissal survives a recompute unless the facts got materially worse — see
 * shouldResurface in the engine. That rule is why staff trust the dismiss
 * button: it hides what you have handled without hiding a real escalation.
 */
export async function recomputeMembers(
  env: Env,
  orgId: string,
  memberIds: string[],
  reason: string,
): Promise<number> {
  const facts = await gatherFacts(env.DB, orgId, memberIds);
  if (facts.length === 0) return 0;

  const now = nowIso();
  const existing = await loadExistingSignals(env.DB, orgId, memberIds);
  const statements: D1PreparedStatement[] = [];

  for (const memberFacts of facts) {
    for (const signal of computeSignals(memberFacts, now)) {
      const prior = existing.get(`${signal.subject_id}:${signal.direction}`);

      // Carry dismissal forward, unless the situation has genuinely worsened.
      let dismissed = false;
      let dismissedAt: string | null = null;
      let dismissedAtScore: number | null = null;
      let dismissedBy: string | null = null;

      if (prior?.dismissed) {
        if (shouldResurface(prior.dismissed_at_score, signal.score)) {
          dismissed = false;
        } else {
          dismissed = true;
          dismissedAt = prior.dismissed_at;
          dismissedAtScore = prior.dismissed_at_score;
          dismissedBy = prior.dismissed_by;
        }
      }

      statements.push(
        env.DB.prepare(
          `INSERT INTO member_signals
             (id, org_id, subject_type, subject_id, direction, score, reason_codes, source,
              dismissed, dismissed_by, dismissed_at, dismissed_at_score, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (org_id, subject_type, subject_id, direction, source) DO UPDATE SET
             score = excluded.score,
             reason_codes = excluded.reason_codes,
             dismissed = excluded.dismissed,
             dismissed_by = excluded.dismissed_by,
             dismissed_at = excluded.dismissed_at,
             dismissed_at_score = excluded.dismissed_at_score,
             updated_at = excluded.updated_at`,
        ).bind(
          newId('signal'), orgId, signal.subject_type, signal.subject_id, signal.direction,
          signal.score, JSON.stringify(signal.reason_codes), signal.source,
          dismissed ? 1 : 0, dismissedBy, dismissedAt, dismissedAtScore, now, now,
        ),
      );
    }
  }

  statements.push(
    auditStatement(env.DB, {
      orgId,
      actorId: null,
      actorKind: 'system',
      action: 'nri.recompute',
      subjectType: 'org',
      subjectId: orgId,
      meta: { members: facts.length, reason, source: RULES_VERSION },
    }),
  );

  await batch(env.DB, statements);
  // The compass surfaces change; drop the cached triage board.
  await env.CACHE.delete(`triage:${orgId}`).catch(() => {});
  return facts.length;
}

interface ExistingSignal {
  dismissed: boolean;
  dismissed_at: string | null;
  dismissed_at_score: number | null;
  dismissed_by: string | null;
}

async function loadExistingSignals(
  db: D1Database,
  orgId: string,
  memberIds: string[],
): Promise<Map<string, ExistingSignal>> {
  const placeholders = memberIds.map(() => '?').join(',');
  const rows = await all<{
    subject_id: string; direction: string; dismissed: number;
    dismissed_at: string | null; dismissed_at_score: number | null; dismissed_by: string | null;
  }>(
    db,
    `SELECT subject_id, direction, dismissed, dismissed_at, dismissed_at_score, dismissed_by
       FROM member_signals
      WHERE org_id = ? AND subject_type = 'member' AND subject_id IN (${placeholders})`,
    orgId, ...memberIds,
  );

  return new Map(
    rows.map((r) => [
      `${r.subject_id}:${r.direction}`,
      {
        dismissed: toBool(r.dismissed),
        dismissed_at: r.dismissed_at,
        dismissed_at_score: r.dismissed_at_score,
        dismissed_by: r.dismissed_by,
      },
    ]),
  );
}

/** Read persisted signals back as engine objects. */
export async function loadSignals(
  db: D1Database,
  orgId: string,
  subjectIds: string[],
): Promise<Map<string, NriSignal[]>> {
  if (subjectIds.length === 0) return new Map();
  const placeholders = subjectIds.map(() => '?').join(',');
  const rows = await all<SignalRow>(
    db,
    `SELECT subject_type, subject_id, direction, score, reason_codes, source,
            dismissed, dismissed_at, dismissed_at_score, updated_at
       FROM member_signals
      WHERE org_id = ? AND subject_id IN (${placeholders})`,
    orgId, ...subjectIds,
  );

  const bySubject = new Map<string, NriSignal[]>();
  for (const row of rows) {
    const signal: NriSignal = {
      subject_type: row.subject_type as NriSignal['subject_type'],
      subject_id: row.subject_id,
      direction: row.direction as NriSignal['direction'],
      score: row.score,
      reason_codes: json(row.reason_codes, []),
      source: row.source,
      updated_at: row.updated_at,
      dismissed: toBool(row.dismissed),
      dismissed_at: row.dismissed_at,
      dismissed_at_score: row.dismissed_at_score,
    };
    const list = bySubject.get(row.subject_id) ?? [];
    list.push(signal);
    bySubject.set(row.subject_id, list);
  }
  return bySubject;
}

/** Compass for one subject, or null when it has never been computed. */
export async function compassFor(
  db: D1Database,
  orgId: string,
  subjectId: string,
): Promise<NriCompass | null> {
  const signals = (await loadSignals(db, orgId, [subjectId])).get(subjectId);
  return signals && signals.length > 0 ? buildCompass(signals) : null;
}

/**
 * Enqueue a recompute. Callers use this after any write that could change a
 * score, so scoring never sits on the request path.
 *
 * Degrades to a synchronous recompute if the queue is unavailable — in local
 * `wrangler dev` without queue support, and in the unlikely event of a queue
 * outage, stale signals are worse than a slightly slower request.
 */
export async function enqueueRecompute(
  env: Env,
  orgId: string,
  memberId: string,
  reason: string,
): Promise<void> {
  try {
    await env.SIGNAL_QUEUE.send({ kind: 'member', org_id: orgId, member_id: memberId, reason });
  } catch (error) {
    console.warn('[nri] signal queue unavailable, recomputing inline:', error);
    await recomputeMembers(env, orgId, [memberId], `${reason} (inline fallback)`);
  }
}

// ── row shapes and mappers ───────────────────────────────────────────────────

interface MemberRow {
  id: string; org_id: string; household_id: string | null; status: string;
  created_at: string; joined_at: string | null; last_contact_at: string | null;
  last_response_at: string | null; onboarding_complete: number; financial_stress: number;
}

interface HouseholdRow {
  id: string; member_count: number; dependent_count: number; share_amount_cents: number;
  caregiver_count: number; recent_membership_changes: number;
}

interface NeedRow {
  id: string; member_id: string; status: string; category: string; urgency: string;
  amount_requested_cents: number; submitted_at: string | null;
  last_status_change_at: string | null; created_at: string; assigned_to: string | null;
}

interface PrayerRow {
  id: string; member_id: string; category: string; status: string; is_urgent: number;
  created_at: string; followup_due_at: string | null; last_followup_at: string | null;
}

interface SignalRow {
  subject_type: string; subject_id: string; direction: string; score: number;
  reason_codes: string; source: string; dismissed: number;
  dismissed_at: string | null; dismissed_at_score: number | null; updated_at: string;
}

function toNeedFacts(row: NeedRow): NeedFacts {
  return {
    id: row.id,
    status: row.status as NeedFacts['status'],
    category: row.category as NeedFacts['category'],
    urgency: row.urgency as NeedFacts['urgency'],
    amount_requested_cents: row.amount_requested_cents,
    submitted_at: row.submitted_at,
    last_status_change_at: row.last_status_change_at,
    created_at: row.created_at,
    assigned_to: row.assigned_to,
  };
}

function toPrayerFacts(row: PrayerRow): PrayerFacts {
  return {
    id: row.id,
    category: row.category as PrayerFacts['category'],
    status: row.status as PrayerFacts['status'],
    is_urgent: toBool(row.is_urgent),
    created_at: row.created_at,
    followup_due_at: row.followup_due_at,
    last_followup_at: row.last_followup_at,
  };
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k) ?? [];
    list.push(item);
    map.set(k, list);
  }
  return map;
}
