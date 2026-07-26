-- Member invitations.
--
-- A member never gets a password handed to them. Staff create the account and
-- send a link; the member sets their own password and the account activates on
-- first use. That is the same pattern the staff invite flow should eventually
-- use, and it matters more here: a ministry emailing five thousand households a
-- password it chose would be putting the same credential in an inbox, a support
-- ticket, and a spreadsheet.
--
-- The token is stored as a SHA-256 like every other credential in this system.
-- A dump of this table yields nobody a login, only the knowledge that an invite
-- exists.

CREATE TABLE member_invites (
  id                TEXT PRIMARY KEY,
  org_id            TEXT NOT NULL REFERENCES organizations(id),
  member_account_id TEXT NOT NULL REFERENCES member_accounts(id),
  token_hash        TEXT NOT NULL UNIQUE,
  expires_at        TEXT NOT NULL,
  -- Set the moment the invite is redeemed. Checked on redemption so a link
  -- forwarded, screenshotted, or left in an inbox cannot be used twice.
  used_at           TEXT,
  -- Who sent it. An invite is a grant of access to one family's medical
  -- circumstances, so it belongs in the audit trail with a name on it.
  created_by        TEXT REFERENCES users(id),
  created_at        TEXT NOT NULL
);

CREATE INDEX idx_member_invites_account ON member_invites(member_account_id);
CREATE INDEX idx_member_invites_expiry ON member_invites(expires_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- Widen the audit log to record members as actors.
--
-- Two things blocked it, and both were latent bugs rather than deliberate
-- constraints:
--
--   • `actor_kind` was checked against a list that predates members existing.
--   • `actor_id` carried a foreign key to `users`, which was already wrong.
--     A member account id is not a user id, so the insert would fail outright —
--     but the constraint was also never right for 'system', 'queue', or
--     'import' actors, which have no row in `users` at all and only worked
--     because they pass NULL.
--
-- `actor_kind` is what says which table the id belongs to, so it is the
-- discriminator and the foreign key is dropped. SQLite cannot alter a CHECK or
-- drop a constraint in place, so the table is rebuilt. Nothing references
-- `audit_log`, which makes this safe: it is an append-only log with no
-- dependents.
--
-- Recording "a member activated their own account" as `actor_kind = 'user'`
-- would have been the cheap fix and the wrong one. Somebody reading this log in
-- a dispute needs to tell "the member did this" from "staff did this to the
-- member" without inferring it from the action string.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE audit_log_new (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL REFERENCES organizations(id),
  -- No foreign key: `actor_kind` decides which table this points at.
  actor_id      TEXT,
  actor_kind    TEXT NOT NULL DEFAULT 'user'
                CHECK (actor_kind IN ('user', 'member', 'system', 'queue', 'import')),
  action        TEXT NOT NULL,
  subject_type  TEXT,
  subject_id    TEXT,
  meta          TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT NOT NULL
);

INSERT INTO audit_log_new (id, org_id, actor_id, actor_kind, action, subject_type, subject_id, meta, created_at)
  SELECT id, org_id, actor_id, actor_kind, action, subject_type, subject_id, meta, created_at
    FROM audit_log;

DROP TABLE audit_log;
ALTER TABLE audit_log_new RENAME TO audit_log;

CREATE INDEX idx_audit_org_time ON audit_log(org_id, created_at DESC);
CREATE INDEX idx_audit_subject ON audit_log(org_id, subject_type, subject_id);
