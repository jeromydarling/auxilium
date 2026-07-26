-- ─────────────────────────────────────────────────────────────────────────────
-- Auxilium demo seed
--
-- Five deliberate personas, one per thing NRI is supposed to notice:
--
--   1. Grace Whitfield  — healthy. Everything clear. The control case.
--   2. Marcus Bell      — high Cura. Hospitalized, bereaved, follow-up overdue.
--   3. Deborah Kane     — high Onus. A $94k case, stalled 35 days, unassigned.
--   4. The Okonkwos     — high Familia. Eight people, six dependents, a
--                         caregiver, a newborn, and a household in flux.
--   5. Travis Nolan     — high Fides. Lapsed, never onboarded, four unanswered
--                         calls, no response in eight months.
--
-- Every timestamp is relative (datetime('now', '-N days')) so the demo scores
-- the same way whenever it is seeded. Hardcoded dates would drift out of the
-- rules' time windows within weeks and quietly stop demonstrating anything.
--
-- Safe to re-run: it deletes the demo org's rows first and leaves every other
-- organization untouched.
--
-- Sign in with the "Explore the demo ministry" button, or:
--   grace@sheltervalley.example / auxilium-demo-2026
-- ─────────────────────────────────────────────────────────────────────────────


-- ── Organization and staff ───────────────────────────────────────────────────

INSERT INTO organizations (id, name, slug, brand, kind, timezone, created_at, updated_at)
VALUES (
  'org_demo_shelter_valley',
  'Shelter Valley Health Share',
  'shelter-valley',
  '{"wordmark":"Shelter Valley","supportEmail":"care@sheltervalley.example","tagline":"Carrying one another''s burdens."}',
  'demo',
  'America/Chicago',
  datetime('now', '-420 days'),
  datetime('now')
);

-- Password is 'auxilium-demo-2026' (PBKDF2-SHA256, 100k iterations).
INSERT INTO users (id, org_id, email, name, password_hash, password_salt, role, last_seen_at, created_at, updated_at)
VALUES
  ('usr_demo_grace', 'org_demo_shelter_valley', 'grace@sheltervalley.example', 'Grace Okafor',
   '027a3dfc91bc90dc3af3bd55c084b5f22cc9e4cdd770714860f4c879874de69b',
   '561d61725243ea00908c211ba78b4d71',
   'owner', datetime('now', '-1 days'), datetime('now', '-420 days'), datetime('now')),
  ('usr_demo_james', 'org_demo_shelter_valley', 'james@sheltervalley.example', 'James Ruiz',
   NULL, NULL, 'care', datetime('now', '-3 days'), datetime('now', '-300 days'), datetime('now'));

-- ── Households ───────────────────────────────────────────────────────────────
-- member_count and dependent_count are denormalized and recomputed from
-- household_members at the end of this file, so they cannot drift from reality.

INSERT INTO households (id, org_id, name, address_line1, city, state, postal_code, share_amount_cents, created_at, updated_at)
VALUES
  ('hh_demo_whitfield', 'org_demo_shelter_valley', 'Whitfield Household',
   '412 Cedar Lane', 'Springfield', 'MO', '65804', 44500, datetime('now', '-380 days'), datetime('now')),
  ('hh_demo_bell', 'org_demo_shelter_valley', 'Bell Household',
   '77 Grantham Road', 'Springfield', 'MO', '65807', 51000, datetime('now', '-350 days'), datetime('now')),
  ('hh_demo_kane', 'org_demo_shelter_valley', 'Kane Household',
   '9 Milton Court', 'Branson', 'MO', '65616', 39500, datetime('now', '-290 days'), datetime('now')),
  ('hh_demo_okonkwo', 'org_demo_shelter_valley', 'Okonkwo Household',
   '1580 Harvest Way', 'Nixa', 'MO', '65714', 82500, datetime('now', '-260 days'), datetime('now')),
  ('hh_demo_nolan', 'org_demo_shelter_valley', 'Nolan Household',
   '3 Pine Hollow', 'Ozark', 'MO', '65721', 33000, datetime('now', '-240 days'), datetime('now'));

-- ── PERSONA 1: healthy. Nothing should light up. ─────────────────────────────

