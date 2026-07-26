-- ─────────────────────────────────────────────────────────────────────────────
-- Clear the demo organizations, in dependency order.
--
-- This exists because "safe to re-run" quietly stopped being true. Each seed
-- file used to clean up after itself, which worked only because the local
-- workflow wipes the whole database first — so the deletes never had anything
-- to delete. Seeding a database that already has rows in it, which is exactly
-- what seeding a deployed environment is, hit a foreign key immediately:
-- `seed.sql` deletes `needs` while `seed-integrity.sql`'s disbursements and
-- appeals still point at them, and now `member_accounts` points at `members`
-- too.
--
-- Splitting the teardown out and running it first fixes the ordering problem
-- once instead of in three files that each know a piece of it. Every statement
-- is scoped to the two demo organizations by id: this file cannot touch a real
-- ministry's data, which is the property that makes it safe to point at a
-- deployed database at all.
--
-- Order is leaf-first — anything holding a foreign key goes before the row it
-- points at.
-- ─────────────────────────────────────────────────────────────────────────────

-- Portal sessions hang off accounts, which hang off members.
DELETE FROM member_sessions WHERE member_account_id IN
  (SELECT id FROM member_accounts
    WHERE org_id IN ('org_demo_shelter_valley', 'org_demo_redemption'));
DELETE FROM member_invites  WHERE org_id IN ('org_demo_shelter_valley', 'org_demo_redemption');
DELETE FROM member_accounts WHERE org_id IN ('org_demo_shelter_valley', 'org_demo_redemption');

-- Claims integrity: everything that points at a need or a member.
DELETE FROM claim_repricing     WHERE org_id IN ('org_demo_shelter_valley', 'org_demo_redemption');
DELETE FROM appeals             WHERE org_id IN ('org_demo_shelter_valley', 'org_demo_redemption');
DELETE FROM disbursements       WHERE org_id IN ('org_demo_shelter_valley', 'org_demo_redemption');
DELETE FROM contributions       WHERE org_id IN ('org_demo_shelter_valley', 'org_demo_redemption');
DELETE FROM integrity_snapshots WHERE org_id IN ('org_demo_shelter_valley', 'org_demo_redemption');
DELETE FROM sharing_guidelines  WHERE org_id IN ('org_demo_shelter_valley', 'org_demo_redemption');

-- Billing and processor migration.
DELETE FROM billing_events   WHERE org_id IN ('org_demo_shelter_valley', 'org_demo_redemption');
DELETE FROM billing_periods  WHERE org_id IN ('org_demo_shelter_valley', 'org_demo_redemption');
DELETE FROM billing_accounts WHERE org_id IN ('org_demo_shelter_valley', 'org_demo_redemption');
DELETE FROM processor_migration_rows WHERE migration_id IN
  (SELECT id FROM processor_migrations
    WHERE org_id IN ('org_demo_shelter_valley', 'org_demo_redemption'));
DELETE FROM processor_migrations WHERE org_id IN ('org_demo_shelter_valley', 'org_demo_redemption');

-- Knowledge.
DELETE FROM kb_questions WHERE org_id IN ('org_demo_shelter_valley', 'org_demo_redemption');
DELETE FROM kb_articles  WHERE org_id IN ('org_demo_shelter_valley', 'org_demo_redemption');

-- Needs and the care record.
DELETE FROM need_updates      WHERE org_id IN ('org_demo_shelter_valley', 'org_demo_redemption');
DELETE FROM documents         WHERE org_id IN ('org_demo_shelter_valley', 'org_demo_redemption');
DELETE FROM needs             WHERE org_id IN ('org_demo_shelter_valley', 'org_demo_redemption');
DELETE FROM prayer_requests   WHERE org_id IN ('org_demo_shelter_valley', 'org_demo_redemption');
DELETE FROM member_signals    WHERE org_id IN ('org_demo_shelter_valley', 'org_demo_redemption');

-- Imports point at members they matched.
DELETE FROM import_rows     WHERE org_id IN ('org_demo_shelter_valley', 'org_demo_redemption');
DELETE FROM import_mappings WHERE org_id IN ('org_demo_shelter_valley', 'org_demo_redemption');
DELETE FROM imports         WHERE org_id IN ('org_demo_shelter_valley', 'org_demo_redemption');

-- The roster.
DELETE FROM household_members WHERE org_id IN ('org_demo_shelter_valley', 'org_demo_redemption');
DELETE FROM members           WHERE org_id IN ('org_demo_shelter_valley', 'org_demo_redemption');
DELETE FROM households        WHERE org_id IN ('org_demo_shelter_valley', 'org_demo_redemption');

-- Staff, their sessions, and anything authored by them.
DELETE FROM cms_pages     WHERE org_id IN ('org_demo_shelter_valley', 'org_demo_redemption');
DELETE FROM nri_sessions  WHERE org_id IN ('org_demo_shelter_valley', 'org_demo_redemption');
DELETE FROM audit_log     WHERE org_id IN ('org_demo_shelter_valley', 'org_demo_redemption');
DELETE FROM sessions      WHERE org_id IN ('org_demo_shelter_valley', 'org_demo_redemption');
DELETE FROM users         WHERE org_id IN ('org_demo_shelter_valley', 'org_demo_redemption');

DELETE FROM organizations WHERE id IN ('org_demo_shelter_valley', 'org_demo_redemption');
