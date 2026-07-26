-- 0012 — proving a ministry owns the domain it claims.
--
-- `custom_domain` arrived in 0011 as a bare string. A bare string is a *claim*,
-- and serving a site on the strength of a claim is the one genuinely dangerous
-- thing in this feature: anybody who could type into the box could have their
-- content served under somebody else's hostname the moment that hostname
-- resolved here.
--
-- So the column that routing reads is `custom_domain_verified_at`, not
-- `custom_domain`. Until a TXT record only the domain's owner could publish has
-- been seen, the claim does nothing at all.

-- The value the ministry publishes at _auxilium-verify.<domain>. Random, never
-- derived from the domain or the org id — a derivable token proves only that
-- somebody read the documentation.
ALTER TABLE organizations ADD COLUMN custom_domain_token TEXT;

-- Set when the record was actually seen. Cleared whenever the domain changes,
-- because a verification is a statement about one hostname and carrying it
-- across a rename would verify a domain nobody ever checked.
ALTER TABLE organizations ADD COLUMN custom_domain_verified_at TEXT;

-- When we last looked, whatever the answer. Lets the UI say "checked four
-- minutes ago, not there yet" instead of leaving somebody refreshing a page
-- with no idea whether anything is happening — DNS propagation is exactly the
-- kind of wait that feels broken without a timestamp.
ALTER TABLE organizations ADD COLUMN custom_domain_checked_at TEXT;

-- Routing looks a ministry up by hostname on requests that are not for the
-- platform's own host, so this wants to be a single index hit.
CREATE INDEX idx_org_verified_domain
  ON organizations(custom_domain)
  WHERE custom_domain IS NOT NULL AND custom_domain_verified_at IS NOT NULL;
