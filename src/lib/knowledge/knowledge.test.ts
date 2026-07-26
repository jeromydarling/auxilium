import { describe, it, expect } from 'vitest';
import { search, tokenize, stem, byCategory } from './search';
import { answer, suggestedQuestions } from './answer';
import { STAFF_ARTICLES } from './staff';
import { MEMBER_ARTICLES } from './member';
import { ALL_ARTICLES } from './index';

/**
 * Knowledge base tests.
 *
 * The failure mode here is quiet and expensive: someone asks a real question,
 * gets a confident answer to a different question, and acts on it. So these
 * pin two things — that the questions people actually type find the right
 * article, and that an answer never overstates what it knows.
 */

describe('tokenizing', () => {
  it('collapses related word forms so they match', () => {
    // "denied", "denial", "denies" have to collide or half the member-facing
    // vocabulary misses.
    const forms = ['denied', 'denial', 'denies', 'denying'].map((w) => stem(w));
    expect(new Set(forms).size).toBe(1);
  });

  it('keeps short questions usable after stop words are removed', () => {
    // "how do I appeal" is almost entirely stop words. The one that survives is
    // the one that matters.
    expect(tokenize('how do I appeal')).toContain(stem('appeal'));
  });

  it('drops punctuation without losing the word', () => {
    expect(tokenize("what's my claim's status?")).toContain(stem('claim'));
  });
});

describe('finding the right article', () => {
  /** The phrasings a real person uses, and what should come back. */
  const cases: [question: string, expectedSlug: string][] = [
    ['how do I import a spreadsheet', 'staff/import-roster'],
    ['why is this score so high', 'staff/how-scoring-works'],
    ['what does cura mean', 'staff/four-directions'],
    ['how do I deny a claim', 'staff/denying-a-claim'],
    ['what is the share ratio', 'staff/share-ratio'],
    ['I already called them why is it still showing', 'staff/logging-contact'],
    ['what is an IUA', 'staff/sharing-vocabulary'],
    ['what does annual household portion mean', 'staff/sharing-vocabulary'],
  ];

  for (const [question, slug] of cases) {
    it(`answers "${question}" with ${slug}`, () => {
      const hits = search(STAFF_ARTICLES, question, { audience: 'staff' });
      expect(hits.length).toBeGreaterThan(0);
      expect(hits.slice(0, 2).map((h) => h.article.slug)).toContain(slug);
    });
  }

  /** The phrasings a worried member uses, and where they have to land. */
  const memberCases: [question: string, expectedSlug: string][] = [
    ['I cannot afford this hospital bill', 'member/medical-bill-rights'],
    ['does the hospital have to give me charity care', 'member/medical-bill-rights'],
    ['can I complain to the insurance commissioner', 'member/your-rights'],
    ['do I have any legal rights here', 'member/your-rights'],
  ];

  for (const [question, slug] of memberCases) {
    it(`answers "${question}" with ${slug}`, () => {
      const hits = search(ALL_ARTICLES, question, { audience: 'member' });
      expect(hits.length).toBeGreaterThan(0);
      expect(hits.slice(0, 2).map((h) => h.article.slug)).toContain(slug);
    });
  }

  it('returns nothing rather than guessing at an unrelated question', () => {
    const hits = search(STAFF_ARTICLES, 'zxqw fnord blorp', { audience: 'staff' });
    expect(hits).toHaveLength(0);
  });

  it('explains itself by reporting which terms matched', () => {
    const [hit] = search(STAFF_ARTICLES, 'appeal a denial', { audience: 'staff' });
    expect(hit.matched.length).toBeGreaterThan(0);
  });

  it('keeps staff-only articles out of member results', () => {
    const hits = search(ALL_ARTICLES, 'share ratio ledger disbursement', { audience: 'member' });
    for (const hit of hits) {
      expect(hit.article.audience).not.toBe('staff');
    }
  });

  it('lets staff read what members are being told', () => {
    // Isolation is one-way on purpose. A member must never reach staff
    // operations material; staff reading member articles is the job, because
    // someone on the phone with a frightened member needs to see exactly what
    // that member has been told about their rights.
    const hits = search(ALL_ARTICLES, 'what are my rights with the hospital', { audience: 'staff' });
    expect(hits.some((h) => h.article.audience === 'member')).toBe(true);
  });

  it('prefers a literal phrase over articles sharing one word each', () => {
    // "good", "faith", and "estimate" each appear in several articles; the
    // phrase appears in one, and that one should win.
    const hits = search(ALL_ARTICLES, 'good faith estimate');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].article.slug).toBe('member/medical-bill-rights');
  });

  it('surfaces both itemized-bill articles, because both are right', () => {
    // A member typing "itemized bill" might mean "what do I send the ministry"
    // or "how do I make the hospital give me one". Both are real questions with
    // different articles, and ranking one over the other would be a guess.
    // What must not happen is either going missing.
    const slugs = search(ALL_ARTICLES, 'itemized bill', { audience: 'member' })
      .slice(0, 3)
      .map((h) => h.article.slug);
    expect(slugs).toContain('member/what-to-send');
    expect(slugs).toContain('member/medical-bill-rights');
  });
});

