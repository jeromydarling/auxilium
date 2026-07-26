import { describe, it, expect } from 'vitest';
import {
  defaultSite, newBlock, reviewSite, slugAvailable, isLive, resolveBlock, resolveSite, siteNav,
  RESERVED_SLUGS, LIVE_BLOCKS, type SitePage, type SiteContext,
} from './blocks';
import { ALL_PAGES } from '@/content/registry';

describe('reserved slugs', () => {
  it('refuses every page the marketing site already owns', () => {
    // The two namespaces share an origin, so this is the guard that stops a
    // ministry called "Security Health Share" shadowing /security. Derived from
    // the real registry rather than a copy, so adding a marketing page cannot
    // silently open a collision.
    for (const page of ALL_PAGES) {
      // The home page's slug is '', which is the marketing root rather than a
      // name anybody could take.
      if (page.slug === '') continue;
      const top = page.slug.split('/')[0];
      expect(RESERVED_SLUGS.has(top), `/${top} is reachable as a ministry slug`).toBe(true);
    }
  });

  it('refuses the application surfaces', () => {
    for (const slug of ['app', 'api', 'apply', 'portal', 'admin', 'login']) {
      expect(slugAvailable(slug).ok, slug).toBe(false);
    }
  });

  it('refuses near-misses that confuse a spoken link', () => {
    expect(slugAvailable('api-health').ok).toBe(false);
    expect(slugAvailable('app-store').ok).toBe(false);
  });

  it('accepts an ordinary ministry name', () => {
    for (const slug of ['shelter-valley', 'cedar-ridge', 'gracehealth', 'ministry-2026']) {
      expect(slugAvailable(slug), slug).toEqual({ ok: true });
    }
  });

  it('refuses shapes that would break a URL', () => {
    for (const bad of ['ab', '-leading', 'trailing-', 'Has Capitals', 'has_underscore', 'x'.repeat(60)]) {
      expect(slugAvailable(bad).ok, bad).toBe(false);
    }
  });

  it('explains why, rather than just refusing', () => {
    expect(slugAvailable('pricing').reason).toMatch(/Auxilium itself/);
    expect(slugAvailable('AB').reason).toMatch(/lowercase/);
  });
});

