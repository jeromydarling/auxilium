-- ─────────────────────────────────────────────────────────────────────────────
-- Auxilium integrity seed
--
-- Adds a money ledger, published guidelines, denials, and appeals to the demo
-- ministry, plus a second organization that reproduces the Aliera pattern so
-- the detection can be seen working rather than described.
--
-- Run after schema/seed.sql.
--
-- Shelter Valley (the demo ministry) is healthy but imperfect — a real, well-run
-- ministry with a couple of things to fix, which is more useful to look at than
-- a perfect score.
--
-- Redemption Health Alliance is the cautionary case: 16% share ratio, undisclosed
-- related-party payments, denials citing nothing, and a guideline applied
-- retroactively. Every one of those is drawn from the public record.
-- ─────────────────────────────────────────────────────────────────────────────

-- Cleanup runs child-table-first, in foreign-key order. Getting this wrong is
-- how a seed passes on a clean database and fails on every re-run: the second
-- time through, the rows that reference these actually exist.
DELETE FROM claim_repricing     WHERE org_id IN ('org_demo_shelter_valley', 'org_demo_redemption');
DELETE FROM appeals             WHERE org_id IN ('org_demo_shelter_valley', 'org_demo_redemption');
DELETE FROM integrity_snapshots WHERE org_id IN ('org_demo_shelter_valley', 'org_demo_redemption');
DELETE FROM sharing_guidelines  WHERE org_id IN ('org_demo_shelter_valley', 'org_demo_redemption');
DELETE FROM disbursements       WHERE org_id IN ('org_demo_shelter_valley', 'org_demo_redemption');
DELETE FROM contributions       WHERE org_id IN ('org_demo_shelter_valley', 'org_demo_redemption');

-- The comparison org is rebuilt from scratch each run. Its needs reference its
-- members, so they go first.
DELETE FROM need_updates      WHERE org_id = 'org_demo_redemption';
DELETE FROM prayer_requests   WHERE org_id = 'org_demo_redemption';
DELETE FROM needs             WHERE org_id = 'org_demo_redemption';
DELETE FROM household_members WHERE org_id = 'org_demo_redemption';
DELETE FROM households        WHERE org_id = 'org_demo_redemption';
DELETE FROM documents         WHERE org_id = 'org_demo_redemption';
DELETE FROM import_rows       WHERE org_id = 'org_demo_redemption';
DELETE FROM import_mappings   WHERE org_id = 'org_demo_redemption';
DELETE FROM imports           WHERE org_id = 'org_demo_redemption';
DELETE FROM cms_pages         WHERE org_id = 'org_demo_redemption';
-- Derived NRI data. Easy to forget precisely because nothing writes it by
-- hand — signing in to this org once is enough for the engine to create it,
-- and then the organization row can no longer be deleted.
DELETE FROM member_signals    WHERE org_id = 'org_demo_redemption';
DELETE FROM nri_sessions      WHERE org_id = 'org_demo_redemption';
DELETE FROM sessions          WHERE org_id = 'org_demo_redemption';
DELETE FROM audit_log         WHERE org_id = 'org_demo_redemption';
DELETE FROM members           WHERE org_id = 'org_demo_redemption';
DELETE FROM users             WHERE org_id = 'org_demo_redemption';
DELETE FROM organizations     WHERE id = 'org_demo_redemption';

-- ── Shelter Valley: published guidelines ─────────────────────────────────────

UPDATE organizations
   SET sla_days = 17,
       appeal_sla_days = 30,
       target_share_ratio_bps = 8000,
       brand = '{"wordmark":"Shelter Valley","supportEmail":"care@sheltervalley.example","tagline":"Carrying one another''s burdens.","publish_share_ratio":true,"demo_primary":true}'
 WHERE id = 'org_demo_shelter_valley';