describe('answers', () => {
  it('leads with a summary that stands on its own', () => {
    const result = answer(STAFF_ARTICLES, 'how do I import a roster', { role: 'staff' });
    expect(result.confidence).not.toBe('none');
    expect(result.lead.length).toBeGreaterThan(40);
  });

  it('says plainly when it does not know', () => {
    const result = answer(ALL_ARTICLES, 'zxqw fnord blorp', { role: 'member' });
    expect(result.confidence).toBe('none');
    expect(result.lead).toBe('');
    expect(result.limits.join(' ')).toContain('matched');
  });

  it('grounds a claim question in the member’s own record', () => {
    const result = answer(ALL_ARTICLES, 'what is happening with my claim', {
      role: 'member',
      claims: [{ reference: 'N-1', status: 'in review', daysRemaining: -4, acknowledged: false }],
    });
    const text = result.aboutYourAccount.join(' ');
    expect(text).toContain('N-1');
    expect(text).toContain('past its due date');
    expect(text).toContain('has not been opened');
  });

  it('says so when there is nothing on the account rather than staying silent', () => {
    const result = answer(ALL_ARTICLES, 'where is my claim', { role: 'member', claims: [] });
    expect(result.aboutYourAccount.join(' ')).toContain('no open claims');
  });

  it('surfaces a decline with no provision behind it', () => {
    const result = answer(ALL_ARTICLES, 'why was my need denied', {
      role: 'member',
      claims: [{ reference: 'N-2', status: 'declined', declinedReason: 'not eligible' }],
    });
    expect(result.aboutYourAccount.join(' ')).toContain('no guideline provision recorded');
  });

  it('never promises an outcome on a decline or eligibility question', () => {
    for (const question of [
      'will my surgery be covered',
      'my claim was denied, can I appeal',
      'which guidelines apply to me',
    ]) {
      const result = answer(ALL_ARTICLES, question, { role: 'member' });
      expect(
        result.limits.some((l) => l.includes('not a decision')),
        `"${question}" did not disclaim an outcome`,
      ).toBe(true);
    }
  });

  it('disclaims legal advice when asked about rights', () => {
    const result = answer(ALL_ARTICLES, 'what are my legal rights if they refuse to pay', {
      role: 'member',
    });
    expect(result.limits.join(' ')).toContain('not legal advice');
  });

  it('flags a general answer as general when there is no account behind it', () => {
    const result = answer(ALL_ARTICLES, 'what happens to my claim');
    expect(result.limits.join(' ')).toContain('not based on your own account');
  });

  it('carries sources through from the articles it used', () => {
    const result = answer(MEMBER_ARTICLES, 'can the insurance commissioner help me', {
      role: 'member',
    });
    expect(result.sources.length).toBeGreaterThan(0);
    for (const source of result.sources) {
      expect(source.url).toMatch(/^https?:\/\//);
    }
  });

  it('sends a member asking about an unaffordable bill to the hospital, not just the ministry', () => {
    // The leverage a declined member actually has is against the provider, and
    // it does not depend on the sharing decision at all. An answer that only
    // explains the appeal has left the better option out.
    const result = answer(ALL_ARTICLES, 'I cannot afford this hospital bill', { role: 'member' });
    const text = [result.lead, ...result.steps.map((s) => `${s.title} ${s.body}`)].join(' ');
    expect(text.toLowerCase()).toMatch(/financial assistance|240|hospital/);
  });

  it('never states a legal requirement to a member without a citation behind it', () => {
    const result = answer(ALL_ARTICLES, 'what are my rights with the hospital bill', {
      role: 'member',
    });
    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.limits.join(' ')).toContain('not legal advice');
  });

  it('offers different starting questions to staff and members', () => {
    expect(suggestedQuestions('staff')).not.toEqual(suggestedQuestions('member'));
    expect(suggestedQuestions('member').join(' ').toLowerCase()).toContain('rights');
  });
});

