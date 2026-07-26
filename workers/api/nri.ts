import { Hono } from 'hono';
import type { Env } from '../lib/env';
import { intVar } from '../lib/env';
import { requireUser, requireWriteAccess, currentUser, type AppEnv } from '../lib/auth';
import { all, first, run, json } from '../lib/db';
import { param } from '../lib/http';
import { audit } from '../lib/audit';
import { loadSignals, recomputeMembers } from '../lib/nri-service';
import { reasonCount, buildCompass, explain, rankForTriage } from '../../src/lib/nri/engine';
import { NRI_RULES, RULES_VERSION } from '../../src/lib/nri/rules';
import { DIRECTION_META, NRI_DIRECTIONS } from '../../src/lib/nri/directions';
import { deriveNudges, type NudgeInputs } from '../../src/lib/nri/nudges';
import { newId } from '../../src/lib/ids';
import { nowIso } from '../../src/lib/utils';

const nri = new Hono<AppEnv>();
nri.use('*', requireUser);

const TERMINAL = "('completed', 'declined', 'withdrawn')";

/**
 * The triage board: who the ministry should look at next, and why.
 *
 * Every row carries its full explanation. The client never re-derives a score,
 * a band, or a recommendation — which is what keeps the number on the dashboard
 * identical to the number on the member page.
 */
nri.get('/triage', async (c) => {
  const user = (await currentUser(c))!;
  const direction = c.req.query('direction');
  const minScore = Number.parseInt(c.req.query('min_score') ?? '25', 10);
  const limit = Math.min(Number.parseInt(c.req.query('limit') ?? '50', 10), 200);

  const conditions = [
    's.org_id = ?', 's.dismissed = 0', 's.score >= ?',
    "s.subject_type = 'member'", 'm.deleted_at IS NULL',
  ];
  const params: unknown[] = [user.org_id, minScore];

  if (direction && NRI_DIRECTIONS.includes(direction as never)) {
    conditions.push('s.direction = ?');
    params.push(direction);
  }

  // Find the subjects worth showing, then load their full compass. Two queries
  // rather than a join that would fan out four rows per member.
  const top = await all<{ subject_id: string; peak: number }>(
    c.env.DB,
    `SELECT s.subject_id AS subject_id, MAX(s.score) AS peak
       FROM member_signals s
       JOIN members m ON m.id = s.subject_id
      WHERE ${conditions.join(' AND ')}
      GROUP BY s.subject_id
      ORDER BY peak DESC
      LIMIT ?`,
    ...params, limit,
  );

  if (top.length === 0) return c.json({ items: [], directions: DIRECTION_META });

  const subjectIds = top.map((t) => t.subject_id);
  const [members, signalsBySubject] = await Promise.all([
    all<MemberSummary>(
      c.env.DB,
      `SELECT m.id, m.first_name, m.last_name, m.email, m.phone, m.status, m.household_id,
              m.last_contact_at, h.name AS household_name
         FROM members m LEFT JOIN households h ON h.id = m.household_id
        WHERE m.org_id = ? AND m.id IN (${subjectIds.map(() => '?').join(',')})`,
      user.org_id, ...subjectIds,
    ),
    loadSignals(c.env.DB, user.org_id, subjectIds),
  ]);

  const memberById = new Map(members.map((m) => [m.id, m]));
  const items = subjectIds
    .map((id) => {
      const member = memberById.get(id);
      const signals = signalsBySubject.get(id);
      if (!member || !signals) return null;
      const compass = buildCompass(signals);
      return {
        member,
        compass,
        // Passed to the ranker and shown on the row. Both matter: without the
        // first, five members at 100 are in database order; without the second,
        // staff cannot see why one of them is above another.
        waiting_since: member.last_contact_at,
        reason_count: reasonCount(compass),
      };
    })
    .filter((x) => x !== null);

  return c.json({ items: rankForTriage(items), directions: DIRECTION_META });
});