INSERT INTO members (id, org_id, household_id, first_name, last_name, email, phone, date_of_birth,
                     status, member_number, joined_at, city, state, postal_code,
                     dedupe_email, dedupe_phone, dedupe_name_dob,
                     last_contact_at, last_response_at, onboarding_complete, financial_stress,
                     source, created_at, updated_at)
VALUES
  ('mem_demo_grace_w', 'org_demo_shelter_valley', 'hh_demo_whitfield', 'Grace', 'Whitfield',
   'grace.whitfield@example.org', '(417) 555-0142', '1981-06-14', 'active', 'SV-1001',
   datetime('now', '-380 days'), 'Springfield', 'MO', '65804',
   'grace.whitfield@example.org', '4175550142', 'whitfield|grace|1981-06-14',
   datetime('now', '-12 days'), datetime('now', '-12 days'), 1, 0, 'manual',
   datetime('now', '-380 days'), datetime('now')),
  ('mem_demo_paul_w', 'org_demo_shelter_valley', 'hh_demo_whitfield', 'Paul', 'Whitfield',
   'paul.whitfield@example.org', '(417) 555-0143', '1979-02-03', 'active', 'SV-1002',
   datetime('now', '-380 days'), 'Springfield', 'MO', '65804',
   'paul.whitfield@example.org', '4175550143', 'whitfield|paul|1979-02-03',
   datetime('now', '-12 days'), datetime('now', '-12 days'), 1, 0, 'manual',
   datetime('now', '-380 days'), datetime('now'));

-- ── PERSONA 2: high Cura. Hospitalization + bereavement + overdue follow-up. ─

INSERT INTO members (id, org_id, household_id, first_name, last_name, email, phone, date_of_birth,
                     status, member_number, joined_at, city, state, postal_code,
                     dedupe_email, dedupe_phone, dedupe_name_dob,
                     last_contact_at, last_response_at, onboarding_complete, financial_stress,
                     source, created_at, updated_at)
VALUES
  ('mem_demo_marcus_b', 'org_demo_shelter_valley', 'hh_demo_bell', 'Marcus', 'Bell',
   'marcus.bell@example.org', '(417) 555-0188', '1966-11-22', 'active', 'SV-1044',
   datetime('now', '-350 days'), 'Springfield', 'MO', '65807',
   'marcus.bell@example.org', '4175550188', 'bell|marcus|1966-11-22',
   datetime('now', '-9 days'), datetime('now', '-9 days'), 1, 0, 'manual',
   datetime('now', '-350 days'), datetime('now')),
  ('mem_demo_ella_b', 'org_demo_shelter_valley', 'hh_demo_bell', 'Ella', 'Bell',
   'ella.bell@example.org', '(417) 555-0189', '1968-04-30', 'active', 'SV-1045',
   datetime('now', '-350 days'), 'Springfield', 'MO', '65807',
   'ella.bell@example.org', '4175550189', 'bell|ella|1968-04-30',
   datetime('now', '-9 days'), datetime('now', '-9 days'), 1, 0, 'manual',
   datetime('now', '-350 days'), datetime('now'));

INSERT INTO prayer_requests (id, org_id, member_id, household_id, title, body, category, status,
                             visibility, is_urgent, prayer_count, assigned_to,
                             followup_due_at, last_followup_at, created_at, updated_at)
VALUES
  ('pray_demo_marcus_hosp', 'org_demo_shelter_valley', 'mem_demo_marcus_b', 'hh_demo_bell',
   'Marcus admitted for cardiac surgery',
   'Admitted Tuesday. Surgery scheduled for Thursday morning. Ella is at the hospital with him.',
   'hospitalization', 'open', 'staff', 1, 34, 'usr_demo_james',
   datetime('now', '-4 days'), datetime('now', '-11 days'),
   datetime('now', '-11 days'), datetime('now', '-4 days')),
  ('pray_demo_marcus_ber', 'org_demo_shelter_valley', 'mem_demo_marcus_b', 'hh_demo_bell',
   'Ella''s mother passed away',
   'Funeral was last week. The family is carrying a great deal at once right now.',
   'bereavement', 'praying', 'staff', 0, 21, NULL,
   NULL, NULL, datetime('now', '-24 days'), datetime('now', '-20 days'));