describe('the library as a whole', () => {
  it('has no duplicate slugs', () => {
    const slugs = ALL_ARTICLES.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('gives every article a summary that answers on its own', () => {
    for (const a of ALL_ARTICLES) {
      expect(a.summary.length, `${a.slug} has a thin summary`).toBeGreaterThan(60);
    }
  });

  it('gives every article real body content', () => {
    for (const a of ALL_ARTICLES) {
      const words = a.body.flatMap((s) => s.paragraphs).join(' ').split(/\s+/).length;
      expect(words, `${a.slug} is a stub`).toBeGreaterThan(60);
    }
  });

  it('points every related link at an article that exists', () => {
    const slugs = new Set(ALL_ARTICLES.map((a) => a.slug));
    for (const a of ALL_ARTICLES) {
      for (const related of a.related ?? []) {
        expect(slugs.has(related), `${a.slug} links to missing ${related}`).toBe(true);
      }
    }
  });

  it('sources every member article that asserts what the law is', () => {
    // The rule that matters most in this whole module. A legal claim without a
    // citation is the kind of thing someone relies on and should not.
    // Narrow on purpose: this must fire on claims about the legal landscape,
    // not on ordinary uses of "state" or "require". A guard that flags
    // everything gets muted, and then it guards nothing.
    const LEGAL =
      /\bstatut|\bregulat(ed|ion|ory)|\bexempt|federal law|state law|insurance (department|commissioner)|not regulated|is not insurance/i;
    for (const a of MEMBER_ARTICLES) {
      const text = [a.summary, ...a.body.flatMap((s) => s.paragraphs)].join(' ');
      if (!LEGAL.test(text)) continue;
      expect(a.sources?.length, `${a.slug} makes a legal claim with no source`).toBeGreaterThan(0);
    }
  });

  it('uses real URLs for every source', () => {
    for (const a of ALL_ARTICLES) {
      for (const s of a.sources ?? []) {
        expect(s.url, `${a.slug} has a malformed source`).toMatch(/^https:\/\/\S+\.\S+/);
        expect(s.label.length).toBeGreaterThan(8);
      }
    }
  });

  it('never tells a member they are guaranteed to be paid', () => {
    const FORBIDDEN = [
      /\bguarantee[sd]? (payment|to pay|that .{0,20}will be (paid|shared))/i,
      /\byou will (definitely|certainly) be (paid|shared|covered)/i,
      /\bis insurance\b/i,
    ];
    for (const a of MEMBER_ARTICLES) {
      const text = [a.title, a.summary, ...a.body.flatMap((s) => s.paragraphs)].join(' ');
      for (const pattern of FORBIDDEN) {
        expect(pattern.test(text), `${a.slug} overpromises`).toBe(false);
      }
    }
  });

  it('groups both audiences into browsable categories', () => {
    for (const role of ['staff', 'member'] as const) {
      const grouped = byCategory(ALL_ARTICLES, role);
      expect(grouped.size).toBeGreaterThan(2);
      for (const [, list] of grouped) expect(list.length).toBeGreaterThan(0);
    }
  });
});