/** Every signal for one subject, fully explained. */
nri.get('/signals/:subjectId', async (c) => {
  const user = (await currentUser(c))!;
  const subjectId = param(c, 'subjectId');

  const signals = (await loadSignals(c.env.DB, user.org_id, [subjectId])).get(subjectId) ?? [];
  if (signals.length === 0) {
    return c.json({ compass: null, explanations: [], source: RULES_VERSION });
  }

  return c.json({
    compass: buildCompass(signals),
    explanations: signals.map(explain),
    source: RULES_VERSION,
  });
});

/**
 * Dismiss a signal. Records the score at dismissal so the engine can bring it
 * back if the situation genuinely worsens — see shouldResurface.
 */
nri.post('/signals/:subjectId/:direction/dismiss', requireWriteAccess, async (c) => {
  const user = (await currentUser(c))!;
  const subjectId = param(c, 'subjectId');
  const direction = param(c, 'direction');

  if (!NRI_DIRECTIONS.includes(direction as never)) {
    return c.json({ error: 'That is not one of the four directions.' }, 400);
  }

  const signal = await first<{ score: number }>(
    c.env.DB,
    'SELECT score FROM member_signals WHERE org_id = ? AND subject_id = ? AND direction = ?',
    user.org_id, subjectId, direction,
  );
  if (!signal) return c.json({ error: 'That signal was not found.' }, 404);

  const now = nowIso();
  await run(
    c.env.DB,
    `UPDATE member_signals SET dismissed = 1, dismissed_by = ?, dismissed_at = ?,
                               dismissed_at_score = ?, updated_at = ?
      WHERE org_id = ? AND subject_id = ? AND direction = ?`,
    user.id, now, signal.score, now, user.org_id, subjectId, direction,
  );

  await audit(c.env.DB, {
    orgId: user.org_id, actorId: user.id, actorKind: 'user', action: 'nri.signal_dismissed',
    subjectType: 'member', subjectId, meta: { direction, score: signal.score },
  });
  await c.env.CACHE.delete(`triage:${user.org_id}`).catch(() => {});

  return c.json({ ok: true });
});

nri.post('/signals/:subjectId/:direction/restore', requireWriteAccess, async (c) => {
  const user = (await currentUser(c))!;
  const subjectId = param(c, 'subjectId');
  const direction = param(c, 'direction');

  await run(
    c.env.DB,
    `UPDATE member_signals SET dismissed = 0, dismissed_by = NULL, dismissed_at = NULL,
                               dismissed_at_score = NULL, updated_at = ?
      WHERE org_id = ? AND subject_id = ? AND direction = ?`,
    nowIso(), user.org_id, subjectId, direction,
  );
  await c.env.CACHE.delete(`triage:${user.org_id}`).catch(() => {});
  return c.json({ ok: true });
});

/**
 * The session engine: today's nudges.
 *
 * One query per input, all in parallel, all counts rather than row fetches.
 * This runs on nearly every page load, so it must stay cheap.
 */
