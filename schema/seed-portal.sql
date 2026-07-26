-- ─────────────────────────────────────────────────────────────────────────────
-- Demo member portal accounts.
--
-- The demo is the product's best explanation of itself, and until now it only
-- explained the staff half. A prospective ministry evaluating this needs to see
-- what its members will see — and, more to the point, so does anyone testing
-- the thing end to end.
--
-- The accounts are chosen for the situations they are in rather than to make a
-- tidy list. Each one exercises a different path a real member walks:
--
--   Deborah Kane   an active mix — one shared, one in review, one waiting on
--                  her. The ordinary case, and the one where the tracker has to
--                  read clearly.
--   Yvonne Pryce   a declined need at the failing ministry, on a pre-existing
--                  finding. This is the appeal-and-rights path, which is the
--                  most consequential journey in the product.
--   Marcus Bell    a large claim in review. The "is anyone actually looking at
--                  this" anxiety, with real money attached.
--   Travis Nolan   declined for incomplete documentation — the decline that is
--                  usually fixable, which is exactly why members should see it.
--   Ada Okonkwo    a need being paid. Somebody should be able to see the happy
--                  path too.
--   Chidi Okonkwo  invited but never activated. Without this, the invite
--                  acceptance flow has nothing to test against.
--
-- Password for every activated account: auxilium-member-2026
-- PBKDF2-SHA256, 100,000 iterations, matching workers/lib/auth.ts. Each account
-- carries its own salt — reusing one would let anyone who cracked a single
-- account see immediately that the rest share a password.
--
-- Re-runnable: every insert is guarded, so seeding twice does not fail and does
-- not reset a password somebody changed while testing.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO member_accounts (id, org_id, member_id, email, password_hash, password_salt,
                             status, last_seen_at, created_at, updated_at)
SELECT * FROM (
  SELECT 'macc_demo_deborah' AS id, 'org_demo_shelter_valley' AS org_id, 'mem_demo_deborah_k' AS member_id,
         'deborah.kane@example.org' AS email,
         '383076054cfbba607722d510f557e71b67f58032af83e561dada3a9e4acb7d97' AS password_hash,
         '5fe52e5d42b0b892bbf8f4793ff60afa' AS password_salt,
         'active' AS status, datetime('now', '-2 days') AS last_seen_at,
         datetime('now', '-200 days') AS created_at, datetime('now') AS updated_at
  UNION ALL SELECT 'macc_demo_marcus', 'org_demo_shelter_valley', 'mem_demo_marcus_b',
         'marcus.bell@example.org',
         'a380fc9c1c801aff489d276381223cf18ee8767e82c75d8af850291cd382d39b',
         '969af2073439d8122d06ece12f544c1b',
         'active', datetime('now', '-1 days'), datetime('now', '-180 days'), datetime('now')
  UNION ALL SELECT 'macc_demo_travis', 'org_demo_shelter_valley', 'mem_demo_travis_n',
         'travis.nolan@example.org',
         '141757a3f187f673ce25b145d3a3a83e9102622980d163b463fcc021402a6467',
         'bd42fd8cd14974fd4a6a6f5da765f495',
         'active', datetime('now', '-9 days'), datetime('now', '-90 days'), datetime('now')
  UNION ALL SELECT 'macc_demo_ada', 'org_demo_shelter_valley', 'mem_demo_ada_o',
         'ada.okonkwo@example.org',
         'bdb797dfbeced2522baa70fe9f341894c818535c001ffe3ced4637c3876a7f7f',
         '9b7a4fb8a443a79482797b73958598c2',
         'active', datetime('now', '-4 days'), datetime('now', '-150 days'), datetime('now')
  -- Invited, never activated. No password hash at all, which is what the login
  -- route relies on to refuse it without revealing that the account exists.
  UNION ALL SELECT 'macc_demo_chidi', 'org_demo_shelter_valley', 'mem_demo_chidi_o',
         'chidi.okonkwo@example.org', NULL, NULL,
         'invited', NULL, datetime('now', '-3 days'), datetime('now')
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM member_accounts ma WHERE ma.id = seed.id)
  AND EXISTS (SELECT 1 FROM members m WHERE m.id = seed.member_id AND m.deleted_at IS NULL);

-- Yvonne is at the deliberately failing ministry, so her org and member ids come
-- from the integrity seed rather than the main one. Looked up rather than
-- hard-coded so this file does not break if that seed is renumbered.
INSERT INTO member_accounts (id, org_id, member_id, email, password_hash, password_salt,
                             status, last_seen_at, created_at, updated_at)
SELECT 'macc_demo_yvonne', m.org_id, m.id, 'yvonne.pryce@example.org',
       'f810387ca582c2d3ff7aeb5b17a5470958f85bdca73be8107611c30ff21565ec',
       '84566ff5bce21c1727e600fcc1636cbd',
       'active', datetime('now', '-6 days'), datetime('now', '-260 days'), datetime('now')
  FROM members m
 WHERE m.email = 'yvonne.pryce@example.org' AND m.deleted_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM member_accounts ma WHERE ma.id = 'macc_demo_yvonne')
 LIMIT 1;

-- A live invitation for Chidi, so the accept-invite screen has something real
-- to redeem. The token is the demo one below; only its SHA-256 is stored, the
-- same as in production — the seed does not get a weaker rule than the product.
--
--   token: auxiliumdemoinvitechidiokonkwo0000000000
--   link:  /app/portal/accept/auxiliumdemoinvitechidiokonkwo0000000000
INSERT INTO member_invites (id, org_id, member_account_id, token_hash, expires_at, created_by, created_at)
SELECT 'minv_demo_chidi', 'org_demo_shelter_valley', 'macc_demo_chidi',
       'ae15cc23d1ccc87b9080429fde57c1264ca4f5e929f717a0e1482b5f74718d7e',
       datetime('now', '+14 days'), 'usr_demo_grace', datetime('now', '-3 days')
 WHERE EXISTS (SELECT 1 FROM member_accounts WHERE id = 'macc_demo_chidi')
   AND NOT EXISTS (SELECT 1 FROM member_invites WHERE id = 'minv_demo_chidi');
