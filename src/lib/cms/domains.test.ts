import { describe, it, expect } from 'vitest';
import {
  normalizeDomain, validateDomain, isApex, dnsInstructions, verificationToken, VERIFY_PREFIX,
} from './domains';

describe('normalizing what somebody pastes', () => {
  it('accepts what a browser shows them', () => {
    // Nobody types a bare hostname. They copy the address bar.
    for (const input of [
      'https://sheltervalley.org/',
      'http://SHELTERVALLEY.org',
      '  sheltervalley.org  ',
      'sheltervalley.org.',
      'https://sheltervalley.org/about?x=1',
    ]) {
      expect(normalizeDomain(input), input).toBe('sheltervalley.org');
    }
  });

  it('drops a port', () => {
    // Stored with a port, it would never match a Host header, and the failure
    // reads as the whole feature being broken rather than as a stray :443.
    expect(normalizeDomain('sheltervalley.org:443')).toBe('sheltervalley.org');
  });

  it('keeps a subdomain', () => {
    expect(normalizeDomain('https://www.sheltervalley.org')).toBe('www.sheltervalley.org');
  });
});

describe('validating a domain', () => {
  it('accepts ordinary ones', () => {
    for (const d of ['sheltervalley.org', 'www.cedar-ridge.com', 'share.example.co.uk']) {
      expect(validateDomain(d).ok, d).toBe(true);
    }
  });

  it('refuses a bare label', () => {
    expect(validateDomain('sheltervalley').ok).toBe(false);
    expect(validateDomain('sheltervalley').reason).toMatch(/full domain/);
  });

  it('refuses the platform’s own addresses', () => {
    // A ministry that typed this would take its own account offline, and the
    // error it would see is a certificate warning that names nothing.
    expect(validateDomain('anything.workers.dev').ok).toBe(false);
    expect(validateDomain('localhost').ok).toBe(false);
  });

  it('refuses shapes DNS cannot represent', () => {
    for (const d of ['-lead.org', 'trail-.org', 'has_underscore.org', 'has space.org', '..org']) {
      expect(validateDomain(d).ok, d).toBe(false);
    }
  });

  it('explains rather than just refusing', () => {
    expect(validateDomain('').reason).toBeTruthy();
    expect(validateDomain('has_underscore.org').reason).toMatch(/letters, numbers, and hyphens/);
  });
});

describe('the DNS instructions', () => {
  const dns = dnsInstructions('https://SHELTERVALLEY.org/', 'tok123', 'auxilium-app.example.dev');

  it('puts the verification record under a name only the owner controls', () => {
    expect(dns.verify.type).toBe('TXT');
    expect(dns.verify.name).toBe(`${VERIFY_PREFIX}.sheltervalley.org`);
    expect(dns.verify.value).toBe('tok123');
  });

  it('tells them to add the routing record second', () => {
    // Adding the CNAME first points a ministry's live website at a Worker that
    // is not serving it yet — taking their existing site down while they wait.
    expect(dns.route.why).toMatch(/after/);
  });

  it('names the right record type for an apex', () => {
    expect(isApex('sheltervalley.org')).toBe(true);
    expect(isApex('www.sheltervalley.org')).toBe(false);
    expect(dns.route.type).toBe('A/ALIAS');
    expect(dnsInstructions('www.sheltervalley.org', 't', 'x').route.type).toBe('CNAME');
  });
});

describe('the verification token', () => {
  it('is random, not derived', () => {
    // A token anybody can compute from the domain proves only that they read
    // the documentation — which is not control of the domain.
    let n = 0;
    const a = verificationToken(() => `r${(n += 1)}`);
    const b = verificationToken(() => `r${(n += 1)}`);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^auxilium-site-verification=/);
  });
});
