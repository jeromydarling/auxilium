-- 0014 — a way for a ministry to tell us something is wrong.
--
-- Until now there was none. A staff member who hit a bug had exactly two
-- options: work around it, or find an email address on the marketing site. Both
-- of those end the same way, which is that we never hear about it — and a
-- product whose entire argument is that things which go unnoticed are how
-- families get stranded cannot be a product with no way to report a fault.
--
-- Staff only, deliberately. Members reach their ministry, the way they already
-- do for everything else. A free-text channel from somebody in the middle of a
-- medical crisis, landing in our systems, is a records problem we would then
-- have to hold — and the person who can actually describe what the software did
-- is the staff member who was using it.
CREATE TABLE feedback (
  id            TEXT PRIMARY KEY,

  -- Tenant-scoped like everything else. Nullable is not an option here: every
  -- report comes from a signed-in staff account, so there is always an org.
  org_id        TEXT NOT NULL REFERENCES organizations(id),

  -- Who wrote it. Kept so we can reply, and so a follow-up question goes to the
  -- person who saw it rather than to whoever is on the ministry's main address.
  user_id       TEXT NOT NULL REFERENCES users(id),

  -- 'bug' or 'idea'. Two, not five.
  --
  -- A taxonomy with severity, component, and priority on the submit form is a
  -- taxonomy the reporter has to learn before they are allowed to tell us
  -- anything, and the result is that they do not bother. Severity is ours to
  -- judge from the description and the errors attached; asking a ministry to
  -- self-assess it produces either "critical" for everything or "low" for
  -- everything, and neither is information.
  kind          TEXT NOT NULL CHECK (kind IN ('bug', 'idea')),

  -- What they wrote. The only required field on the form.
  body          TEXT NOT NULL,

  -- Where they were when they wrote it, with record ids stripped by the client.
  -- '/app/members/:id' rather than '/app/members/mem_01H9'. Enough to reproduce,
  -- not enough to identify a family.
  route         TEXT,

  -- The build. Without it a report from a ministry that has not reloaded in a
  -- fortnight gets debugged against code they are not running.
  app_version   TEXT,

  -- The browser. Reported bugs cluster by it more than by anything else.
  user_agent    TEXT,

  -- The errors that preceded the report, as JSON, captured automatically.
  --
  -- This is the field that makes the difference between a report somebody can
  -- act on and one that reads "the members page did not work". A description in
  -- the reporter's own words plus the three failures that came before it is
  -- worth more than either alone: the errors say what broke, and the sentence
  -- says what they were trying to do, which is the part no stack trace records.
  recent_errors TEXT NOT NULL DEFAULT '[]',

  -- The last server request id they saw. Joins straight to the Worker log line
  -- and the Sentry event.
  request_id    TEXT,

  -- Ours, not theirs. A ministry sees that the report was sent and nothing else
  -- — a status column they can watch is a promise about response times that
  -- nobody has made.
  status        TEXT NOT NULL DEFAULT 'new'
                CHECK (status IN ('new', 'triaged', 'closed')),

  -- Whether the email actually went. Same rule the alerts table follows: the
  -- row is written before anything is sent, so a broken mail path produces an
  -- undelivered report rather than a lost one.
  emailed_at    TEXT,

  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- The operator view: newest first, across every ministry.
CREATE INDEX idx_feedback_triage ON feedback(status, created_at DESC);

-- The ministry's own, for the "you have told us this already" case.
CREATE INDEX idx_feedback_org ON feedback(org_id, created_at DESC);