describe('the default site', () => {
  const site = defaultSite('Cedar Ridge');

  it('gives a ministry the pages this category actually needs', () => {
    const slugs = site.map((p) => p.slug);
    expect(slugs).toContain('home');
    // The page whose absence causes the worst failure in this category.
    expect(slugs).toContain('what-is-shared');
  });

  it('says plainly that sharing is not insurance', () => {
    // Every state that legislated on this insisted on the same sentence. A
    // template that leaves it out ships a ministry a site it has to fix.
    const text = JSON.stringify(site).toLowerCase();
    expect(text).toContain('not insurance');
    expect(text).toContain('personally responsible');
  });

  it('names the ministry rather than leaving a placeholder', () => {
    expect(JSON.stringify(site)).toContain('Cedar Ridge');
  });

  it('wires the live blocks in rather than hand-typing the numbers', () => {
    // A ministry that hand-types its share ratio has a wrong number on its site
    // within a quarter, and the wrong number is the one that gets screenshotted.
    const types = site.flatMap((p) => p.blocks.map((b) => b.type));
    expect(types).toContain('share_ratio');
    expect(types).toContain('guidelines');
    expect(types).toContain('apply');
  });

  it('has no button pointing nowhere', () => {
    // A label with no destination renders as a button in an editor preview and
    // as nothing at all on the published page. Either way somebody is misled —
    // the ministry, or the visitor who never sees the button they were promised.
    for (const page of site) {
      for (const block of page.blocks) {
        if (block.actionLabel) {
          expect(block.actionHref || isLive(block.type), `${page.slug}.${block.id}`).toBeTruthy();
        }
      }
    }
  });

  it('gives every block a unique id', () => {
    const ids = site.flatMap((p) => p.blocks.map((b) => b.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has no duplicate page addresses', () => {
    const slugs = site.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('passes its own review', () => {
    expect(reviewSite(site)).toEqual([]);
  });
});

describe('live blocks', () => {
  it('carry no editable copy', () => {
    // Placeholder text on a live block invites a ministry to edit something the
    // product is about to overwrite.
    for (const type of LIVE_BLOCKS) {
      const block = newBlock(type);
      expect(block.heading, type).toBeUndefined();
      expect(block.body, type).toBeUndefined();
    }
  });

  it('are recognisable', () => {
    expect(isLive('share_ratio')).toBe(true);
    expect(isLive('prose')).toBe(false);
  });
});

describe('resolving live blocks', () => {
  const full: SiteContext = {
    ministryName: 'Cedar Ridge',
    shareRatio: { bps: 8940, periodLabel: '2025' },
    guidelines: [{ version: '2025.1', effective_from: '2025-01-01', provisionCount: 12 }],
    governingRule: 'date_of_service',
    applyHref: '/cedar-ridge/apply',
  };

  it('renders the ratio from the ledger, not from typed copy', () => {
    const out = resolveBlock({ id: 'b', type: 'share_ratio' }, full)!;
    expect(out.live?.body).toContain('89.4%');
    expect(out.live?.body).toContain('2025');
  });

  it('states the benchmark and that the ministry is not held to it', () => {
    // The whole value of publishing this is clearing a bar you are not held to.
    // Implying it is a legal requirement would be a false claim on a public page.
    const body = resolveBlock({ id: 'b', type: 'share_ratio' }, full)!.live!.body!;
    expect(body).toContain('80%');
    expect(body).toMatch(/not held to it/);
  });

  it('tells members which version binds them, from the ministry’s own declaration', () => {
    // Ministries publish four different answers to this and all four are in real
    // use. Assuming the enrolment rule would tell a time-of-service ministry's
    // members the wrong thing on the ministry's own front page — and they would
    // act on it.
    const service = resolveBlock({ id: 'b', type: 'guidelines' }, full)!.live!.body!;
    expect(service).toMatch(/date you received the care/);

    const join = resolveBlock({ id: 'b', type: 'guidelines' }, { ...full, governingRule: 'member_join' })!;
    expect(join.live!.body).toMatch(/day you joined/);
  });

  it('says nothing about which version binds when the ministry has not declared', () => {
    // Silence is correct here. Scoring falls back to the strictest reading, but
    // stating that reading publicly would put words in a ministry's mouth.
    const body = resolveBlock({ id: 'b', type: 'guidelines' }, { ...full, governingRule: undefined })!
      .live!.body!;
    expect(body).not.toMatch(/applies to you|applies is/);
  });

  it('drops a live block with no data behind it rather than rendering it empty', () => {
    // A "Share ratio" heading over a dash reads as a ministry with something to
    // hide, which is the exact opposite of why the block exists.
    for (const type of LIVE_BLOCKS) {
      expect(resolveBlock({ id: 'b', type }, { ministryName: 'X' }), type).toBeNull();
    }
  });

  it('never drops an ordinary block', () => {
    expect(resolveBlock({ id: 'b', type: 'prose', body: 'x' }, { ministryName: 'X' })).not.toBeNull();
  });

  it('labels the apply button with the ministry when nobody has renamed it', () => {
    expect(resolveBlock({ id: 'b', type: 'apply' }, full)!.actionLabel).toBe('Apply to Cedar Ridge');
    expect(
      resolveBlock({ id: 'b', type: 'apply', actionLabel: 'Join us' }, full)!.actionLabel,
    ).toBe('Join us');
  });

  it('leaves the page shorter rather than broken', () => {
    const page: SitePage = {
      slug: 'home', title: 'H',
      blocks: [
        { id: '1', type: 'prose', body: 'kept' },
        { id: '2', type: 'share_ratio' },
        { id: '3', type: 'prose', body: 'also kept' },
      ],
    };
    expect(resolveSite(page, { ministryName: 'X' }).map((b) => b.id)).toEqual(['1', '3']);
  });
});

describe('the navigation', () => {
  it('carries the pages a ministry marked, in the order it set', () => {
    const pages: SitePage[] = [
      { slug: 'faq', title: 'Questions', nav: true, blocks: [] },
      { slug: 'hidden', title: 'Thanks', blocks: [] },
      { slug: 'membership', title: 'Joining', nav: true, blocks: [] },
    ];
    expect(siteNav(pages).map((p) => p.slug)).toEqual(['faq', 'membership']);
  });

  it('never lists the home page', () => {
    // It is reachable from the ministry's name in the header. A menu whose first
    // entry duplicates the logo is a menu nobody designed.
    expect(siteNav([{ slug: 'home', title: 'Home', nav: true, blocks: [] }])).toEqual([]);
  });
});

describe('reviewing before publish', () => {
  const page = (blocks: SitePage['blocks']): SitePage[] => [{ slug: 'home', title: 'Home', blocks }];

  it('insists a statistic carries a source', () => {
    const issues = reviewSite(page([
      { id: 'b1', type: 'stats', stats: [{ value: '94%', label: 'of needs shared' }] },
    ]));
    expect(issues[0].message).toMatch(/no source/);
  });

  it('accepts a sourced statistic', () => {
    expect(reviewSite(page([
      { id: 'b1', type: 'stats', stats: [{ value: '94%', label: 'of needs shared', source: 'Our 2025 audit' }] },
    ]))).toEqual([]);
  });

  it('flags an empty block but not an empty live block', () => {
    expect(reviewSite(page([{ id: 'b1', type: 'prose' }]))).toHaveLength(1);
    // A live block with no copy is correct, not broken.
    expect(reviewSite(page([{ id: 'b2', type: 'share_ratio' }]))).toEqual([]);
  });

  it('catches two pages at the same address', () => {
    const issues = reviewSite([
      { slug: 'about', title: 'A', blocks: [{ id: '1', type: 'prose', body: 'x' }] },
      { slug: 'about', title: 'B', blocks: [{ id: '2', type: 'prose', body: 'y' }] },
    ]);
    expect(issues.some((i) => /share this address/.test(i.message))).toBe(true);
  });

  it('says so when there is no home page', () => {
    // The site address answers with the home page. Without one, publishing
    // produces a ministry site whose front door 404s.
    const issues = reviewSite([{ slug: 'faq', title: 'Q', blocks: [{ id: '1', type: 'prose', body: 'x' }] }]);
    expect(issues.some((i) => /no home page/.test(i.message))).toBe(true);
  });

  it('warns when a live block will not appear, and says what to do about it', () => {
    const issues = reviewSite(page([{ id: 'b1', type: 'share_ratio' }]), { ministryName: 'X' });
    expect(issues[0].message).toMatch(/will not appear/);
    // "No data" is not actionable. The thing to go and do is.
    expect(issues[0].message).toMatch(/Record a month of contributions/);
  });

  it('stays quiet about a live block that has its data', () => {
    expect(reviewSite(page([{ id: 'b1', type: 'share_ratio' }]), {
      ministryName: 'X',
      shareRatio: { bps: 8000, periodLabel: '2025' },
    })).toEqual([]);
  });
});
