/**
 * Custom domains.
 *
 * A ministry's site lives at `/{slug}` by default, which needs no DNS, no
 * certificate, and no explanation. A custom domain is the upgrade, and it is
 * worth doing properly because it is the difference between a website a
 * ministry sends people to and a page it is embarrassed to link.
 *
 * The whole security question here is one sentence: **we must never serve a
 * domain to somebody who does not control it.** A row in a table is a claim,
 * not proof. So a domain does nothing until a DNS record only its owner could
 * publish has been seen — and the routing layer reads the verification, never
 * the claim.
 *
 * Pure. The DNS lookup lives in `workers/lib/domain-service.ts`.
 */

/** The label a ministry publishes the verification token under. */
export const VERIFY_PREFIX = '_auxilium-verify';

export interface DomainClaim {
  domain: string;
  token: string;
  verified_at: string | null;
}

/**
 * Normalize what somebody pastes into what DNS actually means.
 *
 * People paste `https://www.Example.org/` because that is what their browser
 * shows them. Storing that verbatim gives a hostname that never matches a
 * `Host` header, and the failure looks like the whole feature being broken
 * rather than like a stray slash.
 */
export function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '')
    .replace(/\.$/, '');
}

const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

export function validateDomain(input: string): { ok: boolean; reason?: string } {
  const domain = normalizeDomain(input);

  if (!domain) return { ok: false, reason: 'Enter the address you want to use.' };
  if (domain.length > 253) return { ok: false, reason: 'That is longer than a domain name can be.' };

  const labels = domain.split('.');
  if (labels.length < 2) {
    return { ok: false, reason: 'That needs to be a full domain, like sheltervalley.org.' };
  }
  if (!labels.every((l) => LABEL.test(l))) {
    return {
      ok: false,
      reason: 'Use letters, numbers, and hyphens. Each part has to start and end with a letter or number.',
    };
  }
  // A ministry that types the address of the app it is sitting in would take
  // its own account offline, and the error it would get is a certificate
  // warning rather than anything that names the cause.
  if (domain.endsWith('.workers.dev') || domain === 'localhost') {
    return { ok: false, reason: 'That address belongs to the platform. Use your own domain.' };
  }
  return { ok: true };
}

/** True for `sheltervalley.org`, false for `www.sheltervalley.org`. Rough, and honest about it. */
export function isApex(domain: string): boolean {
  // Two labels is an apex everywhere; three is an apex only under a public
  // suffix like .co.uk. Getting this exactly right needs the public suffix
  // list, which is a 200KB dependency to slightly improve a hint — so the hint
  // says "usually" and the instructions work either way.
  return normalizeDomain(domain).split('.').length === 2;
}

/**
 * What the ministry has to put in DNS.
 *
 * Two records, and the split matters. The TXT record proves control and is
 * what this system checks. The CNAME is what actually routes traffic, and it
 * is deliberately described second: a ministry that adds the CNAME first
 * points its live website at a Worker that does not yet serve it, which takes
 * their existing site down while they wait for us.
 */
export function dnsInstructions(domain: string, token: string, target: string) {
  const clean = normalizeDomain(domain);
  return {
    verify: {
      type: 'TXT' as const,
      name: `${VERIFY_PREFIX}.${clean}`,
      value: token,
      why: 'Proves you control this domain. Nothing happens until we can see it.',
    },
    route: {
      type: isApex(clean) ? ('A/ALIAS' as const) : ('CNAME' as const),
      name: clean,
      value: target,
      why:
        'Sends visitors here. Add this one only after verification succeeds — adding it first ' +
        'points your current website at a server that is not serving it yet.',
    },
    apex: isApex(clean),
  };
}

/**
 * A verification token.
 *
 * Random, not derived from the domain or the organization id. A derivable token
 * could be computed by anybody who knows the scheme, which would let them
 * publish it under a domain and claim it — turning proof of control into proof
 * of having read this file.
 */
export function verificationToken(random: () => string): string {
  return `auxilium-site-verification=${random()}`;
}
