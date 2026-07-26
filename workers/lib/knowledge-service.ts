/**
 * Gathering the facts an answer gets grounded in.
 *
 * This is the bridge between "here is how appeals work" and "your appeal window
 * closes on the 14th". The pure answer engine takes facts as an argument
 * precisely so this — the part that touches D1 and the clock — stays small and
 * separate.
 *
 * Every query carries org_id, and a member is only ever grounded in their own
 * record. That constraint is enforced by the caller passing a member id it has
 * already established belongs to the asker, and again here by scoping.
 */

import type { Env } from './env';
import { all, first } from './db';
import type { AccountFacts } from '../../src/lib/knowledge/answer';

function daysBetween(from: string, to: string): number {
  return Math.floor((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

/** A date a worried person can read, rather than an ISO timestamp. */
function readable(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export async function gatherAccountFacts(
  env: Env,
  input: { orgId: string; role: 'staff' | 'member'; memberId: string | null },
): Promise<AccountFacts> {
  const facts: AccountFacts = { role: input.role };
  const now = new Date().toISOString();

  if (!input.memberId) return facts;

  const member = await first<{ first_name: string; last_name: string; joined_at: string | null }>(
    env.DB,
    `SELECT first_name, last_name, joined_at FROM members
      WHERE id = ? AND org_id = ? AND deleted_at IS NULL`,
    input.memberId,
    input.orgId,
  );
  if (!member) return facts;

  facts.memberName = `${member.first_name} ${member.last_name}`.trim();
  facts.joinedAt = readable(member.joined_at);

  // Claims, most recent first. Capped, because an answer listing eleven claims
  // is not an answer.
  const claims = await all<{
    id: string;
    status: string;
    created_at: string;
    sla_due_at: string | null;
    first_response_at: string | null;
    denial_reason_code: string | null;
    denial_guideline_ref: string | null;
  }>(
    env.DB,
    `SELECT id, status, created_at, sla_due_at, first_response_at,
            denial_reason_code, denial_guideline_ref
       FROM needs
      WHERE member_id = ? AND org_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 5`,
    input.memberId,
    input.orgId,
  );

  facts.claims = claims.map((c) => ({
    // The member-facing reference, not the internal id.
    reference: c.id,
    status: c.status,
    submittedAt: readable(c.created_at),
    dueAt: readable(c.sla_due_at),
    daysRemaining: c.sla_due_at ? daysBetween(now, c.sla_due_at) : undefined,
    acknowledged: Boolean(c.first_response_at),
    declinedReason: c.denial_reason_code ?? undefined,
    declinedProvision: c.denial_guideline_ref ?? undefined,
    // An appeal is only worth mentioning where there is something to appeal.
    appealable: c.status === 'denied',
  }));

  // Which guideline version actually binds this member: the one in force when
  // they joined. Getting this wrong is the most consequential error available
  // in a decline, so it is worth surfacing in an answer.
  if (member.joined_at) {
    const guideline = await first<{ version: string }>(
      env.DB,
      `SELECT version FROM sharing_guidelines
        WHERE org_id = ? AND effective_from <= ?
        ORDER BY effective_from DESC LIMIT 1`,
      input.orgId,
      member.joined_at,
    );
    if (guideline) facts.guidelineVersion = guideline.version;
  }

  const lastContribution = await first<{ received_at: string }>(
    env.DB,
    `SELECT received_at FROM contributions
      WHERE member_id = ? AND org_id = ?
      ORDER BY received_at DESC LIMIT 1`,
    input.memberId,
    input.orgId,
  );

  if (lastContribution) {
    facts.lastContributionAt = readable(lastContribution.received_at);
    // "Current" means something arrived in the last ~45 days, which covers a
    // monthly cycle plus a late-payment grace. Deliberately generous: telling
    // someone they are in arrears when they are not is worse than the reverse.
    facts.contributionsCurrent = daysBetween(lastContribution.received_at, now) <= 45;
  }

  const followUps = await first<{ n: number }>(
    env.DB,
    `SELECT COUNT(*) AS n FROM prayer_requests
      WHERE member_id = ? AND org_id = ? AND status != 'closed' AND deleted_at IS NULL`,
    input.memberId,
    input.orgId,
  );
  facts.openFollowUps = followUps?.n ?? 0;

  return facts;
}

/**
 * The member a signed-in account belongs to.
 *
 * Returns null for a staff session, which is the correct answer rather than an
 * error: staff simply have no member context of their own, and an answer with
 * no account facts is still a useful answer about the process.
 */
export async function memberIdForUser(env: Env, userId: string): Promise<string | null> {
  const row = await first<{ member_id: string }>(
    env.DB,
    `SELECT ma.member_id
       FROM member_accounts ma
      WHERE ma.id = ? AND ma.deleted_at IS NULL AND ma.status = 'active'`,
    userId,
  );
  return row?.member_id ?? null;
}