nri.get('/session', async (c) => {
  const user = (await currentUser(c))!;
  const state = await loadUserState(c.env, user.org_id, user.id);

  const [
    urgentSignals, urgentMembers, unassignedNeeds, stalledNeeds,
    overdueFollowups, orphanMembers, pendingImports, disengaging,
    unassignedPrayers, totalMembers,
  ] = await Promise.all([
    count(c.env, 'SELECT COUNT(*) AS count FROM member_signals WHERE org_id = ? AND dismissed = 0 AND score >= 75', user.org_id),
    count(c.env, `SELECT COUNT(DISTINCT subject_id) AS count FROM member_signals
                   WHERE org_id = ? AND dismissed = 0 AND score >= 75`, user.org_id),
    count(c.env, `SELECT COUNT(*) AS count FROM needs
                   WHERE org_id = ? AND deleted_at IS NULL AND assigned_to IS NULL
                     AND status NOT IN ${TERMINAL}`, user.org_id),
    count(c.env, `SELECT COUNT(*) AS count FROM needs
                   WHERE org_id = ? AND deleted_at IS NULL AND status NOT IN ${TERMINAL}
                     AND COALESCE(last_status_change_at, submitted_at, created_at) < datetime('now', '-14 days')`, user.org_id),
    count(c.env, `SELECT COUNT(*) AS count FROM prayer_requests
                   WHERE org_id = ? AND deleted_at IS NULL AND status IN ('open', 'praying')
                     AND followup_due_at IS NOT NULL AND followup_due_at < ?`, user.org_id, nowIso()),
    count(c.env, `SELECT COUNT(*) AS count FROM members
                   WHERE org_id = ? AND deleted_at IS NULL AND household_id IS NULL
                     AND source = 'import' AND created_at >= datetime('now', '-7 days')`, user.org_id),
    count(c.env, "SELECT COUNT(*) AS count FROM imports WHERE org_id = ? AND status = 'previewing'", user.org_id),
    count(c.env, `SELECT COUNT(DISTINCT subject_id) AS count FROM member_signals
                   WHERE org_id = ? AND dismissed = 0 AND direction = 'fides' AND score >= 50`, user.org_id),
    count(c.env, `SELECT COUNT(*) AS count FROM prayer_requests
                   WHERE org_id = ? AND deleted_at IS NULL AND status IN ('open', 'praying')
                     AND assigned_to IS NULL`, user.org_id),
    count(c.env, 'SELECT COUNT(*) AS count FROM members WHERE org_id = ? AND deleted_at IS NULL', user.org_id),
  ]);

  const inputs: NudgeInputs = {
    urgentSignalCount: urgentSignals,
    urgentMemberCount: urgentMembers,
    unassignedNeedCount: unassignedNeeds,
    stalledNeedCount: stalledNeeds,
    overdueFollowupCount: overdueFollowups,
    orphanMemberCount: orphanMembers,
    pendingImportCount: pendingImports,
    disengagingMemberCount: disengaging,
    unassignedPrayerCount: unassignedPrayers,
    totalMemberCount: totalMembers,
  };

  const today = new Date().toISOString().slice(0, 10);
  const dismissedIds = new Set(
    state.dismissed_date === today ? state.dismissed_nudge_ids : [],
  );

  return c.json({
    nudges: deriveNudges(inputs, dismissedIds),
    inputs,
    state: {
      dismissed_nudge_ids: [...dismissedIds],
      last_auto_open_at: state.last_auto_open_at,
      guide_sections_seen: state.guide_sections_seen,
      guide_completed_at: state.guide_completed_at,
      can_auto_open: canAutoOpenToday(state.last_auto_open_at),
    },
  });
});

/**
 * Per-user NRI UI state: dismissed nudges, auto-open cooldown, guide progress.
 *
 * This lives in D1 rather than localStorage on purpose — dismissing a nudge on
 * a desktop should not have it reappear on a phone ten minutes later.
 */