INSERT INTO sharing_guidelines (id, org_id, version, effective_from, effective_to, published_url, provisions, created_at, updated_at)
VALUES (
  'gl_sv_v2', 'org_demo_shelter_valley', 'v2.0', '2024-01-01', NULL,
  'https://sheltervalley.example/guidelines/v2',
  json('[
    {"code":"preexisting.phase_in","statement":"Pre-existing conditions phase in over 36 months of membership.","supports_denial_codes":["preexisting_within_waiting_period"],"waiting_period_days":1095},
    {"code":"maternity.day_one","statement":"Maternity is shared from day one of membership.","supports_denial_codes":[],"category":"maternity"},
    {"code":"cosmetic.excluded","statement":"Cosmetic and elective procedures are not shared.","supports_denial_codes":["excluded","elective","cosmetic"],"category":"cosmetic"},
    {"code":"documentation.required","statement":"An itemized bill is required before a need can be shared.","supports_denial_codes":["documentation_incomplete"]},
    {"code":"annual.limit","statement":"Sharing is limited to $1,000,000 per member per year.","supports_denial_codes":["annual_limit_reached"],"annual_limit_cents":100000000}
  ]'),
  datetime('now', '-400 days'), datetime('now', '-400 days')
);

-- ── Shelter Valley: six months of a healthy ledger ───────────────────────────
-- Roughly 82–86% of contributions reaching medical costs — a real ministry
-- doing this properly, with ordinary month-to-month variation.

INSERT INTO contributions (id, org_id, household_id, amount_cents, period, received_at, method, kind, created_at)
VALUES
  ('con_sv_1', 'org_demo_shelter_valley', NULL, 48200000, strftime('%Y-%m', 'now'),                  datetime('now', '-5 days'),   'ach', 'share', datetime('now')),
  ('con_sv_2', 'org_demo_shelter_valley', NULL, 47800000, strftime('%Y-%m', 'now', '-1 month'),      datetime('now', '-35 days'),  'ach', 'share', datetime('now')),
  ('con_sv_3', 'org_demo_shelter_valley', NULL, 47100000, strftime('%Y-%m', 'now', '-2 months'),     datetime('now', '-65 days'),  'ach', 'share', datetime('now')),
  ('con_sv_4', 'org_demo_shelter_valley', NULL, 46500000, strftime('%Y-%m', 'now', '-3 months'),     datetime('now', '-95 days'),  'ach', 'share', datetime('now')),
  ('con_sv_5', 'org_demo_shelter_valley', NULL, 46000000, strftime('%Y-%m', 'now', '-4 months'),     datetime('now', '-125 days'), 'ach', 'share', datetime('now')),
  ('con_sv_6', 'org_demo_shelter_valley', NULL, 45400000, strftime('%Y-%m', 'now', '-5 months'),     datetime('now', '-155 days'), 'ach', 'share', datetime('now')),
  -- Administrative fees are collected separately and excluded from the pool.
  ('con_sv_f1','org_demo_shelter_valley', NULL,  1800000, strftime('%Y-%m', 'now'),                  datetime('now', '-5 days'),   'ach', 'fee',   datetime('now'));

