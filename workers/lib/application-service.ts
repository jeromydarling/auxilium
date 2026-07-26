import type { Env } from './env';
import { all, first, run, json } from './db';
import { newId } from '../../src/lib/ids';
import { nowIso } from '../../src/lib/utils';
import { audit } from './audit';
import { enqueueRecompute } from './nri-service';
import {
  DEFAULT_FORM, classifyRelationship,
  type ApplicationForm, type HouseholdApplicant, type HouseholdRelationship,
} from '../../src/lib/applications/schema';
import { dedupeKeys } from '../../src/lib/import/dedupe';

/**
 * D1 ↔ applications.
 *
 * The part that matters is `acceptApplication`: it is where a form stops being
 * a form and becomes a family in the roster. Everything else here exists to
 * serve it.
 */

/**
 * The published form for a ministry, or the default.
 *
 * A ministry that has never touched this still gets a working application
 * rather than a blank page — the default is a real form, not a placeholder.
 * `published_at` gates only the *public* route; staff can always preview.
 */
export async function loadForm(env: Env, orgId: string): Promise<ApplicationForm & { published: boolean }> {
  const row = await first<{
    version: number; intro: string | null; sections: string; published_at: string | null;
  }>(
    env.DB,
    'SELECT version, intro, sections, published_at FROM application_forms WHERE org_id = ?',
    orgId,
  );

  if (!row) return { ...DEFAULT_FORM, published: false };

  const sections = json(row.sections, []) as ApplicationForm['sections'];
  return {
    version: row.version,
    intro: row.intro ?? undefined,
    // A stored form with no sections is a ministry mid-edit, not an intent to
    // ask nothing. Falling back keeps a published URL answering something
    // useful rather than an empty page with a submit button.
    sections: sections.length > 0 ? sections : DEFAULT_FORM.sections,
    published: Boolean(row.published_at),
  };
}

/** The guideline version in force right now — the anchor an application records. */
export async function currentGuidelineId(env: Env, orgId: string, now: string): Promise<string | null> {
  const row = await first<{ id: string }>(
    env.DB,
    `SELECT id FROM sharing_guidelines
      WHERE org_id = ? AND effective_from <= ?
        AND (effective_to IS NULL OR effective_to > ?)
      ORDER BY effective_from DESC LIMIT 1`,
    orgId, now.slice(0, 10), now.slice(0, 10),
  );
  return row?.id ?? null;
}

/** How many applications this source sent in the last hour. A spam signal, not a gate. */
export async function recentFromIp(env: Env, ipHash: string, now: string): Promise<number> {
  const since = new Date(Date.parse(now) - 3_600_000).toISOString();
  const row = await first<{ n: number }>(
    env.DB,
    'SELECT COUNT(*) AS n FROM member_applications WHERE source_ip_hash = ? AND submitted_at >= ?',
    ipHash, since,
  );
  return row?.n ?? 0;
}

export async function existingForEmail(env: Env, orgId: string, email: string): Promise<number> {
  const row = await first<{ n: number }>(
    env.DB,
    'SELECT COUNT(*) AS n FROM member_applications WHERE org_id = ? AND lower(email) = lower(?) AND deleted_at IS NULL',
    orgId, email,
  );
  return row?.n ?? 0;
}

export interface AcceptResult {
  household_id: string;
  member_ids: string[];
}

/**
 * Accept an application: create the household and everyone on it.
 *
 * Four decisions worth keeping.
 *
 * **The applicant becomes the primary contact.** Household complexity is scored
 * on the primary only, and an accepted household with nobody marked would score
 * every member and put a family of eight on the triage board as eight rows.
 *
 * **Everything is written in one batch.** A partial accept — household created,
 * members missing — leaves an application marked accepted against a family that
 * does not exist, which is the worst possible state to reconcile by hand.
 *
 * **Dedupe keys are computed on the way in**, the same ones the roster importer
 * uses. Otherwise a family who applied and was also on a spreadsheet becomes
 * two households nobody notices until a need is filed against the wrong one.
 *
 * **`joined_at` is the requested start date if there is one.** It decides which
 * guideline version binds them under the enrolment rule, so defaulting it to
 * "today" would quietly move somebody's governing document.
 */