nri.post('/state', async (c) => {
  const user = (await currentUser(c))!;
  const body = await c.req.json<{
    dismiss_nudge_id?: string;
    record_auto_open?: boolean;
    mark_guide_section?: string;
    complete_guide?: boolean;
    posture?: string;
  }>();

  const state = await loadUserState(c.env, user.org_id, user.id);
  const today = new Date().toISOString().slice(0, 10);
  const now = nowIso();

  // Dismissals are per-calendar-day: yesterday's dismissals do not hide today's
  // work, because yesterday's "I've seen this" was about yesterday.
  const currentDismissed = state.dismissed_date === today ? state.dismissed_nudge_ids : [];
  const dismissed = body.dismiss_nudge_id
    ? [...new Set([...currentDismissed, body.dismiss_nudge_id])]
    : currentDismissed;

  const guideSeen = body.mark_guide_section
    ? [...new Set([...state.guide_sections_seen, body.mark_guide_section])]
    : state.guide_sections_seen;

  await run(
    c.env.DB,
    `INSERT INTO nri_sessions (id, org_id, user_id, dismissed_nudge_ids, dismissed_date,
                               last_auto_open_at, guide_sections_seen, guide_completed_at,
                               last_posture, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (org_id, user_id) DO UPDATE SET
       dismissed_nudge_ids = excluded.dismissed_nudge_ids,
       dismissed_date = excluded.dismissed_date,
       last_auto_open_at = excluded.last_auto_open_at,
       guide_sections_seen = excluded.guide_sections_seen,
       guide_completed_at = excluded.guide_completed_at,
       last_posture = excluded.last_posture,
       updated_at = excluded.updated_at`,
    newId('nriSession'), user.org_id, user.id, JSON.stringify(dismissed), today,
    body.record_auto_open ? now : state.last_auto_open_at,
    JSON.stringify(guideSeen),
    body.complete_guide ? now : state.guide_completed_at,
    body.posture ?? state.last_posture, now, now,
  );

  return c.json({ ok: true });
});

/**
 * The rule reference. Exposing the entire rule set — codes, weights, and
 * rationales — is the point of a rule-based system. An admin who disagrees
 * with a score can read exactly what produced it.
 */
nri.get('/rules', async (c) => {
  return c.json({
    version: RULES_VERSION,
    directions: DIRECTION_META,
    bands: NRI_DIRECTIONS.map((d) => ({ direction: d, meta: DIRECTION_META[d] })),
    rules: NRI_RULES.map((r) => ({
      code: r.code,
      direction: r.direction,
      label: r.label,
      weight: r.weight,
      severity: r.severity,
      rationale: r.rationale,
    })),
  });
});

/** Force a recompute. Admin-triggered, for after a bulk change or a rule edit. */
nri.post('/recompute', requireWriteAccess, async (c) => {
  const user = (await currentUser(c))!;
  const { member_id } = await c.req.json<{ member_id?: string }>().catch(() => ({ member_id: undefined }));

  if (member_id) {
    const changed = await recomputeMembers(c.env, user.org_id, [member_id], 'manual');
    return c.json({ recomputed: changed });
  }

  try {
    await c.env.SIGNAL_QUEUE.send({ kind: 'org', org_id: user.org_id, reason: 'manual' });
    return c.json({ status: 'queued' }, 202);
  } catch {
    // No queue locally — do it inline, capped so the request still returns.
    const members = await all<{ id: string }>(
      c.env.DB,
      'SELECT id FROM members WHERE org_id = ? AND deleted_at IS NULL LIMIT 500',
      user.org_id,
    );
    const changed = await recomputeMembers(c.env, user.org_id, members.map((m) => m.id), 'manual inline');
    return c.json({ recomputed: changed });
  }
});

