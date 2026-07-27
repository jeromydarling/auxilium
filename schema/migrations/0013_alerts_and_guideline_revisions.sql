-- 0013 — telling somebody, and being able to correct a published document.

-- ── Alerts ───────────────────────────────────────────────────────────────────
--
-- Until now the only thing that happened when the monthly close failed was a
-- console.log. A ministry's invoice could fail on the 1st and nobody — not them,
-- not us — would know. That is money, failing silently, in a product whose whole
-- argument is that things which fail silently are how families get stranded.
--
-- Rows rather than fire-and-forget email, for three reasons: an alert has a
-- lifecycle (raised, then either resolved by the system or acknowledged by a
-- human), the same condition recurring must not send the same email hourly, and
-- an unconfigured mail provider must not mean the alert never existed.
CREATE TABLE alerts (
  id            TEXT PRIMARY KEY,

  -- NULL means the platform itself rather than any one ministry — a reconciler
  -- that cannot reach Stripe at all, for instance. Nullable rather than a
  -- sentinel org so a tenant-scoped query can never accidentally match it.
  org_id        TEXT REFERENCES organizations(id),

  -- Who this is for. The distinction is not cosmetic: a ledger that disagrees
  -- with Stripe is usually *our* bug, and handing a ministry a raw discrepancy
  -- is alarming and gives them nothing they can act on.
  audience      TEXT NOT NULL CHECK (audience IN ('operator', 'ministry')),

  severity      TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),

  -- Stable identifier for the *condition*, not the occurrence: 'billing.close_failed',
  -- 'billing.ledger_gap'. Combined with dedupe_key below this is what stops one
  -- broken month generating an alert every hour.
  kind          TEXT NOT NULL,

  -- What makes two raisings the same problem. Usually kind + org + period.
  -- Re-raising an unresolved alert bumps last_seen_at and count; it does not
  -- insert a second row and does not send a second email.
  dedupe_key    TEXT NOT NULL,

  title         TEXT NOT NULL,
  -- Plain words, aimed at `audience`. Never a stack trace for a ministry.
  body          TEXT NOT NULL,
  -- Structured detail for whoever is fixing it. Not rendered to a ministry.
  meta          TEXT NOT NULL DEFAULT '{}',

  first_seen_at TEXT NOT NULL,
  last_seen_at  TEXT NOT NULL,
  seen_count    INTEGER NOT NULL DEFAULT 1,

  -- Set when the condition stops being true — a repaired ledger, a successful
  -- retry. Resolution is automatic and silent: a "this is fixed now" email for
  -- something nobody was told about in the first place is pure noise.
  resolved_at   TEXT,
  -- Set when a human says they have it. Distinct from resolved: acknowledging
  -- does not make the problem go away, and the two being one column is how a
  -- dashboard ends up showing green over a live fault.
  acked_at      TEXT,
  acked_by      TEXT REFERENCES users(id),

  -- Null until an email actually went out, so an unconfigured mail provider is
  -- visibly a delivery failure rather than an alert that never happened.
  emailed_at    TEXT,

  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- One live alert per condition. Partial, so the same condition recurring next
-- month is a new row rather than a constraint violation.
CREATE UNIQUE INDEX idx_alerts_live ON alerts(dedupe_key) WHERE resolved_at IS NULL;
CREATE INDEX idx_alerts_org ON alerts(org_id, resolved_at, severity);
CREATE INDEX idx_alerts_audience ON alerts(audience, resolved_at, last_seen_at);

-- ── Guideline corrections ────────────────────────────────────────────────────
--
-- `sharing_guidelines` was insert-only, with a unique index on (org_id, version)
-- and no update or delete path anywhere. A ministry that published a version
-- with a mistyped effective date could not fix it at all — and its only escape
-- was publishing a near-duplicate version, which muddles which document binds
-- which members.
--
-- Two different things get called "changing the guidelines" and they have
-- opposite consequences for past decisions:
--
--   • A **correction** — the record here never matched the real published
--     document. The wrong text should never have governed anything, so declines
--     scored against it are re-audited against the corrected text.
--   • A **new version** — the ministry genuinely changed its rules. Both
--     documents are real, each governed a period, and re-scoring old declines
--     against the new one would be falsifying history.
--
-- Correction updates the row in place — which is what keeps `guideline_version_id`
-- foreign keys and the unique index intact — and the superseded text is archived
-- here first. Nothing is ever lost; what a decline was actually judged against
-- stays readable forever.
CREATE TABLE guideline_revisions (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL REFERENCES organizations(id),
  guideline_id  TEXT NOT NULL REFERENCES sharing_guidelines(id),

  -- The complete previous row as JSON. A snapshot rather than a column-by-column
  -- copy, because the point is to answer "what did this say on the day that
  -- decline was made" years later, including columns that do not exist yet.
  snapshot      TEXT NOT NULL,

  -- Why it was corrected. Required by the API: a correction with no stated
  -- reason is indistinguishable from a quiet rewrite, and this table exists
  -- precisely so that distinction survives.
  reason        TEXT NOT NULL,

  corrected_by  TEXT REFERENCES users(id),
  corrected_at  TEXT NOT NULL
);
CREATE INDEX idx_guideline_revisions ON guideline_revisions(org_id, guideline_id, corrected_at);

-- Withdrawal, for a version published by mistake. Allowed only when nothing
-- references it — the API checks declines and applications first and refuses
-- with "correct it instead" when anything does. Soft, like every other delete
-- here, because a withdrawn version that turns out to have been cited is a
-- document we would need back.
ALTER TABLE sharing_guidelines ADD COLUMN deleted_at TEXT;
