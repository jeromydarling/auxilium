import type { Env } from './env';
import { first, run } from './db';
import { nowIso } from '../../src/lib/utils';
import {
  summarizeOnboarding, type OnboardingFacts, type OnboardingSummary,
} from '../../src/lib/onboarding/steps';

/**
 * D1 → setup facts → the checklist.
 *
 * Everything observable is counted here rather than trusted from a flag, which
 * is the whole design of the module this feeds. The two things that cannot be
 * observed live in `organizations.onboarding_state`.
 */

interface OnboardingState {
  /** When the turnaround commitment was actively chosen, not merely defaulted. */
  commitment_set_at?: string;
  /** When the governing-version rule was declared. */
  governing_rule_set_at?: string;
  dismissed_at?: string;
}

function parseState(raw: string | null | undefined): OnboardingState {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' ? (value as OnboardingState) : {};
  } catch {
    // A corrupt blob means "nothing acknowledged", which shows the ministry a
    // checklist it may have already finished. Annoying; the alternative is a
    // 500 on the dashboard, which is worse.
    return {};
  }
}

export async function gatherOnboarding(env: Env, orgId: string): Promise<OnboardingSummary> {
  const org = await first<{ onboarding_state: string | null }>(
    env.DB,
    'SELECT onboarding_state FROM organizations WHERE id = ?',
    orgId,
  );
  const state = parseState(org?.onboarding_state);

  // One round trip. Every count is scoped by org_id, as everything tenant-scoped
  // in this codebase is.
  const counts = await first<{
    guidelines: number;
    members: number;
    team: number;
    ledger: number;
    portal: number;
  }>(
    env.DB,
    `SELECT
       (SELECT COUNT(*) FROM sharing_guidelines WHERE org_id = ?1) AS guidelines,
       (SELECT COUNT(*) FROM members WHERE org_id = ?1 AND deleted_at IS NULL) AS members,
       -- "Team" means anyone beyond the founding account, so a lone owner does
       -- not read as a staffed ministry.
       (SELECT COUNT(*) FROM users WHERE org_id = ?1 AND deleted_at IS NULL) - 1 AS team,
       (SELECT (SELECT COUNT(*) FROM contributions WHERE org_id = ?1)
             + (SELECT COUNT(*) FROM disbursements WHERE org_id = ?1)) AS ledger,
       (SELECT COUNT(*) FROM member_accounts WHERE org_id = ?1 AND deleted_at IS NULL) AS portal`,
    orgId,
  );

  const facts: OnboardingFacts = {
    commitment_chosen: Boolean(state.commitment_set_at),
    governing_rule_declared: Boolean(state.governing_rule_set_at),
    published_guideline_versions: counts?.guidelines ?? 0,
    member_count: counts?.members ?? 0,
    team_member_count: Math.max(0, counts?.team ?? 0),
    has_ledger_entries: (counts?.ledger ?? 0) > 0,
    portal_accounts: counts?.portal ?? 0,
    dismissed: Boolean(state.dismissed_at),
  };

  return summarizeOnboarding(facts);
}

/**
 * Record a one-time acknowledgement.
 *
 * Read-modify-write rather than a JSON patch in SQL, because D1 is SQLite and
 * `json_set` on a column that might not be valid JSON fails the whole
 * statement. Two setup clicks racing is not a scenario worth more machinery
 * than this.
 */
export async function markOnboarding(
  env: Env,
  orgId: string,
  key: keyof OnboardingState,
): Promise<void> {
  const org = await first<{ onboarding_state: string | null }>(
    env.DB,
    'SELECT onboarding_state FROM organizations WHERE id = ?',
    orgId,
  );
  const state = parseState(org?.onboarding_state);
  state[key] = nowIso();

  await run(
    env.DB,
    'UPDATE organizations SET onboarding_state = ?, updated_at = ? WHERE id = ?',
    JSON.stringify(state), nowIso(), orgId,
  );
}
