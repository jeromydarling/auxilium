-- ─────────────────────────────────────────────────────────────────────────────
-- Processor migration: moving an existing paying membership onto Stripe.
--
-- The thing that actually blocks a ministry from switching is not features, it
-- is five thousand households being asked to re-enter a bank account. Stripe
-- imports cards and ACH mandates from a prior processor without any of that;
-- these tables track the coordination around it.
--
-- **No payment data lives here.** Not encrypted, not tokenized, not "just the
-- PAN temporarily". Card numbers go from the losing processor to Stripe
-- directly, and Auxilium holds only what it needs to reconcile afterwards: an
-- old customer id, a last four, an expiry, a wallet flag. The upload path
-- refuses any file containing something that passes a Luhn check, and that
-- refusal happens before anything is written.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE processor_migrations (
  id                  TEXT PRIMARY KEY,
  org_id              TEXT NOT NULL REFERENCES organizations(id),
  -- Which platform the ministry is leaving. See src/lib/migration/processors.ts.
  source_processor    TEXT NOT NULL,
  source_merchant_id  TEXT,

  -- The wizard is a sequence, and a ministry needs to see where it is.
  status              TEXT NOT NULL DEFAULT 'planning'
                      CHECK (status IN (
                        'planning',      -- choosing a processor, reading the plan
                        'requested',     -- the letter has gone to the old processor
                        'manifest',      -- metadata manifest uploaded and validated
                        'in_transit',    -- the processor is sending data to Stripe
                        'reconciling',   -- Stripe's mapping is back, matching to members
                        'dual_running',  -- both platforms live, watching first charges
                        'complete',
                        'abandoned'
                      )),

  -- Counts from the last manifest validation, so the dashboard does not have to
  -- re-scan every row to render.
  total_rows          INTEGER NOT NULL DEFAULT 0,
  ready_rows          INTEGER NOT NULL DEFAULT 0,
  flagged_rows        INTEGER NOT NULL DEFAULT 0,
  manual_rows         INTEGER NOT NULL DEFAULT 0,

  -- Wallet segments Stripe's import cannot fully cover, tracked separately
  -- because they are the members who need a phone call regardless.
  apple_pay_rows      INTEGER NOT NULL DEFAULT 0,
  google_pay_rows     INTEGER NOT NULL DEFAULT 0,

  notes               TEXT,
  requested_at        TEXT,
  completed_at        TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  deleted_at          TEXT
);
CREATE INDEX idx_proc_migrations_org ON processor_migrations(org_id, status);

-- One row per payer being moved.
--
-- This is the dual-run safety net: it is what lets staff see, per member,
-- whether the payment method landed and whether the first Auxilium-side charge
-- actually succeeded — before the old processor is switched off.
CREATE TABLE processor_migration_rows (
  id                       TEXT PRIMARY KEY,
  migration_id             TEXT NOT NULL REFERENCES processor_migrations(id),
  org_id                   TEXT NOT NULL REFERENCES organizations(id),

  -- The join key from the old platform. Everything downstream hangs off this.
  legacy_customer_id       TEXT NOT NULL,
  email                    TEXT,
  member_number            TEXT,

  -- Enough to recognise a payment method, and nowhere near enough to use one.
  last4                    TEXT,
  exp_month                INTEGER,
  exp_year                 INTEGER,
  method                   TEXT CHECK (method IN ('card', 'bank', 'unknown')),
  wallet                   TEXT NOT NULL DEFAULT 'none'
                           CHECK (wallet IN ('none', 'apple_pay', 'google_pay', 'other_wallet')),

  -- For rebuilding the subscription on the member's existing billing day, so
  -- nobody is double-charged or skipped in the changeover month.
  amount_cents             INTEGER,
  billing_day              INTEGER,

  -- Filled in from Stripe's returned mapping file.
  stripe_customer_id       TEXT,
  stripe_payment_method_id TEXT,
  stripe_subscription_id   TEXT,

  member_id                TEXT REFERENCES members(id),
  match_method             TEXT CHECK (match_method IN ('member_number', 'email', 'manual', 'unmatched')),

  status                   TEXT NOT NULL DEFAULT 'listed'
                           CHECK (status IN (
                             'listed',        -- in the manifest
                             'imported',      -- Stripe has the payment method
                             'matched',       -- linked to a member here
                             'subscribed',    -- recurring billing rebuilt
                             'charged',       -- first charge succeeded — the one that matters
                             'needs_attention',
                             'excluded'       -- wallet or otherwise unmigratable
                           )),
  issue                    TEXT,

  first_charge_at          TEXT,
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL,

  UNIQUE (migration_id, legacy_customer_id)
);
CREATE INDEX idx_proc_rows_status ON processor_migration_rows(org_id, status);
CREATE INDEX idx_proc_rows_member ON processor_migration_rows(member_id);
