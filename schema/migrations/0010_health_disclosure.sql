-- Health disclosure: the second stage of joining.
--
-- Kept off the public application on purpose. Pre-existing disclosure is the
-- most sensitive material a ministry holds and the exact evidence a decline
-- gets argued over years later, so it is collected signed in, against a known
-- account, rather than from an anonymous stranger over an unauthenticated POST.
--
-- One row per person, never per household. A pre-existing condition belongs to
-- one member; recording it against a household would let a spouse's diagnosis
-- limit a child's need, which is not how any published guideline works.

-- The ministry's questions and, critically, its lookback window.
CREATE TABLE health_disclosure_forms (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL UNIQUE REFERENCES organizations(id),
  -- Months of history the ministry actually looks back over. Shown to the
  -- member inside the question, because "have you had any of the following"
  -- means something different at 24 months and at 36 — and the difference
  -- decides whether a need is shared.
  lookback_months INTEGER NOT NULL DEFAULT 24,
  -- Conditions with a longer window. Cancer is commonly 60 months.
  extended        TEXT NOT NULL DEFAULT '[]',
  intro           TEXT,
  questions       TEXT NOT NULL DEFAULT '[]',
  version         INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE member_health_disclosures (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL REFERENCES organizations(id),
  member_id     TEXT NOT NULL REFERENCES members(id),
  -- The application this followed, when there was one. Members who arrived by
  -- import have no application and still need to disclose, so it is nullable.
  application_id TEXT REFERENCES member_applications(id),

  answers       TEXT NOT NULL DEFAULT '{}',
  -- Which questions, and which lookback window, were actually put to them.
  -- Without this a disclosure cannot be read back correctly after the ministry
  -- edits its form: "no" to a 24-month question is not "no" to a 36-month one.
  form_version  INTEGER NOT NULL,
  lookback_months INTEGER NOT NULL,

  -- Set on submit. Before this it is a draft the member can keep editing;
  -- after, it is a record. Same rule as the application: what somebody
  -- disclosed is evidence, and evidence that can be edited is not evidence.
  completed_at  TEXT,
  -- Corrections supersede rather than overwrite. A member who remembers
  -- something later should be able to say so without erasing what they first
  -- said — the gap between the two is itself sometimes the question.
  --
  -- Two columns rather than one, and the direction matters. `supersedes_id`
  -- points **backwards** at the row being replaced, so the foreign key always
  -- references something that already exists. `superseded_at` marks the old
  -- row as no longer current.
  --
  -- A single forward-pointing column cannot do both: the old row would have to
  -- reference a row not yet inserted, and reversing the write order trips the
  -- one-live-row index instead, because both would briefly be live.
  supersedes_id TEXT REFERENCES member_health_disclosures(id),
  superseded_at TEXT,

  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- Exactly one live disclosure per member. Superseded rows keep their place in
-- the table and drop out of this index, which is what makes "the current
-- answers" a fact rather than a query somebody has to remember to write.
CREATE UNIQUE INDEX idx_health_disclosure_member
  ON member_health_disclosures(member_id) WHERE superseded_at IS NULL;
CREATE INDEX idx_health_disclosure_org ON member_health_disclosures(org_id, completed_at);
