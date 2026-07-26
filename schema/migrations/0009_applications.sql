-- ─────────────────────────────────────────────────────────────────────────────
-- Membership applications.
--
-- A ministry's front door. Until now people arrived only by import or by being
-- typed in, which means every ministry either ran a Google Form and retyped the
-- results or took applications on paper.
--
-- Two things make this worth being in the product rather than in a form
-- builder:
--
--   • Approval creates the household and its members, so a roster is never
--     retyped out of a PDF.
--   • A stalled application is precisely the failure this product exists to
--     notice. A family who applied and heard nothing is the same shape as a
--     claim nobody opened.
-- ─────────────────────────────────────────────────────────────────────────────

-- The form a ministry publishes. One live form per organization.
--
-- The configurable half. The spine — names, contact, household composition — is
-- in code, because approval writes it to real records and a form that might not
-- collect a surname cannot create a member.
CREATE TABLE application_forms (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL UNIQUE REFERENCES organizations(id),
  -- Bumped on publish. Every submission records the version it answered, so a
  -- ministry editing its form does not retroactively change what somebody was
  -- asked.
  version      INTEGER NOT NULL DEFAULT 1,
  intro        TEXT,
  sections     TEXT NOT NULL DEFAULT '[]',   -- JSON: FormSection[]
  -- Nothing is reachable publicly until a human publishes it. A half-edited
  -- form on a ministry's public URL is worse than no form.
  published_at TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE member_applications (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL REFERENCES organizations(id),

  -- ── The spine ──────────────────────────────────────────────────────────────
  -- Columns rather than JSON because these are queried, sorted, and deduped on,
  -- and because they map one-to-one onto the member record approval creates.
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  email         TEXT NOT NULL,
  phone         TEXT,
  date_of_birth TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city          TEXT,
  state         TEXT,
  postal_code   TEXT,
  household     TEXT NOT NULL DEFAULT '[]',  -- JSON: HouseholdApplicant[]
  requested_start_date TEXT,

  -- ── The configurable half ──────────────────────────────────────────────────
  answers       TEXT NOT NULL DEFAULT '{}',  -- JSON: section key → field key → value
  form_version  INTEGER NOT NULL,

  -- The guideline version in force when this was submitted.
  --
  -- Load-bearing. "The version in force at enrolment" is one of the four
  -- published rules for which guidelines govern a need, and without this it has
  -- no anchor — a decline years later could not say which document the member
  -- actually agreed to. Nullable because a ministry may not have published
  -- guidelines yet, and a missing anchor must read as "cannot tell" rather than
  -- silently becoming today's version.
  guideline_version_id TEXT REFERENCES sharing_guidelines(id),

  status        TEXT NOT NULL DEFAULT 'submitted'
                CHECK (status IN ('submitted', 'in_review', 'needs_info',
                                  'accepted', 'declined', 'withdrawn')),

  -- ── Review ─────────────────────────────────────────────────────────────────
  submitted_at  TEXT NOT NULL,
  -- Whether a human has opened it. Same reason claims track this: an
  -- application nobody has looked at is worse than a slow one, because the
  -- applicant cannot tell "being considered" from "lost".
  first_opened_at TEXT,
  decided_at    TEXT,
  decided_by    TEXT REFERENCES users(id),
  decision_note TEXT,

  -- What approval produced. Set once, and how the application stops being a
  -- form and becomes a family.
  created_member_id    TEXT REFERENCES members(id),
  created_household_id TEXT REFERENCES households(id),

  -- ── Corrections ────────────────────────────────────────────────────────────
  -- A submitted application is never edited. What somebody disclosed at
  -- application is the exact evidence a decline gets argued against years
  -- later, and an editable record is worthless as evidence. A correction is a
  -- new row pointing at the one it replaces; the original is kept.
  supersedes_id TEXT REFERENCES member_applications(id),

  -- ── Spam ───────────────────────────────────────────────────────────────────
  -- Scored, never enforced. A high score sorts an application into a
  -- low-confidence tab that a human still reads. Nothing is ever dropped: a
  -- silent drop tells an applicant their form was sent when it does not exist,
  -- and the cost of a false positive here is a family's membership.
  spam_score    INTEGER NOT NULL DEFAULT 0,
  spam_reasons  TEXT NOT NULL DEFAULT '[]',
  -- Hashed, not stored raw. Enough to count submissions from one source
  -- without keeping an address against a medical-adjacent record.
  source_ip_hash TEXT,

  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT
);

-- The board: open applications, oldest first, which is the order they should be
-- worked in.
CREATE INDEX idx_applications_board ON member_applications(org_id, status, submitted_at);
-- Deduping a repeat applicant, and the spam signal for an email already on file.
CREATE INDEX idx_applications_email ON member_applications(org_id, email);
CREATE INDEX idx_applications_ip ON member_applications(source_ip_hash, submitted_at);
