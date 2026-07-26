import type { Env } from './env';
import { first, run } from './db';
import { nowIso } from '../../src/lib/utils';
import { normalizeDomain, VERIFY_PREFIX } from '../../src/lib/cms/domains';

/**
 * Verifying a custom domain.
 *
 * The check is a DNS TXT lookup over DNS-over-HTTPS. A Worker has no resolver,
 * and DoH is the only way to ask a question about DNS from inside one — which
 * turns out to be an advantage rather than a workaround: the answer arrives
 * over TLS, it is cacheable, and it needs no library.
 *
 * **Two resolvers, from two providers, and either one seeing the record is
 * enough.** The record is public by construction, so a positive from either is
 * proof; and the failure this guards against is real. A ministry that has just
 * changed nameservers is frequently visible to one resolver's cache and not the
 * other's for an hour, and a verification that fails in that window sends
 * somebody back to their DNS panel to "fix" a record that was already correct.
 * Different providers rather than two Cloudflare endpoints, because two
 * addresses inside one provider share a failure domain.
 */

const RESOLVERS = [
  'https://cloudflare-dns.com/dns-query',
  // Same JSON shape, different operator and different cache.
  'https://dns.google/resolve',
];

/** DNS answers are small; a slow resolver must not hold a request open. */
const TIMEOUT_MS = 5_000;

export interface DomainStatus {
  domain: string | null;
  token: string | null;
  verified_at: string | null;
  checked_at: string | null;
  /** What we actually saw last time, for the "not there yet" message. */
  found?: string[];
}

/** Every TXT record visible at `_auxilium-verify.<domain>`, from either resolver. */
export async function lookupTxt(domain: string): Promise<string[]> {
  const name = `${VERIFY_PREFIX}.${normalizeDomain(domain)}`;
  const seen = new Set<string>();

  for (const resolver of RESOLVERS) {
    for (const record of await askResolver(resolver, name)) seen.add(record);
    // One resolver seeing it is proof. Asking the second anyway would double
    // the latency of the common case to learn nothing.
    if (seen.size > 0) break;
  }

  return [...seen];
}

async function askResolver(resolver: string, name: string): Promise<string[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${resolver}?name=${encodeURIComponent(name)}&type=TXT`, {
      headers: { accept: 'application/dns-json' },
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[domains] ${resolver} answered ${res.status} for ${name}`);
      return [];
    }

    const body = await res.json<{ Answer?: { type: number; data: string }[] }>();
    return (body.Answer ?? [])
      // Type 16 is TXT. A CNAME in the chain arrives as type 5 and its data is
      // a hostname, which would otherwise be compared against a token and fail
      // in a way nobody could diagnose from the UI.
      .filter((a) => a.type === 16)
      // DoH returns TXT data quoted, and a value longer than 255 bytes arrives
      // as several quoted strings that DNS semantics concatenate. Both have to
      // be undone before comparing against a token.
      .map((a) => a.data.replace(/"\s*"/g, '').replace(/^"|"$/g, ''))
      .map((s) => s.trim());
  } catch (error) {
    // A timeout, a malformed answer, NXDOMAIN — every one of them means "this
    // resolver cannot see the record", which is the same conclusion for the
    // caller, and telling them apart in the API would tempt somebody into
    // treating one as success.
    //
    // Logged, though, and that distinction matters: a resolver that is failing
    // outright looks identical from the UI to a ministry that has not added the
    // record, so without this line an outage in verification would present as
    // every ministry suddenly being bad at DNS.
    console.warn(
      `[domains] ${resolver} failed for ${name}: ` +
        `${error instanceof Error ? error.message : 'unknown'}`,
    );
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Check the claim and record the result.
 *
 * Writes `checked_at` whether or not it succeeded. DNS propagation is exactly
 * the kind of wait that feels broken in silence, and "checked a minute ago,
 * not visible yet" is a different experience from a button that appears to do
 * nothing.
 */
export async function verifyDomain(env: Env, orgId: string): Promise<DomainStatus> {
  const org = await first<{
    custom_domain: string | null;
    custom_domain_token: string | null;
    custom_domain_verified_at: string | null;
  }>(
    env.DB,
    `SELECT custom_domain, custom_domain_token, custom_domain_verified_at
       FROM organizations WHERE id = ?`,
    orgId,
  );

  if (!org?.custom_domain || !org.custom_domain_token) {
    return { domain: null, token: null, verified_at: null, checked_at: null };
  }

  const now = nowIso();
  const found = await lookupTxt(org.custom_domain);
  const ok = found.includes(org.custom_domain_token);

  await run(
    env.DB,
    `UPDATE organizations
        SET custom_domain_checked_at = ?,
            custom_domain_verified_at = COALESCE(custom_domain_verified_at, ?),
            updated_at = ?
      WHERE id = ?`,
    now,
    // COALESCE rather than an overwrite: once verified, a later check that
    // cannot see the record must not un-verify a live site. Resolvers fail,
    // records get tidied away months later, and taking a ministry's website
    // down over a transient lookup would be a self-inflicted outage.
    ok ? now : null,
    now,
    orgId,
  );

  return {
    domain: org.custom_domain,
    token: org.custom_domain_token,
    verified_at: org.custom_domain_verified_at ?? (ok ? now : null),
    checked_at: now,
    found,
  };
}

/**
 * The organization serving this hostname, or null.
 *
 * Reads `custom_domain_verified_at`, never `custom_domain` alone. That is the
 * whole security boundary of the feature: a row is a claim, and a claim must
 * not be enough to have your content served under somebody else's name.
 */
export async function orgByHost(env: Env, host: string): Promise<{ slug: string } | null> {
  const domain = normalizeDomain(host);
  if (!domain) return null;

  return first<{ slug: string }>(
    env.DB,
    `SELECT slug FROM organizations
      WHERE custom_domain = ? AND custom_domain_verified_at IS NOT NULL
        AND deleted_at IS NULL`,
    domain,
  );
}
