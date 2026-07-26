-- ─────────────────────────────────────────────────────────────────────────────
-- Ministry-authored knowledge base articles.
--
-- The platform library lives in code (src/lib/knowledge), because it is
-- versioned, reviewable in a diff, and tested — a knowledge base that drifts
-- from the product is worse than none, since somebody acts on it.
--
-- These tables are for what only the ministry can write: its own waiting
-- periods, its own pre-notification requirements, who to ring on a Saturday.
-- Ministry articles are marked as theirs wherever they appear, so a member can
-- tell "this is how sharing works generally" from "this is what our ministry
-- does", which are very different kinds of claim.
--
-- A ministry article with the same slug as a platform one overrides it. That is
-- the only sane resolution: if a ministry has written its own answer about its
-- own waiting period, that answer wins.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE kb_articles (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES organizations(id),
  slug         TEXT NOT NULL,
  audience     TEXT NOT NULL DEFAULT 'both' CHECK (audience IN ('staff', 'member', 'both')),
  category     TEXT NOT NULL,
  title        TEXT NOT NULL,
  summary      TEXT NOT NULL,
  -- Sections as JSON: [{ heading, paragraphs: [] }]. Kept as a document rather
  -- than normalized into rows because it is only ever read whole.
  body         TEXT NOT NULL DEFAULT '[]',
  steps        TEXT NOT NULL DEFAULT '[]',
  -- The highest-leverage field in the whole structure: the words a member
  -- actually types, which are rarely the words in the article.
  synonyms     TEXT NOT NULL DEFAULT '[]',
  sources      TEXT NOT NULL DEFAULT '[]',
  related      TEXT NOT NULL DEFAULT '[]',
  app_path     TEXT,

  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  -- Who last touched it, because a knowledge base nobody owns goes stale
  -- silently and members act on stale answers.
  updated_by   TEXT REFERENCES users(id),
  published_at TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  deleted_at   TEXT,

  UNIQUE (org_id, slug)
);
CREATE INDEX idx_kb_articles_org ON kb_articles(org_id, status, audience);

-- Questions asked, and whether they were answered.
--
-- The point of this table is the unanswered ones. A question nobody could
-- answer is the single best signal of what the knowledge base is missing, and
-- without recording it that signal is lost the moment the person gives up.
--
-- The question text is stored; nothing else about the asker is, beyond which
-- organization and role they were in. Someone typing "why won't you pay for my
-- daughter's surgery" is telling you something operationally vital and
-- something deeply private in the same sentence.
CREATE TABLE kb_questions (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL REFERENCES organizations(id),
  role          TEXT NOT NULL CHECK (role IN ('staff', 'member')),
  question      TEXT NOT NULL,
  -- 'high' | 'partial' | 'none' from the answer engine.
  confidence    TEXT NOT NULL,
  -- The article that led the answer, when there was one.
  top_slug      TEXT,
  -- Set when the asker said the answer did not help. Volunteered, never assumed.
  marked_unhelpful INTEGER NOT NULL DEFAULT 0,
  asked_at      TEXT NOT NULL
);
CREATE INDEX idx_kb_questions_gaps ON kb_questions(org_id, confidence, asked_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- Member accounts.
--
-- The member-facing knowledge base is only useful scoped to the person reading
-- it — "your appeal window closes on the 14th" requires knowing whose appeal.
--
-- Members get their own table rather than a row in `users`. They are not staff
-- with fewer permissions: they have a different lifecycle, different auth
-- needs, and a different blast radius if something goes wrong. Overloading
-- `users` would mean every existing staff query has to remember to exclude
-- members, and the one that forgets is a member listed as ministry personnel.
--
-- This is the data model. The member portal's own login screens are not built
-- yet; what exists here is the linkage the knowledge base and the claims
-- tracker need in order to answer "my claim" correctly.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE member_accounts (
  id             TEXT PRIMARY KEY,
  org_id         TEXT NOT NULL REFERENCES organizations(id),
  -- One account per member. A household sharing a login would mean one adult
  -- reading another's medical circumstances, which is not ours to allow.
  member_id      TEXT NOT NULL UNIQUE REFERENCES members(id),
  email          TEXT NOT NULL,
  password_hash  TEXT,
  password_salt  TEXT,
  status         TEXT NOT NULL DEFAULT 'invited'
                 CHECK (status IN ('invited', 'active', 'suspended')),
  last_seen_at   TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  deleted_at     TEXT
);
CREATE UNIQUE INDEX idx_member_accounts_email ON member_accounts(org_id, email);

CREATE TABLE member_sessions (
  id                TEXT PRIMARY KEY,
  member_account_id TEXT NOT NULL REFERENCES member_accounts(id),
  -- Stored as a hash, like staff sessions: a database copy must not yield
  -- usable sessions.
  token_hash        TEXT NOT NULL UNIQUE,
  expires_at        TEXT NOT NULL,
  created_at        TEXT NOT NULL
);
CREATE INDEX idx_member_sessions_expiry ON member_sessions(expires_at);