INSERT INTO needs (id, org_id, member_id, household_id, title, description, category, status,
                   amount_requested_cents, amount_approved_cents, amount_shared_cents,
                   incident_date, submitted_at, last_status_change_at, assigned_to, urgency,
                   created_at, updated_at)
VALUES
  ('need_demo_marcus', 'org_demo_shelter_valley', 'mem_demo_marcus_b', 'hh_demo_bell',
   'Cardiac surgery and hospital stay',
   'Triple bypass with a four-night stay. Itemized bill still pending from the hospital.',
   'surgical', 'in_review', 4850000, 0, 0,
   date('now', '-11 days'), datetime('now', '-9 days'), datetime('now', '-6 days'),
   'usr_demo_james', 'high', datetime('now', '-9 days'), datetime('now', '-6 days'));

-- ── PERSONA 3: high Onus. Large, stalled, unassigned, critical. ──────────────

INSERT INTO members (id, org_id, household_id, first_name, last_name, email, phone, date_of_birth,
                     status, member_number, joined_at, city, state, postal_code,
                     dedupe_email, dedupe_phone, dedupe_name_dob,
                     last_contact_at, last_response_at, onboarding_complete, financial_stress,
                     source, created_at, updated_at)
VALUES
  ('mem_demo_deborah_k', 'org_demo_shelter_valley', 'hh_demo_kane', 'Deborah', 'Kane',
   'deborah.kane@example.org', '(417) 555-0231', '1974-09-08', 'active', 'SV-1120',
   datetime('now', '-290 days'), 'Branson', 'MO', '65616',
   'deborah.kane@example.org', '4175550231', 'kane|deborah|1974-09-08',
   datetime('now', '-31 days'), datetime('now', '-31 days'), 1, 1, 'manual',
   datetime('now', '-290 days'), datetime('now'));

INSERT INTO needs (id, org_id, member_id, household_id, title, description, category, status,
                   amount_requested_cents, amount_approved_cents, amount_shared_cents,
                   incident_date, submitted_at, last_status_change_at, assigned_to, urgency,
                   created_at, updated_at)
VALUES
  -- $94,200. Nobody owns it. Nothing has moved in 35 days.
  ('need_demo_kane_major', 'org_demo_shelter_valley', 'mem_demo_deborah_k', 'hh_demo_kane',
   'Emergency admission and extended ICU stay',
   'Air ambulance, eleven days in ICU, two procedures. The largest single case this year.',
   'emergency', 'in_review', 9420000, 0, 0,
   date('now', '-48 days'), datetime('now', '-44 days'), datetime('now', '-35 days'),
   NULL, 'critical', datetime('now', '-44 days'), datetime('now', '-35 days')),
  ('need_demo_kane_followup', 'org_demo_shelter_valley', 'mem_demo_deborah_k', 'hh_demo_kane',
   'Follow-up imaging',
   'Ordered at discharge.',
   'medical', 'needs_info', 285000, 0, 0,
   date('now', '-30 days'), datetime('now', '-28 days'), datetime('now', '-22 days'),
   NULL, 'normal', datetime('now', '-28 days'), datetime('now', '-22 days')),
  ('need_demo_kane_older', 'org_demo_shelter_valley', 'mem_demo_deborah_k', 'hh_demo_kane',
   'Chronic care visits, first quarter',
   'Recurring specialist visits.',
   'chronic', 'completed', 640000, 640000, 640000,
   date('now', '-200 days'), datetime('now', '-198 days'), datetime('now', '-150 days'),
   'usr_demo_grace', 'normal', datetime('now', '-198 days'), datetime('now', '-150 days'));

INSERT INTO need_updates (id, org_id, need_id, author_id, kind, body, meta, created_at)
VALUES
  ('nupd_demo_kane_1', 'org_demo_shelter_valley', 'need_demo_kane_major', 'usr_demo_grace',
   'status_change', 'Case opened.', '{"to":"submitted"}', datetime('now', '-44 days')),
  ('nupd_demo_kane_2', 'org_demo_shelter_valley', 'need_demo_kane_major', 'usr_demo_grace',
   'note', 'Waiting on itemized billing from the hospital before review can continue.', '{}',
   datetime('now', '-35 days')),
  ('nupd_demo_kane_3', 'org_demo_shelter_valley', 'need_demo_kane_followup', 'usr_demo_james',
   'outreach', 'Called about the missing imaging order. Left a voicemail.', '{}',
   datetime('now', '-22 days'));

