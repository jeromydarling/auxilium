-- 0011 — the ministry site.
--
-- `cms_pages` already existed as a shell: pages, blocks as JSON, draft/publish.
-- What it could not express is a *site*: an ordered set of pages with a
-- navigation, published as a unit, reachable at a public address.
--
-- Three additions, each for a specific failure the shell allowed:

-- A page can be published and still not belong in the navigation — a thank-you
-- page, a page linked only from a letter. Without this, publishing a page and
-- listing it in the menu are the same act, and ministries end up with menus
-- nobody designed.
ALTER TABLE cms_pages ADD COLUMN nav INTEGER NOT NULL DEFAULT 0;

-- Menu order. Alphabetical-by-title put "Questions" before "What is shared" on
-- every ministry that used the default template, which is the wrong order for
-- the one page that most needs reading.
ALTER TABLE cms_pages ADD COLUMN position INTEGER NOT NULL DEFAULT 0;

-- The site is published as a whole, separately from its pages.
--
-- A ministry building its first site has pages in every state for a fortnight.
-- Without a site-level switch, the moment the first page reached 'published'
-- the public address started answering — with one page, no navigation, and no
-- home page. The ministry did not decide to launch; the schema decided for it.
ALTER TABLE organizations ADD COLUMN site_published_at TEXT;

-- Custom domains. Null for everyone until a ministry asks: the default address
-- is /{slug} on the shared origin, which needs no DNS and no certificate.
--
-- Stored lowercase without a scheme or a trailing slash. UNIQUE because two
-- ministries claiming one hostname is a routing ambiguity with no safe answer,
-- and it is far better to refuse the second than to pick one at request time.
ALTER TABLE organizations ADD COLUMN custom_domain TEXT;
CREATE UNIQUE INDEX idx_org_custom_domain ON organizations(custom_domain)
  WHERE custom_domain IS NOT NULL;

-- Published pages are read by strangers, one org and one slug at a time.
CREATE INDEX idx_cms_pages_published ON cms_pages(org_id, status, position)
  WHERE deleted_at IS NULL;