/** Dashboard headline numbers. Cached briefly in KV — it is read constantly. */
nri.get('/summary', async (c) => {
  const user = (await currentUser(c))!;
  const cacheKey = `triage:${user.org_id}`;
  const ttl = intVar(c.env.NRI_SIGNAL_TTL_SECONDS, 900);

  const cached = await c.env.CACHE.get(cacheKey, 'json').catch(() => null);
  if (cached) return c.json(cached as Record<string, unknown>);

  const byDirection = await all<{ direction: string; urgent: number; attend: number; watch: number }>(
    c.env.DB,
    `SELECT direction,
            SUM(CASE WHEN score >= 75 THEN 1 ELSE 0 END) AS urgent,
            SUM(CASE WHEN score >= 50 AND score < 75 THEN 1 ELSE 0 END) AS attend,
            SUM(CASE WHEN score >= 25 AND score < 50 THEN 1 ELSE 0 END) AS watch
       FROM member_signals
      WHERE org_id = ? AND dismissed = 0
      GROUP BY direction`,
    user.org_id,
  );

  const [members, households, openNeeds, openPrayers, sharedCents] = await Promise.all([
    count(c.env, 'SELECT COUNT(*) AS count FROM members WHERE org_id = ? AND deleted_at IS NULL', user.org_id),
    count(c.env, 'SELECT COUNT(*) AS count FROM households WHERE org_id = ? AND deleted_at IS NULL', user.org_id),
    count(c.env, `SELECT COUNT(*) AS count FROM needs
                   WHERE org_id = ? AND deleted_at IS NULL AND status NOT IN ${TERMINAL}`, user.org_id),
    count(c.env, `SELECT COUNT(*) AS count FROM prayer_requests
                   WHERE org_id = ? AND deleted_at IS NULL AND status IN ('open', 'praying')`, user.org_id),
    count(c.env, `SELECT COALESCE(SUM(amount_requested_cents), 0) AS count FROM needs
                   WHERE org_id = ? AND deleted_at IS NULL AND status NOT IN ${TERMINAL}`, user.org_id),
  ]);

  const summary = {
    members, households, open_needs: openNeeds, open_prayer_requests: openPrayers,
    open_need_amount_cents: sharedCents,
    directions: NRI_DIRECTIONS.map((direction) => {
      const row = byDirection.find((r) => r.direction === direction);
      return {
        direction,
        label: DIRECTION_META[direction].label,
        description: DIRECTION_META[direction].description,
        urgent: row?.urgent ?? 0,
        attend: row?.attend ?? 0,
        watch: row?.watch ?? 0,
      };
    }),
    source: RULES_VERSION,
    computed_at: nowIso(),
  };

  await c.env.CACHE.put(cacheKey, JSON.stringify(summary), { expirationTtl: ttl }).catch(() => {});
  return c.json(summary);
});

// ── helpers ──────────────────────────────────────────────────────────────────

async function count(env: Env, sql: string, ...params: unknown[]): Promise<number> {
  const row = await first<{ count: number }>(env.DB, sql, ...params);
  return row?.count ?? 0;
}

interface UserState {
  dismissed_nudge_ids: string[];
  dismissed_date: string | null;
  last_auto_open_at: string | null;
  guide_sections_seen: string[];
  guide_completed_at: string | null;
  last_posture: string | null;
}

async function loadUserState(env: Env, orgId: string, userId: string): Promise<UserState> {
  const row = await first<{
    dismissed_nudge_ids: string; dismissed_date: string | null; last_auto_open_at: string | null;
    guide_sections_seen: string; guide_completed_at: string | null; last_posture: string | null;
  }>(
    env.DB,
    `SELECT dismissed_nudge_ids, dismissed_date, last_auto_open_at,
            guide_sections_seen, guide_completed_at, last_posture
       FROM nri_sessions WHERE org_id = ? AND user_id = ?`,
    orgId, userId,
  );

  return {
    dismissed_nudge_ids: json(row?.dismissed_nudge_ids, []),
    dismissed_date: row?.dismissed_date ?? null,
    last_auto_open_at: row?.last_auto_open_at ?? null,
    guide_sections_seen: json(row?.guide_sections_seen, []),
    guide_completed_at: row?.guide_completed_at ?? null,
    last_posture: row?.last_posture ?? null,
  };
}

/** Auto-open at most once per calendar day. */
function canAutoOpenToday(lastAutoOpenAt: string | null): boolean {
  if (!lastAutoOpenAt) return true;
  return lastAutoOpenAt.slice(0, 10) !== new Date().toISOString().slice(0, 10);
}

interface MemberSummary {
  id: string; first_name: string; last_name: string; email: string | null;
  phone: string | null; status: string; household_id: string | null;
  last_contact_at: string | null; household_name: string | null;
}

export default nri;
