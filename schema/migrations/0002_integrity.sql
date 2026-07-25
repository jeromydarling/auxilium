-- ─────────────────────────────────────────────────────────────────────────────
-- Auxilium 0002 — claims integrity
--
-- V1 answered "who needs help?" This migration answers the question the whole
-- category is being asked by regulators, journalists, and plaintiffs' attorneys:
-- "where did the money go, and can you prove it?"
--
-- Every table here exists because a real ministry failed without it:
--
--   contributions / disbursements
--     Medical Cost Sharing collected $7.5M and shared $245,982 — 3.5%. Aliera
--     kept ~84 cents of every dollar. Neither is detectable without a ledger
--     with money-in and money-out on the same timeline. This is that ledger.
--
--   sharing_guidelines
--     Nearly every fraud case follows one pattern: market "covered from day
--     one", then deny on exactly that basis. Guidelines are versioned with an
--     effective date so a denial can be checked against the rules that were
--     actually published when the member joined — retroactive application is
--     the tell.
--
--   appeals
--     HCSMs have no statutory appeals process. A documented internal one is
--     both the right thing and the evidence a ministry needs when asked
--     whether members had recourse.
--
--   claim_repricing
--     Reference-based pricing against Medicare rates saves 20–50% on facility
--     claims. Ministries mostly lack the infrastructure to do it at all.
--
-- Money remains integer cents. Every table remains org-scoped.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Money in ─────────────────────────────────────────────────────────────────

CREATE TABLE contributions (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL REFERENCES organizations(id),
  household_id    TEXT REFERENCES households(id),
  member_id       TEXT REFERENCES members(id),
  amount_cents    INTEGER NOT NULL,
  -- 'YYYY-MM' — the sharing month this contribution is for. Distinct from
  -- received_at: a late payment in March for February belongs to February when
  -- computing that month's ratio.
  period          TEXT NOT NULL,
  received_at     TEXT NOT NULL,
  method          TEXT NOT NULL DEFAULT 'ach'
                  CHECK (method IN ('ach', 'card', 'check', 'cash', 'other')),
  -- 'share' is the monthly sharing amount; 'fee' is administrative and is
  -- deliberately excluded from the sharing pool in ratio math.
  kind            TEXT NOT NULL DEFAULT 'share'
                  CHECK (kind IN ('share', 'fee', 'donation', 'other')),
  reference       TEXT,
  created_at      TEXT NOT NULL
);
CREATE INDEX idx_contributions_org_period ON contributions(org_id, period);
CREATE INDEX idx_contributions_household ON contributions(household_id);
CREATE INDEX idx_contributions_received ON contributions(org_id, received_at);

-- ── Money out ────────────────────────────────────────────────────────────────

CREATE TABLE disbursements (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL REFERENCES organizations(id),
  -- Present when this payment shares a member's medical cost. NULL for
  -- administrative, vendor, and related-party payments — which is exactly the
  -- distinction the ratio turns on.
  need_id         TEXT REFERENCES needs(id),
  member_id       TEXT REFERENCES members(id),
  amount_cents    INTEGER NOT NULL,
  period          TEXT NOT NULL,               -- 'YYYY-MM'
  paid_at         TEXT NOT NULL,
  payee_name      TEXT NOT NULL,
  payee_type      TEXT NOT NULL DEFAULT 'provider'
                  CHECK (payee_type IN ('provider', 'member', 'vendor', 'staff',
                                        'related_party', 'other')),
  -- The category that decides which side of the ratio this lands on.
  --   'share'          → medical costs shared. The numerator.
  --   'administrative' → salaries, rent, software.
  --   'marketing'      → member acquisition.
  --   'related_party'  → payments to owners, their entities, or family.
  --                      Broken out because this is where diversion hides.
  category        TEXT NOT NULL DEFAULT 'share'
                  CHECK (category IN ('share', 'administrative', 'marketing',
                                      'related_party', 'refund', 'other')),
  -- Free-text disclosure of the relationship, required by policy when
  -- category = 'related_party'. Enforced in the API, not the database, so a
  -- historical import can still land.
  relationship    TEXT,
  approved_by     TEXT REFERENCES users(id),
  reference       TEXT,
  created_at      TEXT NOT NULL
);
CREATE INDEX idx_disbursements_org_period ON disbursements(org_id, period);
CREATE INDEX idx_disbursements_category ON disbursements(org_id, category, paid_at);
CREATE INDEX idx_disbursements_need ON disbursements(need_id);
CREATE INDEX idx_disbursements_payee ON disbursements(org_id, payee_name);