-- ── PERSONA 4: complex Familia. Eight people, a caregiver, and a newborn. ────

INSERT INTO members (id, org_id, household_id, first_name, last_name, email, phone, date_of_birth,
                     status, member_number, joined_at, city, state, postal_code,
                     dedupe_email, dedupe_phone, dedupe_name_dob,
                     last_contact_at, last_response_at, onboarding_complete, financial_stress,
                     source, created_at, updated_at)
VALUES
  ('mem_demo_chidi_o', 'org_demo_shelter_valley', 'hh_demo_okonkwo', 'Chidi', 'Okonkwo',
   'chidi.okonkwo@example.org', '(417) 555-0310', '1983-03-19', 'active', 'SV-1201',
   datetime('now', '-260 days'), 'Nixa', 'MO', '65714',
   'chidi.okonkwo@example.org', '4175550310', 'okonkwo|chidi|1983-03-19',
   datetime('now', '-18 days'), datetime('now', '-18 days'), 1, 0, 'manual',
   datetime('now', '-260 days'), datetime('now')),
  ('mem_demo_ada_o', 'org_demo_shelter_valley', 'hh_demo_okonkwo', 'Ada', 'Okonkwo',
   'ada.okonkwo@example.org', '(417) 555-0311', '1985-07-27', 'active', 'SV-1202',
   datetime('now', '-260 days'), 'Nixa', 'MO', '65714',
   'ada.okonkwo@example.org', '4175550311', 'okonkwo|ada|1985-07-27',
   datetime('now', '-18 days'), datetime('now', '-18 days'), 1, 0, 'manual',
   datetime('now', '-260 days'), datetime('now')),
  ('mem_demo_ngozi_o', 'org_demo_shelter_valley', 'hh_demo_okonkwo', 'Ngozi', 'Okonkwo',
   NULL, NULL, '1948-01-12', 'active', 'SV-1203',
   datetime('now', '-260 days'), 'Nixa', 'MO', '65714',
   NULL, NULL, 'okonkwo|ngozi|1948-01-12',
   datetime('now', '-18 days'), NULL, 1, 0, 'manual',
   datetime('now', '-260 days'), datetime('now')),
  ('mem_demo_emeka_o', 'org_demo_shelter_valley', 'hh_demo_okonkwo', 'Emeka', 'Okonkwo',
   NULL, NULL, '2009-05-04', 'active', 'SV-1204',
   datetime('now', '-260 days'), 'Nixa', 'MO', '65714', NULL, NULL, 'okonkwo|emeka|2009-05-04',
   datetime('now', '-18 days'), NULL, 1, 0, 'manual', datetime('now', '-260 days'), datetime('now')),
  ('mem_demo_amara_o', 'org_demo_shelter_valley', 'hh_demo_okonkwo', 'Amara', 'Okonkwo',
   NULL, NULL, '2012-08-16', 'active', 'SV-1205',
   datetime('now', '-260 days'), 'Nixa', 'MO', '65714', NULL, NULL, 'okonkwo|amara|2012-08-16',
   datetime('now', '-18 days'), NULL, 1, 0, 'manual', datetime('now', '-260 days'), datetime('now')),
  ('mem_demo_obi_o', 'org_demo_shelter_valley', 'hh_demo_okonkwo', 'Obi', 'Okonkwo',
   NULL, NULL, '2015-02-09', 'active', 'SV-1206',
   datetime('now', '-260 days'), 'Nixa', 'MO', '65714', NULL, NULL, 'okonkwo|obi|2015-02-09',
   datetime('now', '-18 days'), NULL, 1, 0, 'manual', datetime('now', '-260 days'), datetime('now')),
  ('mem_demo_ifeoma_o', 'org_demo_shelter_valley', 'hh_demo_okonkwo', 'Ifeoma', 'Okonkwo',
   NULL, NULL, '2019-10-21', 'active', 'SV-1207',
   datetime('now', '-260 days'), 'Nixa', 'MO', '65714', NULL, NULL, 'okonkwo|ifeoma|2019-10-21',
   datetime('now', '-18 days'), NULL, 1, 0, 'manual', datetime('now', '-260 days'), datetime('now')),
  -- The newborn: added 40 days ago, which is what makes the household "in flux".
  ('mem_demo_baby_o', 'org_demo_shelter_valley', 'hh_demo_okonkwo', 'Chinelo', 'Okonkwo',
   NULL, NULL, date('now', '-46 days'), 'pending', 'SV-1208',
   datetime('now', '-40 days'), 'Nixa', 'MO', '65714', NULL, NULL, NULL,
   datetime('now', '-18 days'), NULL, 0, 0, 'manual',
   datetime('now', '-40 days'), datetime('now'));