INSERT INTO disbursements (id, org_id, need_id, member_id, amount_cents, period, paid_at, payee_name, payee_type, category, approved_by, created_at)
VALUES
  -- Shared medical costs.
  ('dis_sv_1',  'org_demo_shelter_valley', NULL, NULL, 40100000, strftime('%Y-%m', 'now'),              datetime('now', '-4 days'),   'Various providers', 'provider', 'share', 'usr_demo_grace', datetime('now')),
  ('dis_sv_2',  'org_demo_shelter_valley', NULL, NULL, 40600000, strftime('%Y-%m', 'now', '-1 month'),  datetime('now', '-34 days'),  'Various providers', 'provider', 'share', 'usr_demo_grace', datetime('now')),
  ('dis_sv_3',  'org_demo_shelter_valley', NULL, NULL, 39500000, strftime('%Y-%m', 'now', '-2 months'), datetime('now', '-64 days'),  'Various providers', 'provider', 'share', 'usr_demo_grace', datetime('now')),
  ('dis_sv_4',  'org_demo_shelter_valley', NULL, NULL, 39900000, strftime('%Y-%m', 'now', '-3 months'), datetime('now', '-94 days'),  'Various providers', 'provider', 'share', 'usr_demo_grace', datetime('now')),
  ('dis_sv_5',  'org_demo_shelter_valley', NULL, NULL, 38800000, strftime('%Y-%m', 'now', '-4 months'), datetime('now', '-124 days'), 'Various providers', 'provider', 'share', 'usr_demo_grace', datetime('now')),
  ('dis_sv_6',  'org_demo_shelter_valley', NULL, NULL, 38600000, strftime('%Y-%m', 'now', '-5 months'), datetime('now', '-154 days'), 'Various providers', 'provider', 'share', 'usr_demo_grace', datetime('now')),
  -- The specific case payments, so individual claims reconcile.
  ('dis_sv_m1', 'org_demo_shelter_valley', 'need_demo_okonkwo_birth', 'mem_demo_ada_o', 7200000, strftime('%Y-%m', 'now'), datetime('now', '-8 days'), 'Nixa Regional Birthing Center', 'provider', 'share', 'usr_demo_grace', datetime('now')),
  -- Administration: about 8% of contributions. Ordinary and disclosed.
  ('dis_sv_a1', 'org_demo_shelter_valley', NULL, NULL,  3900000, strftime('%Y-%m', 'now'),              datetime('now', '-3 days'),   'Staff payroll',     'staff',    'administrative', 'usr_demo_grace', datetime('now')),
  ('dis_sv_a2', 'org_demo_shelter_valley', NULL, NULL,  3850000, strftime('%Y-%m', 'now', '-1 month'),  datetime('now', '-33 days'),  'Staff payroll',     'staff',    'administrative', 'usr_demo_grace', datetime('now')),
  ('dis_sv_a3', 'org_demo_shelter_valley', NULL, NULL,  3800000, strftime('%Y-%m', 'now', '-2 months'), datetime('now', '-63 days'),  'Staff payroll',     'staff',    'administrative', 'usr_demo_grace', datetime('now')),
  ('dis_sv_k1', 'org_demo_shelter_valley', NULL, NULL,   950000, strftime('%Y-%m', 'now'),              datetime('now', '-3 days'),   'Member outreach',   'vendor',   'marketing',      'usr_demo_grace', datetime('now')),
  ('dis_sv_k2', 'org_demo_shelter_valley', NULL, NULL,   900000, strftime('%Y-%m', 'now', '-1 month'),  datetime('now', '-33 days'),  'Member outreach',   'vendor',   'marketing',      'usr_demo_grace', datetime('now'));

-- ── Shelter Valley: claim detail on the existing cases ───────────────────────
-- Deborah Kane's case is the one that will light up: 35 days past a 17-day
-- commitment, never acknowledged, missing an itemized bill.

UPDATE needs
   SET procedure_code = '99223', diagnosis_code = 'I63.9', provider_npi = '1245319599',
       provider_name = 'Branson General Hospital', service_date = date('now', '-48 days'),
       billed_cents = 9420000, has_itemized_bill = 0,
       sla_due_at = datetime('now', '-27 days'), first_response_at = NULL,
       secondary_payer_status = 'pending'
 WHERE id = 'need_demo_kane_major';

UPDATE needs
   SET procedure_code = '70553', diagnosis_code = 'N20.0', provider_npi = '1234567893',
       provider_name = 'Branson Imaging', service_date = date('now', '-30 days'),
       billed_cents = 285000, has_itemized_bill = 1,
       sla_due_at = datetime('now', '-11 days'), first_response_at = datetime('now', '-25 days')
 WHERE id = 'need_demo_kane_followup';

UPDATE needs
   SET procedure_code = '33533', diagnosis_code = 'I25.10', provider_npi = '1245319599',
       provider_name = 'Springfield Cardiac Institute', service_date = date('now', '-11 days'),
       billed_cents = 4850000, has_itemized_bill = 1,
       sla_due_at = datetime('now', '+8 days'), first_response_at = datetime('now', '-8 days')
 WHERE id = 'need_demo_marcus_b' OR id = 'need_demo_marcus';

UPDATE needs
   SET procedure_code = '59400', diagnosis_code = 'O80', provider_npi = '1234567893',
       provider_name = 'Nixa Regional Birthing Center', service_date = date('now', '-46 days'),
       billed_cents = 1450000, has_itemized_bill = 1,
       sla_due_at = datetime('now', '-27 days'), first_response_at = datetime('now', '-43 days')
 WHERE id = 'need_demo_okonkwo_birth';