-- ── Published sharing guidelines ─────────────────────────────────────────────
-- Versioned and dated. A denial is checked against the version that was in
-- force when the member joined, not the version in force today.

CREATE TABLE sharing_guidelines (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL REFERENCES organizations(id),
  version         TEXT NOT NULL,               -- 'v3.1', '2026-01'
  effective_from  TEXT NOT NULL,               -- 'YYYY-MM-DD'
  effective_to    TEXT,                        -- NULL = currently in force
  -- Where members can actually read this. A guideline nobody can find is not
  -- a published guideline.
  published_url   TEXT,
  -- JSON array of provisions:
  --   { code, statement, supports_denial_codes[], waiting_period_days?,
  --     annual_limit_cents?, category? }
  -- `supports_denial_codes` is the load-bearing field: a denial citing a
  -- reason this provision does not support is a deviation, and that is the
  -- pattern behind nearly every case in the research.
  provisions      TEXT NOT NULL DEFAULT '[]',
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_guidelines_version ON sharing_guidelines(org_id, version);
CREATE INDEX idx_guidelines_effective ON sharing_guidelines(org_id, effective_from);

-- ── Appeals ──────────────────────────────────────────────────────────────────

CREATE TABLE appeals (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL REFERENCES organizations(id),
  need_id         TEXT NOT NULL REFERENCES needs(id),
  member_id       TEXT NOT NULL REFERENCES members(id),
  status          TEXT NOT NULL DEFAULT 'submitted'
                  CHECK (status IN ('submitted', 'in_review', 'more_info',
                                    'upheld', 'overturned', 'withdrawn')),
  -- The member's own words. Kept verbatim — it is the record of what they said
  -- happened, and paraphrasing it away is how ministries lose the thread.
  member_statement TEXT NOT NULL,
  -- What the ministry decided, and on what basis.
  decision_note   TEXT,
  decision_guideline_ref TEXT,
  submitted_at    TEXT NOT NULL,
  -- Appeals get their own clock. An appeal that quietly ages is worse than a
  -- denial, because the member believes something is happening.
  due_at          TEXT,
  decided_at      TEXT,
  decided_by      TEXT REFERENCES users(id),
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX idx_appeals_org_status ON appeals(org_id, status);
CREATE INDEX idx_appeals_need ON appeals(need_id);
CREATE INDEX idx_appeals_due ON appeals(org_id, due_at);

-- ── Reference-based repricing ────────────────────────────────────────────────

CREATE TABLE claim_repricing (
  id                    TEXT PRIMARY KEY,
  org_id                TEXT NOT NULL REFERENCES organizations(id),
  need_id               TEXT NOT NULL REFERENCES needs(id),
  -- What the facility billed — the chargemaster number.
  billed_cents          INTEGER NOT NULL,
  -- The Medicare allowable for this code and locality.
  medicare_cents        INTEGER NOT NULL,
  -- Basis points of the Medicare rate: 15000 = 150%. Integer to keep the whole
  -- calculation in integer arithmetic, consistent with money handling.
  multiplier_bps        INTEGER NOT NULL DEFAULT 15000,
  repriced_cents        INTEGER NOT NULL,
  savings_cents         INTEGER NOT NULL,
  method                TEXT NOT NULL DEFAULT 'medicare_reference'
                        CHECK (method IN ('medicare_reference', 'negotiated',
                                          'cash_price', 'manual')),
  status                TEXT NOT NULL DEFAULT 'proposed'
                        CHECK (status IN ('proposed', 'accepted', 'disputed',
                                          'settled', 'abandoned')),
  -- Provider pushback is normal and expected in RBP. Recording it is what
  -- makes the negotiation defensible later.
  provider_response     TEXT,
  notes                 TEXT,
  created_by            TEXT REFERENCES users(id),
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);
CREATE INDEX idx_repricing_need ON claim_repricing(need_id);
CREATE INDEX idx_repricing_org ON claim_repricing(org_id, status);

-- ── Integrity snapshots ──────────────────────────────────────────────────────
-- Point-in-time ratio computations. Derived data — always rebuildable from
-- contributions and disbursements — but persisted so trend and drift are
-- answerable without re-summing the whole ledger, and so a board can see what
-- the number was in March without recomputing history.

CREATE TABLE integrity_snapshots (
  id                    TEXT PRIMARY KEY,
  org_id                TEXT NOT NULL REFERENCES organizations(id),
  period                TEXT NOT NULL,          -- 'YYYY-MM'
  contributions_cents   INTEGER NOT NULL DEFAULT 0,
  shared_cents          INTEGER NOT NULL DEFAULT 0,
  administrative_cents  INTEGER NOT NULL DEFAULT 0,
  marketing_cents       INTEGER NOT NULL DEFAULT 0,
  related_party_cents   INTEGER NOT NULL DEFAULT 0,
  -- Basis points: 8000 = 80.00%. The ACA medical-loss-ratio floor is 80% for
  -- individual/small group and 85% for large group. HCSMs are exempt from it —
  -- which is exactly why publishing the comparison voluntarily is worth
  -- something.
  share_ratio_bps       INTEGER NOT NULL DEFAULT 0,
  -- JSON array of {code, label, weight, detail} — same explainability shape as
  -- NRI reason codes, so the UI renders both with one component.
  reason_codes          TEXT NOT NULL DEFAULT '[]',
  integrity_score       INTEGER NOT NULL DEFAULT 0,
  band                  TEXT NOT NULL DEFAULT 'healthy'
                        CHECK (band IN ('healthy', 'watch', 'concern', 'critical')),
  computed_at           TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_integrity_period ON integrity_snapshots(org_id, period);

-- ── Claim intake and SLA fields on needs ─────────────────────────────────────
-- Structured intake is what stops a claim silently stalling for months for
-- want of a procedure code. Every column here is a field a claim needs before
-- anyone can act on it.

ALTER TABLE needs ADD COLUMN procedure_code TEXT;
ALTER TABLE needs ADD COLUMN diagnosis_code TEXT;
ALTER TABLE needs ADD COLUMN provider_npi TEXT;
ALTER TABLE needs ADD COLUMN provider_name TEXT;
ALTER TABLE needs ADD COLUMN service_date TEXT;
ALTER TABLE needs ADD COLUMN billed_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE needs ADD COLUMN has_itemized_bill INTEGER NOT NULL DEFAULT 0;

-- The SLA clock. sla_due_at is set on submission from the org's configured
-- turnaround; first_response_at records when a human first actually engaged,
-- which is the number members experience as "did anyone read this".
ALTER TABLE needs ADD COLUMN sla_due_at TEXT;
ALTER TABLE needs ADD COLUMN first_response_at TEXT;

-- Denials must cite a reason AND the guideline provision that permits it.
-- A denial with no guideline reference is the single strongest integrity
-- signal in this schema.
ALTER TABLE needs ADD COLUMN denial_reason_code TEXT;
ALTER TABLE needs ADD COLUMN denial_guideline_ref TEXT;
ALTER TABLE needs ADD COLUMN denial_note TEXT;

-- Medi-Share's defense in several disputes was that it is a secondary payer
-- and other coverage had to be exhausted first. Tracking that explicitly turns
-- a multi-month manual investigation into a visible state.
ALTER TABLE needs ADD COLUMN secondary_payer_status TEXT NOT NULL DEFAULT 'not_required'
  CHECK (secondary_payer_status IN ('not_required', 'pending', 'in_progress',
                                    'exhausted', 'other_payer_paid', 'unknown'));
ALTER TABLE needs ADD COLUMN primary_payer_name TEXT;

CREATE INDEX idx_needs_sla ON needs(org_id, sla_due_at);
CREATE INDEX idx_needs_denial ON needs(org_id, denial_reason_code);
CREATE INDEX idx_needs_secondary_payer ON needs(org_id, secondary_payer_status);

-- ── Org integrity configuration ──────────────────────────────────────────────
-- Non-secret, per-ministry policy. Lives on the org so a ministry can hold
-- itself to a stricter turnaround than the default without a code change.

ALTER TABLE organizations ADD COLUMN sla_days INTEGER NOT NULL DEFAULT 17;
ALTER TABLE organizations ADD COLUMN appeal_sla_days INTEGER NOT NULL DEFAULT 30;
-- The ratio the ministry commits to publicly, in basis points. Default 8000
-- (80%) mirrors the ACA individual/small-group floor.
ALTER TABLE organizations ADD COLUMN target_share_ratio_bps INTEGER NOT NULL DEFAULT 8000;
ALTER TABLE organizations ADD COLUMN repricing_multiplier_bps INTEGER NOT NULL DEFAULT 15000;