INSERT INTO needs (id, org_id, member_id, household_id, title, description, category, status,
                   amount_requested_cents, amount_approved_cents, amount_shared_cents,
                   incident_date, submitted_at, last_status_change_at, assigned_to, urgency,
                   created_at, updated_at)
VALUES
  ('need_demo_okonkwo_birth', 'org_demo_shelter_valley', 'mem_demo_ada_o', 'hh_demo_okonkwo',
   'Delivery and postnatal care',
   'Chinelo arrived healthy. Standard delivery, two-night stay.',
   'maternity', 'sharing', 1450000, 1450000, 720000,
   date('now', '-46 days'), datetime('now', '-44 days'), datetime('now', '-8 days'),
   'usr_demo_grace', 'normal', datetime('now', '-44 days'), datetime('now', '-8 days'));

INSERT INTO prayer_requests (id, org_id, member_id, household_id, title, body, category, status,
                             visibility, is_urgent, prayer_count, assigned_to,
                             followup_due_at, last_followup_at, created_at, updated_at)
VALUES
  ('pray_demo_okonkwo_birth', 'org_demo_shelter_valley', 'mem_demo_ada_o', 'hh_demo_okonkwo',
   'Thanksgiving for Chinelo''s safe arrival',
   'Ada and baby both doing well. Ngozi has moved in to help with the older children.',
   'birth', 'answered', 'members', 0, 58, 'usr_demo_grace',
   NULL, datetime('now', '-30 days'), datetime('now', '-45 days'), datetime('now', '-30 days'));

-- ── PERSONA 5: high Fides. Lapsed, never onboarded, silent for months. ───────

INSERT INTO members (id, org_id, household_id, first_name, last_name, email, phone, date_of_birth,
                     status, member_number, joined_at, city, state, postal_code,
                     dedupe_email, dedupe_phone, dedupe_name_dob,
                     last_contact_at, last_response_at, onboarding_complete, financial_stress,
                     source, created_at, updated_at)
VALUES
  ('mem_demo_travis_n', 'org_demo_shelter_valley', 'hh_demo_nolan', 'Travis', 'Nolan',
   'travis.nolan@example.org', '(417) 555-0402', '1990-12-01', 'lapsed', 'SV-1310',
   datetime('now', '-240 days'), 'Ozark', 'MO', '65721',
   'travis.nolan@example.org', '4175550402', 'nolan|travis|1990-12-01',
   datetime('now', '-26 days'), datetime('now', '-235 days'), 0, 0, 'import',
   datetime('now', '-240 days'), datetime('now'));

INSERT INTO needs (id, org_id, member_id, household_id, title, description, category, status,
                   amount_requested_cents, amount_approved_cents, amount_shared_cents,
                   incident_date, submitted_at, last_status_change_at, assigned_to, urgency,
                   created_at, updated_at)
VALUES
  ('need_demo_nolan', 'org_demo_shelter_valley', 'mem_demo_travis_n', 'hh_demo_nolan',
   'Urgent care visit',
   'Submitted without documentation. We have asked twice and heard nothing back.',
   'medical', 'needs_info', 78000, 0, 0,
   date('now', '-70 days'), datetime('now', '-68 days'), datetime('now', '-60 days'),
   'usr_demo_james', 'low', datetime('now', '-68 days'), datetime('now', '-60 days'));