-- Travis Nolan's claim: denied without citing any guideline. This is the
-- finding a ministry most wants to catch before the member does.
UPDATE needs
   SET status = 'declined',
       procedure_code = '99284', diagnosis_code = 'R10.9', provider_npi = '1234567893',
       provider_name = 'Ozark Urgent Care', service_date = date('now', '-70 days'),
       billed_cents = 78000, has_itemized_bill = 0,
       sla_due_at = datetime('now', '-51 days'), first_response_at = datetime('now', '-62 days'),
       denial_reason_code = 'documentation_incomplete',
       denial_guideline_ref = NULL,
       denial_note = 'Receipt never provided.',
       last_status_change_at = datetime('now', '-26 days')
 WHERE id = 'need_demo_nolan';

-- And an appeal against it, already past the 30-day window.
INSERT INTO appeals (id, org_id, need_id, member_id, status, member_statement, submitted_at, due_at, created_at, updated_at)
VALUES (
  'app_sv_nolan', 'org_demo_shelter_valley', 'need_demo_nolan', 'mem_demo_travis_n', 'submitted',
  'I sent the receipt twice, once by email and once by post. Nobody has ever confirmed receiving it and now I am being told the claim is closed.',
  datetime('now', '-45 days'), datetime('now', '-15 days'),
  datetime('now', '-45 days'), datetime('now', '-45 days')
);

-- Repricing on the largest case: $94,200 billed against a $19,800 Medicare
-- allowable, repriced at 150%.
INSERT INTO claim_repricing (id, org_id, need_id, billed_cents, medicare_cents, multiplier_bps,
                             repriced_cents, savings_cents, method, status, notes, created_by, created_at, updated_at)