export async function acceptApplication(
  env: Env,
  orgId: string,
  applicationId: string,
  actorId: string,
  note: string | undefined,
  now: string = nowIso(),
): Promise<AcceptResult | { error: string }> {
  const app = await first<{
    id: string; status: string; first_name: string; last_name: string; email: string;
    phone: string | null; date_of_birth: string | null;
    address_line1: string | null; address_line2: string | null;
    city: string | null; state: string | null; postal_code: string | null;
    household: string; requested_start_date: string | null;
  }>(
    env.DB,
    `SELECT * FROM member_applications
      WHERE id = ? AND org_id = ? AND deleted_at IS NULL`,
    applicationId, orgId,
  );

  if (!app) return { error: 'No such application.' };
  // Accepting twice would create a second household for the same family. The
  // check is here rather than only in the route because this is the operation
  // that has consequences.
  if (app.status === 'accepted') return { error: 'This application has already been accepted.' };

  const householdId = newId('household');
  const joinedAt = app.requested_start_date ?? now.slice(0, 10);
  const others = json(app.household, []) as HouseholdApplicant[];

  const people: {
    first_name: string; last_name: string;
    email: string | null; phone: string | null; date_of_birth: string | null;
    relationship: HouseholdRelationship; is_dependent: boolean;
  }[] = [
    {
      first_name: app.first_name,
      last_name: app.last_name,
      email: app.email,
      phone: app.phone,
      date_of_birth: app.date_of_birth,
      // The applicant is the primary contact. Household complexity is scored on
      // the primary only, and a household with nobody marked scores every
      // member — putting a family of eight on the board as eight rows.
      relationship: 'primary',
      is_dependent: false,
    },
    ...others.map((p) => ({
      first_name: p.first_name,
      last_name: p.last_name,
      // Only the applicant's contact details are known. Inventing an email for
      // a spouse from the household's would create a second account that
      // cannot be signed into and a dedupe key that collides with a real one.
      email: null,
      phone: null,
      date_of_birth: p.date_of_birth ?? null,
      ...classifyRelationship(p.relationship, p.date_of_birth, joinedAt),
    })),
  ];

  // Familia reads this. A family with four children that records zero
  // dependents is exactly the household the compass exists to notice and
  // would not.
  const dependentCount = people.filter((p) => p.is_dependent).length;

  const memberIds = people.map(() => newId('member'));
  const statements = [
    env.DB.prepare(
      `INSERT INTO households (id, org_id, name, address_line1, address_line2, city, state,
                               postal_code, member_count, dependent_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      householdId, orgId, `${app.last_name} Household`,
      app.address_line1, app.address_line2, app.city, app.state, app.postal_code,
      people.length, dependentCount, now, now,
    ),
  ];

  people.forEach((person, i) => {
    const keys = dedupeKeys({
      email: person.email,
      phone: person.phone,
      first_name: person.first_name,
      last_name: person.last_name,
      date_of_birth: person.date_of_birth,
    });

    statements.push(
      env.DB.prepare(
        `INSERT INTO members (id, org_id, household_id, first_name, last_name, email, phone,
                              date_of_birth, status, joined_at, city, state, postal_code,
                              dedupe_email, dedupe_phone, dedupe_name_dob,
                              onboarding_complete, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, 0, 'application', ?, ?)`,
      ).bind(
        memberIds[i], orgId, householdId, person.first_name, person.last_name,
        person.email, person.phone, person.date_of_birth, joinedAt,
        app.city, app.state, app.postal_code,
        keys.dedupe_email, keys.dedupe_phone, keys.dedupe_name_dob,
        now, now,
      ),
      env.DB.prepare(
        `INSERT INTO household_members
           (id, org_id, household_id, member_id, relationship, is_dependent, joined_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        newId('householdMember'), orgId, householdId, memberIds[i],
        person.relationship, person.is_dependent ? 1 : 0, joinedAt, now,
      ),
    );
  });

  statements.push(
    env.DB.prepare(
      `UPDATE member_applications
          SET status = 'accepted', decided_at = ?, decided_by = ?, decision_note = ?,
              created_member_id = ?, created_household_id = ?, updated_at = ?
        WHERE id = ? AND status != 'accepted'`,
    ).bind(now, actorId, note ?? null, memberIds[0], householdId, now, applicationId),
  );

  await env.DB.batch(statements);

  await audit(env.DB, {
    orgId, actorId, actorKind: 'user',
    action: 'application.accepted',
    subjectType: 'application', subjectId: applicationId,
    meta: { household_id: householdId, members: memberIds.length },
  });

  // The new household should appear on the board the same day it joins, not
  // after the next scheduled recompute — a family in transition is exactly what
  // Familia is for.
  for (const id of memberIds) await enqueueRecompute(env, orgId, id, 'application.accepted');

  return { household_id: householdId, member_ids: memberIds };
}

/** Open applications the ministry has not answered, oldest first. */
export async function openApplications(env: Env, orgId: string) {
  return all(
    env.DB,
    `SELECT id, first_name, last_name, email, status, submitted_at, first_opened_at,
            spam_score, household, requested_start_date
       FROM member_applications
      WHERE org_id = ? AND deleted_at IS NULL AND status IN ('submitted', 'in_review')
      ORDER BY submitted_at ASC
      LIMIT 200`,
    orgId,
  );
}

/** Mark that a human has actually opened this. Idempotent; only the first time counts. */
export async function markOpened(env: Env, orgId: string, id: string, now = nowIso()): Promise<void> {
  await run(
    env.DB,
    `UPDATE member_applications SET first_opened_at = ?, updated_at = ?
      WHERE id = ? AND org_id = ? AND first_opened_at IS NULL`,
    now, now, id, orgId,
  );
}