-- Four outreach attempts, all after his last response. This is what the Fides
-- "no response" rule counts, and it is why he scores where he does.
INSERT INTO need_updates (id, org_id, need_id, author_id, kind, body, meta, created_at)
VALUES
  ('nupd_demo_nolan_1', 'org_demo_shelter_valley', 'need_demo_nolan', 'usr_demo_james',
   'outreach', 'Called about the missing receipt. No answer.', '{}', datetime('now', '-62 days')),
  ('nupd_demo_nolan_2', 'org_demo_shelter_valley', 'need_demo_nolan', 'usr_demo_james',
   'outreach', 'Emailed the documentation checklist.', '{}', datetime('now', '-50 days')),
  ('nupd_demo_nolan_3', 'org_demo_shelter_valley', 'need_demo_nolan', 'usr_demo_james',
   'outreach', 'Second call. Voicemail again.', '{}', datetime('now', '-38 days')),
  ('nupd_demo_nolan_4', 'org_demo_shelter_valley', 'need_demo_nolan', 'usr_demo_grace',
   'outreach', 'Renewal notice sent. Still nothing back.', '{}', datetime('now', '-26 days'));

-- ── A member with no household — an import artifact Familia should flag ──────

INSERT INTO members (id, org_id, household_id, first_name, last_name, email, phone, date_of_birth,
                     status, member_number, joined_at, dedupe_email, dedupe_phone, dedupe_name_dob,
                     last_contact_at, last_response_at, onboarding_complete, financial_stress,
                     source, created_at, updated_at)
VALUES
  ('mem_demo_orphan', 'org_demo_shelter_valley', NULL, 'Rosa', 'Delgado',
   'rosa.delgado@example.org', NULL, '1988-04-17', 'pending', 'SV-1402',
   datetime('now', '-5 days'), 'rosa.delgado@example.org', NULL, 'delgado|rosa|1988-04-17',
   NULL, NULL, 0, 0, 'import', datetime('now', '-5 days'), datetime('now'));

-- ── Household membership ─────────────────────────────────────────────────────

INSERT INTO household_members (id, org_id, household_id, member_id, relationship, is_caregiver, is_dependent, joined_at, created_at)
VALUES
  ('hm_demo_1',  'org_demo_shelter_valley', 'hh_demo_whitfield', 'mem_demo_grace_w',   'primary',   0, 0, datetime('now', '-380 days'), datetime('now', '-380 days')),
  ('hm_demo_2',  'org_demo_shelter_valley', 'hh_demo_whitfield', 'mem_demo_paul_w',    'spouse',    0, 0, datetime('now', '-380 days'), datetime('now', '-380 days')),

  ('hm_demo_3',  'org_demo_shelter_valley', 'hh_demo_bell',      'mem_demo_marcus_b',  'primary',   0, 0, datetime('now', '-350 days'), datetime('now', '-350 days')),
  -- Ella is caring for Marcus through recovery: a real Familia input.
  ('hm_demo_4',  'org_demo_shelter_valley', 'hh_demo_bell',      'mem_demo_ella_b',    'spouse',    1, 0, datetime('now', '-350 days'), datetime('now', '-350 days')),

  ('hm_demo_5',  'org_demo_shelter_valley', 'hh_demo_kane',      'mem_demo_deborah_k', 'primary',   0, 0, datetime('now', '-290 days'), datetime('now', '-290 days')),

  ('hm_demo_6',  'org_demo_shelter_valley', 'hh_demo_okonkwo',   'mem_demo_chidi_o',   'primary',   0, 0, datetime('now', '-260 days'), datetime('now', '-260 days')),
  ('hm_demo_7',  'org_demo_shelter_valley', 'hh_demo_okonkwo',   'mem_demo_ada_o',     'spouse',    0, 0, datetime('now', '-260 days'), datetime('now', '-260 days')),
  -- Grandmother moved in to help — caregiver, not dependent.
  ('hm_demo_8',  'org_demo_shelter_valley', 'hh_demo_okonkwo',   'mem_demo_ngozi_o',   'other',     1, 0, datetime('now', '-60 days'),  datetime('now', '-60 days')),
  ('hm_demo_9',  'org_demo_shelter_valley', 'hh_demo_okonkwo',   'mem_demo_emeka_o',   'dependent', 0, 1, datetime('now', '-260 days'), datetime('now', '-260 days')),
  ('hm_demo_10', 'org_demo_shelter_valley', 'hh_demo_okonkwo',   'mem_demo_amara_o',   'dependent', 0, 1, datetime('now', '-260 days'), datetime('now', '-260 days')),
  ('hm_demo_11', 'org_demo_shelter_valley', 'hh_demo_okonkwo',   'mem_demo_obi_o',     'dependent', 0, 1, datetime('now', '-260 days'), datetime('now', '-260 days')),
  ('hm_demo_12', 'org_demo_shelter_valley', 'hh_demo_okonkwo',   'mem_demo_ifeoma_o',  'dependent', 0, 1, datetime('now', '-260 days'), datetime('now', '-260 days')),
  -- Two membership changes inside 90 days: the newborn and the grandmother.
  ('hm_demo_13', 'org_demo_shelter_valley', 'hh_demo_okonkwo',   'mem_demo_baby_o',    'dependent', 0, 1, datetime('now', '-40 days'),  datetime('now', '-40 days')),

  ('hm_demo_14', 'org_demo_shelter_valley', 'hh_demo_nolan',     'mem_demo_travis_n',  'primary',   0, 0, datetime('now', '-240 days'), datetime('now', '-240 days'));