VALUES (
  'rp_sv_kane', 'org_demo_shelter_valley', 'need_demo_kane_major',
  9420000, 1980000, 15000, 2970000, 6450000, 'medicare_reference', 'proposed',
  'Air ambulance and ICU. Chargemaster is 476% of the Medicare allowable.',
  'usr_demo_grace', datetime('now', '-20 days'), datetime('now', '-20 days')
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Redemption Health Alliance — the cautionary case.
--
-- Every number below is shaped from the public record: a 16% share ratio
-- (Aliera), undisclosed related-party payments (Medical Cost Sharing), denials
-- citing nothing, and guidelines applied retroactively to existing members.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO organizations (id, name, slug, brand, kind, timezone, sla_days, appeal_sla_days,
                           target_share_ratio_bps, repricing_multiplier_bps, created_at, updated_at)
VALUES (
  'org_demo_redemption', 'Redemption Health Alliance', 'redemption',
  '{"wordmark":"Redemption","tagline":"Covered from day one."}',
  'demo', 'America/Chicago', 17, 30, 8000, 15000,
  datetime('now', '-800 days'), datetime('now')
);

-- Same demo password as Shelter Valley, so the two ministries can be signed
-- into and compared side by side. Seeing an 89% ratio and a 16% one in the
-- same interface is the whole argument for this layer.
INSERT INTO users (id, org_id, email, name, password_hash, password_salt, role, created_at, updated_at)
VALUES ('usr_demo_redemption', 'org_demo_redemption', 'admin@redemption.example', 'R. Moss',
        '027a3dfc91bc90dc3af3bd55c084b5f22cc9e4cdd770714860f4c879874de69b',
        '561d61725243ea00908c211ba78b4d71',
        'owner', datetime('now', '-800 days'), datetime('now'));

-- Guidelines rewritten this year and applied to members who joined long before.
INSERT INTO sharing_guidelines (id, org_id, version, effective_from, effective_to, published_url, provisions, created_at, updated_at)
VALUES (
  'gl_rd_v4', 'org_demo_redemption', 'v4.0', date('now', '-60 days'), NULL, NULL,
  json('[
    {"code":"preexisting.excluded","statement":"Pre-existing conditions are not shared.","supports_denial_codes":["preexisting","preexisting_within_waiting_period"]},
    {"code":"maternity.day_one","statement":"Maternity is shared from day one.","supports_denial_codes":[]}
  ]'),
  date('now', '-60 days'), date('now', '-60 days')
);

INSERT INTO members (id, org_id, first_name, last_name, email, date_of_birth, status, member_number,
                     joined_at, onboarding_complete, financial_stress, source, created_at, updated_at)
VALUES
  ('mem_rd_1', 'org_demo_redemption', 'Yvonne', 'Pryce',  'yvonne.pryce@example.org',  '1968-02-11', 'active', 'RD-100', datetime('now', '-700 days'), 1, 1, 'manual', datetime('now', '-700 days'), datetime('now')),
  ('mem_rd_2', 'org_demo_redemption', 'Curtis', 'Bramley','curtis.bramley@example.org','1979-09-05', 'active', 'RD-101', datetime('now', '-540 days'), 1, 0, 'manual', datetime('now', '-540 days'), datetime('now'));

-- Denials: one retroactive (guideline post-dates the member joining), one
-- citing "covered from day one" as the basis for denying maternity.
INSERT INTO needs (id, org_id, member_id, title, category, status, amount_requested_cents, billed_cents,
                   service_date, submitted_at, last_status_change_at, sla_due_at, first_response_at,
                   denial_reason_code, denial_guideline_ref, denial_note, has_itemized_bill,
                   procedure_code, provider_npi, provider_name, urgency, created_at, updated_at)
VALUES
  ('need_rd_1', 'org_demo_redemption', 'mem_rd_1', 'Stroke — emergency admission and rehabilitation',
   'emergency', 'declined', 12500000, 12500000, date('now', '-120 days'),
   datetime('now', '-118 days'), datetime('now', '-40 days'), datetime('now', '-101 days'),
   datetime('now', '-100 days'),
   'preexisting', 'preexisting.excluded', 'Undisclosed pre-existing condition.', 1,
   '99291', '1245319599', 'Metro General', 'critical',
   datetime('now', '-118 days'), datetime('now', '-40 days')),
  ('need_rd_2', 'org_demo_redemption', 'mem_rd_2', 'Delivery and postnatal care',
   'maternity', 'declined', 1800000, 1800000, date('now', '-90 days'),
   datetime('now', '-88 days'), datetime('now', '-30 days'), datetime('now', '-71 days'),
   NULL,
   'preexisting_within_waiting_period', 'maternity.day_one', 'Not eligible.', 1,
   '59400', '1234567893', 'Riverside Women''s Hospital', 'normal',
   datetime('now', '-88 days'), datetime('now', '-30 days')),
  ('need_rd_3', 'org_demo_redemption', 'mem_rd_1', 'Follow-up neurology',
   'chronic', 'in_review', 640000, 640000, date('now', '-40 days'),
   datetime('now', '-38 days'), datetime('now', '-38 days'), datetime('now', '-21 days'),
   NULL, NULL, NULL, NULL, 0,
   '99214', '1245319599', 'Metro Neurology', 'normal',
   datetime('now', '-38 days'), datetime('now', '-38 days'));

-- The ledger: money in every month, almost nothing shared, and millions to
-- entities connected to the owners.
INSERT INTO contributions (id, org_id, amount_cents, period, received_at, method, kind, created_at)
VALUES
  ('con_rd_1', 'org_demo_redemption', 62000000, strftime('%Y-%m', 'now'),              datetime('now', '-5 days'),   'ach', 'share', datetime('now')),
  ('con_rd_2', 'org_demo_redemption', 60500000, strftime('%Y-%m', 'now', '-1 month'),  datetime('now', '-35 days'),  'ach', 'share', datetime('now')),
  ('con_rd_3', 'org_demo_redemption', 59000000, strftime('%Y-%m', 'now', '-2 months'), datetime('now', '-65 days'),  'ach', 'share', datetime('now')),
  ('con_rd_4', 'org_demo_redemption', 57500000, strftime('%Y-%m', 'now', '-3 months'), datetime('now', '-95 days'),  'ach', 'share', datetime('now')),
  ('con_rd_5', 'org_demo_redemption', 56000000, strftime('%Y-%m', 'now', '-4 months'), datetime('now', '-125 days'), 'ach', 'share', datetime('now')),
  ('con_rd_6', 'org_demo_redemption', 54000000, strftime('%Y-%m', 'now', '-5 months'), datetime('now', '-155 days'), 'ach', 'share', datetime('now'));

INSERT INTO disbursements (id, org_id, amount_cents, period, paid_at, payee_name, payee_type, category, relationship, created_at)
VALUES
  -- ~16% shared. The Aliera number.
  ('dis_rd_s1', 'org_demo_redemption',  9900000, strftime('%Y-%m', 'now'),              datetime('now', '-4 days'),   'Various providers', 'provider', 'share', NULL, datetime('now')),
  ('dis_rd_s2', 'org_demo_redemption',  9700000, strftime('%Y-%m', 'now', '-1 month'),  datetime('now', '-34 days'),  'Various providers', 'provider', 'share', NULL, datetime('now')),
  ('dis_rd_s3', 'org_demo_redemption',  9400000, strftime('%Y-%m', 'now', '-2 months'), datetime('now', '-64 days'),  'Various providers', 'provider', 'share', NULL, datetime('now')),
  -- Six months ago the ratio was far healthier. The slide is the story.
  ('dis_rd_s4', 'org_demo_redemption', 32000000, strftime('%Y-%m', 'now', '-3 months'), datetime('now', '-94 days'),  'Various providers', 'provider', 'share', NULL, datetime('now')),
  ('dis_rd_s5', 'org_demo_redemption', 38000000, strftime('%Y-%m', 'now', '-4 months'), datetime('now', '-124 days'), 'Various providers', 'provider', 'share', NULL, datetime('now')),
  ('dis_rd_s6', 'org_demo_redemption', 41000000, strftime('%Y-%m', 'now', '-5 months'), datetime('now', '-154 days'), 'Various providers', 'provider', 'share', NULL, datetime('now')),
  -- Where the rest went.
  ('dis_rd_r1', 'org_demo_redemption', 24000000, strftime('%Y-%m', 'now'),              datetime('now', '-3 days'),   'Cardinal Advisory Group LLC', 'related_party', 'related_party', 'Owned by the founder''s family', datetime('now')),
  ('dis_rd_r2', 'org_demo_redemption', 23000000, strftime('%Y-%m', 'now', '-1 month'),  datetime('now', '-33 days'),  'Cardinal Advisory Group LLC', 'related_party', 'related_party', 'Owned by the founder''s family', datetime('now')),
  ('dis_rd_r3', 'org_demo_redemption', 22000000, strftime('%Y-%m', 'now', '-2 months'), datetime('now', '-63 days'),  'Cardinal Advisory Group LLC', 'related_party', 'related_party', 'Owned by the founder''s family', datetime('now')),
  ('dis_rd_a1', 'org_demo_redemption', 14000000, strftime('%Y-%m', 'now'),              datetime('now', '-3 days'),   'Administrative services',     'vendor',        'administrative', NULL, datetime('now')),
  ('dis_rd_a2', 'org_demo_redemption', 13500000, strftime('%Y-%m', 'now', '-1 month'),  datetime('now', '-33 days'),  'Administrative services',     'vendor',        'administrative', NULL, datetime('now')),
  ('dis_rd_m1', 'org_demo_redemption', 11000000, strftime('%Y-%m', 'now'),              datetime('now', '-3 days'),   'Member acquisition',          'vendor',        'marketing',      NULL, datetime('now')),
  ('dis_rd_m2', 'org_demo_redemption', 10500000, strftime('%Y-%m', 'now', '-1 month'),  datetime('now', '-33 days'),  'Member acquisition',          'vendor',        'marketing',      NULL, datetime('now'));

-- OR REPLACE so the whole file stays re-runnable.
INSERT OR REPLACE INTO audit_log (id, org_id, actor_id, actor_kind, action, subject_type, subject_id, meta, created_at)
VALUES ('aud_demo_seed_integrity', 'org_demo_shelter_valley', NULL, 'system', 'demo.integrity_seeded',
        'org', 'org_demo_shelter_valley', '{"comparison_org":"org_demo_redemption"}', datetime('now'));
