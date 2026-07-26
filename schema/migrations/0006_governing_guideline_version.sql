-- Which guideline version governs a need — and why it has to be declared.
--
-- The integrity engine used to assume one answer: the version in force when
-- the member enrolled. That assumption is wrong as a description of the
-- category. Ministries publish at least four different rules, and all four are
-- in force today in ministries' own guidelines documents:
--
--   member_join     the version in effect when the member enrolled
--   date_of_service the version in effect when the care was delivered
--   date_submitted  the version in effect when the request was filed
--   date_received   the version in effect when the ministry logged the bills
--
-- Some ministries layer a grandfathering ratchet on top of date-of-service so
-- that anything shareable when a need began stays shareable; at least one
-- states the opposite, applying amendments to needs already open.
--
-- Scoring "a newer guideline was applied" as a per-se finding would therefore
-- raise a serious accusation against a time-of-service ministry every single
-- time it followed its own published policy correctly. A rule that fires on
-- correct behaviour is worse than no rule at all: it teaches staff that the
-- integrity report is noise, and the findings that are real go with it.
--
-- So the ministry declares its rule, and the finding is scored against the
-- date that rule makes controlling. Undeclared falls back to member_join —
-- the strictest of the four, and the right default, because a ministry that
-- has not said which version binds gets measured against the reading most
-- protective of the member.

ALTER TABLE organizations ADD COLUMN governing_version_rule TEXT NOT NULL
  DEFAULT 'member_join';

-- When the ministry logged the bills, for orgs whose declared rule is
-- date_received. Distinct from submitted_at, which is when the member filed:
-- the gap between the two is itself worth being able to see.
ALTER TABLE needs ADD COLUMN bills_received_at TEXT;