-- ── A finished import, so the history page has something in it ───────────────

INSERT INTO imports (id, org_id, created_by, filename, r2_key, file_size, format, status,
                     detected_headers, total_rows, valid_rows, invalid_rows, duplicate_rows,
                     created_count, updated_count, skipped_count, committed_at, created_at, updated_at)
VALUES
  ('imp_demo_initial', 'org_demo_shelter_valley', 'usr_demo_grace', 'shelter-valley-roster-2025.csv',
   'imports/org_demo_shelter_valley/imp_demo_initial/source.csv', 4820, 'csv', 'completed',
   '["Mbr #","First Name","LAST NAME","Primary Email Address","Home Phone","DOB","Household Name","Relation","Monthly Share","Status"]',
   14, 13, 1, 0, 12, 1, 0,
   datetime('now', '-240 days'), datetime('now', '-240 days'), datetime('now', '-240 days'));

-- ── A portal page for the white-label CMS shell ──────────────────────────────

INSERT INTO cms_pages (id, org_id, slug, title, blocks, status, published_at, created_at, updated_at)
VALUES
  ('page_demo_welcome', 'org_demo_shelter_valley', 'welcome', 'Welcome to Shelter Valley',
   '[{"type":"hero","heading":"Carrying one another''s burdens","subheading":"A community of families sharing medical costs together.","ctaLabel":"See how sharing works","ctaHref":"/how-it-works"},{"type":"richText","body":"Shelter Valley is not insurance. We are a community of households who commit to sharing one another''s medical costs directly."},{"type":"faq","items":[{"question":"What happens when I have a medical need?","answer":"Submit it through your member portal. A named member of our care team reviews it and tells you the timeline within a week."},{"question":"How is my monthly share calculated?","answer":"By household size and the sharing tier you chose when you joined."}]}]',
   'published', datetime('now', '-120 days'), datetime('now', '-130 days'), datetime('now', '-120 days'));

-- ── Recompute the denormalized household counts from the actual links ────────
-- Familia scoring reads these columns, so they must never disagree with
-- household_members. Deriving them here rather than hardcoding means editing
-- the membership block above cannot silently produce wrong signals.

UPDATE households
   SET member_count = (SELECT COUNT(*) FROM household_members hm WHERE hm.household_id = households.id),
       dependent_count = (SELECT COUNT(*) FROM household_members hm WHERE hm.household_id = households.id AND hm.is_dependent = 1)
 WHERE org_id = 'org_demo_shelter_valley';

INSERT INTO audit_log (id, org_id, actor_id, actor_kind, action, subject_type, subject_id, meta, created_at)
VALUES ('aud_demo_seed', 'org_demo_shelter_valley', NULL, 'system', 'demo.seeded',
        'org', 'org_demo_shelter_valley', '{"personas":5}', datetime('now'));
