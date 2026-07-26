-- ─────────────────────────────────────────────────────────────────────────────
-- Billing: Stripe Connect, settled volume, and the platform fee.
--
-- The commercial model is the greater of a monthly minimum or a graduated
-- percentage of settled member contribution volume (src/lib/pricing/tiers.ts).
-- Three things have to be true for that to be billable, and each gets a table:
--
--   1. We know which Stripe account belongs to which ministry.
--   2. We know what actually settled in a month, net of refunds.
--   3. We never double-count, whatever Stripe redelivers.
--
-- Member contributions settle into the ministry's own connected account.
-- Auxilium invoices its platform fee against that account at month end; it
-- never holds sharing funds as operating money, and nothing in this schema
-- models Auxilium receiving a member's contribution.
-- ─────────────────────────────────────────────────────────────────────────────

-- One connected Stripe account per ministry.
CREATE TABLE billing_accounts (
  id                  TEXT PRIMARY KEY,
  org_id              TEXT NOT NULL UNIQUE REFERENCES organizations(id),
  stripe_account_id   TEXT NOT NULL UNIQUE,
  -- Mirrored from Stripe rather than trusted from the browser. A ministry can
  -- start onboarding and never finish, and the difference between "connected"
  -- and "can actually accept money" is the whole question.
  charges_enabled     INTEGER NOT NULL DEFAULT 0,
  payouts_enabled     INTEGER NOT NULL DEFAULT 0,
  details_submitted   INTEGER NOT NULL DEFAULT 0,
  -- Free-text from Stripe's requirements object: what is still outstanding.
  requirements_note   TEXT,
  country             TEXT NOT NULL DEFAULT 'US',
  default_currency    TEXT NOT NULL DEFAULT 'usd',
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  deleted_at          TEXT
);
CREATE INDEX idx_billing_accounts_stripe ON billing_accounts(stripe_account_id);

-- One row per ministry per calendar month.
--
-- `settled_volume_cents` is maintained incrementally as payments settle and
-- refunds land, so closing a period is arithmetic rather than a scan. It is
-- still recomputable from `contributions` if the two ever disagree — and a
-- mismatch is worth knowing about, so `recomputed_volume_cents` records what
-- the scan said at close time.
CREATE TABLE billing_periods (
  id                      TEXT PRIMARY KEY,
  org_id                  TEXT NOT NULL REFERENCES organizations(id),
  -- 'YYYY-MM'. Sorts lexicographically, which is why it is a string.
  period                  TEXT NOT NULL,
  settled_volume_cents    INTEGER NOT NULL DEFAULT 0,
  refunded_cents          INTEGER NOT NULL DEFAULT 0,
  recomputed_volume_cents INTEGER,
  -- The fee, and the schedule that produced it. Storing the version means an
  -- invoice from eighteen months ago can still be explained after the rate
  -- card changes.
  platform_fee_cents      INTEGER,
  pricing_version         TEXT,
  status                  TEXT NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open', 'closed', 'invoiced', 'paid', 'failed', 'void')),
  stripe_invoice_id       TEXT,
  stripe_invoice_url      TEXT,
  failure_reason          TEXT,
  closed_at               TEXT,
  invoiced_at             TEXT,
  paid_at                 TEXT,
  created_at              TEXT NOT NULL,
  updated_at              TEXT NOT NULL,
  UNIQUE (org_id, period)
);
CREATE INDEX idx_billing_periods_status ON billing_periods(status, period);

-- Every Stripe event we have seen, by Stripe's own id.
--
-- Stripe guarantees at-least-once delivery and will redeliver on any non-2xx,
-- so the webhook must be idempotent or a redelivered `charge.succeeded` bills
-- the ministry twice. The unique constraint on event_id is what makes that
-- impossible rather than unlikely.
CREATE TABLE billing_events (
  id            TEXT PRIMARY KEY,
  event_id      TEXT NOT NULL UNIQUE,
  type          TEXT NOT NULL,
  org_id        TEXT REFERENCES organizations(id),
  -- Set once the handler has finished. A row present but unprocessed means we
  -- accepted the event and then failed, which is worth being able to find.
  processed_at  TEXT,
  error         TEXT,
  received_at   TEXT NOT NULL
);
CREATE INDEX idx_billing_events_type ON billing_events(type, received_at);

-- Stripe linkage on the existing ledger.
--
-- The contributions table predates payments and is still the source of truth
-- for the share ratio. These columns let a settled Stripe payment become a
-- contribution row without a second ledger, and let a refund find its way back
-- to the row it reverses.
ALTER TABLE contributions ADD COLUMN stripe_payment_intent_id TEXT;
ALTER TABLE contributions ADD COLUMN stripe_charge_id TEXT;
ALTER TABLE contributions ADD COLUMN settled_at TEXT;
-- Stripe's cut, recorded separately because it is the ministry's cost and not
-- Auxilium's revenue. The pricing page promises these are shown apart.
ALTER TABLE contributions ADD COLUMN processor_fee_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE contributions ADD COLUMN refunded_cents INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX idx_contributions_payment_intent
  ON contributions(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
CREATE INDEX idx_contributions_charge ON contributions(stripe_charge_id);
