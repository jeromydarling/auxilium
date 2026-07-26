import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FORM, isMinistryTurn, isTerminal, classifyRelationship, isMinorOn,
  type ApplicationSubmission,
} from './schema';
import { validateApplication, pruneAnswers } from './validate';
import { scoreSubmission } from './spam';
import {
  DEFAULT_HEALTH_FORM, validateDisclosure, lookbackLabel, disclosureProgress,
} from './health';

const GOOD: ApplicationSubmission = {
  spine: {
    first_name: 'Ada', last_name: 'Okonkwo', email: 'ada@example.org',
    date_of_birth: '1984-03-02',
    household: [{ first_name: 'Chidi', last_name: 'Okonkwo', relationship: 'spouse' }],
  },
  answers: {
    membership: { program: 'standard' },
    agreements: { not_insurance: true, accurate: true },
  },
};

describe('validating an application', () => {
  it('accepts a complete one', () => {
    expect(validateApplication(DEFAULT_FORM, GOOD)).toEqual([]);
  });

  it('needs a name and a way to reply', () => {
    const issues = validateApplication(DEFAULT_FORM, {
      ...GOOD,
      spine: { ...GOOD.spine, first_name: '  ', email: '' },
    });
    expect(issues.map((i) => i.path)).toContain('spine.first_name');
    expect(issues.map((i) => i.path)).toContain('spine.email');
  });

  it('rejects a date that does not exist', () => {
    // 2026-02-31 parses happily in JS and rolls into March. A date of birth is
    // load-bearing for pre-existing determinations later, so it has to be real.
    const issues = validateApplication(DEFAULT_FORM, {
      ...GOOD,
      spine: { ...GOOD.spine, date_of_birth: '2026-02-31' },
    });
    expect(issues.map((i) => i.path)).toContain('spine.date_of_birth');
  });

  it('treats an unticked attestation as unanswered, not as "no"', () => {
    // "I did not affirm this" and "I affirmed it as no" are different answers,
    // and only one of them should stop the form.
    const issues = validateApplication(DEFAULT_FORM, {
      ...GOOD,
      answers: { ...GOOD.answers, agreements: { not_insurance: false, accurate: true } },
    });
    expect(issues.map((i) => i.path)).toContain('agreements.not_insurance');
  });

  it('validates everyone in the household, not just the applicant', () => {
    const issues = validateApplication(DEFAULT_FORM, {
      ...GOOD,
      spine: { ...GOOD.spine, household: [{ first_name: 'Chidi', last_name: '' }] },
    });
    expect(issues.map((i) => i.path)).toContain('spine.household.0.last_name');
  });

  it('refuses an implausible household rather than truncating it', () => {
    // Quietly dropping the twenty-first person from a family's application is
    // exactly the silent loss this product exists to stop.
    const many = Array.from({ length: 25 }, (_, i) => ({ first_name: `P${i}`, last_name: 'X' }));
    const issues = validateApplication(DEFAULT_FORM, {
      ...GOOD, spine: { ...GOOD.spine, household: many },
    });
    expect(issues.map((i) => i.path)).toContain('spine.household');
  });

  it('checks a select against its own options', () => {
    const issues = validateApplication(DEFAULT_FORM, {
      ...GOOD, answers: { ...GOOD.answers, membership: { program: 'platinum-elite' } },
    });
    expect(issues.map((i) => i.path)).toContain('membership.program');
  });

  it('leaves optional answers alone', () => {
    expect(validateApplication(DEFAULT_FORM, {
      ...GOOD, answers: { ...GOOD.answers, about: { referral: 'A friend at church' } },
    })).toEqual([]);
  });
});

describe('pruning what a public endpoint receives', () => {
  it('drops keys the form never asked for', () => {
    // A public endpoint receives whatever anyone chooses to POST. Storing
    // unasked keys lets somebody write into a ministry's records through a
    // form that never displayed the field.
    const pruned = pruneAnswers(DEFAULT_FORM, {
      membership: { program: 'standard', injected: 'see me' },
      nonexistent_section: { anything: 'at all' },
    } as never);
    expect(pruned.membership).toEqual({ program: 'standard' });
    expect(pruned.nonexistent_section).toBeUndefined();
  });

  it('trims and caps free text at the field’s own limit', () => {
    const pruned = pruneAnswers(DEFAULT_FORM, { about: { referral: `  ${'x'.repeat(500)}  ` } });
    expect((pruned.about.referral as string).length).toBe(200);
  });

  it('keeps booleans as booleans', () => {
    const pruned = pruneAnswers(DEFAULT_FORM, { agreements: { not_insurance: true } });
    expect(pruned.agreements.not_insurance).toBe(true);
  });
});

describe('spam scoring', () => {
  it('leaves an ordinary application alone', () => {
    const v = scoreSubmission(GOOD, { fillMs: 90_000, recentFromSameIp: 0 });
    expect(v.suspicious).toBe(false);
    expect(v.score).toBe(0);
  });

  it('catches the honeypot', () => {
    expect(scoreSubmission(GOOD, { honeypot: 'http://buy.example' }).score).toBeGreaterThanOrEqual(60);
  });

  it('does not punish a missing fill time', () => {
    // A page that did not report timing is not evidence of anything, and
    // treating silence as guilt would flag anyone with JavaScript disabled.
    expect(scoreSubmission(GOOD, {}).score).toBe(0);
  });

  it('flags a submission faster than the form can be read', () => {
    expect(scoreSubmission(GOOD, { fillMs: 400 }).reasons.join(' ')).toMatch(/faster/i);
  });

  it('flags links in free text but does not condemn one', () => {
    const one = scoreSubmission({ ...GOOD, answers: { about: { notes: 'See http://a.example' } } });
    expect(one.suspicious).toBe(false);

    const many = scoreSubmission({
      ...GOOD,
      answers: { about: { notes: 'http://a.example and http://b.example', referral: 'www.c.example' } },
    });
    expect(many.score).toBeGreaterThan(one.score);
  });

  it('never decides anything on its own', () => {
    // Every path returns a score and a flag. There is no rejection here, by
    // construction — a silent drop would tell an applicant their form was sent
    // when it does not exist.
    const worst = scoreSubmission(
      { spine: { first_name: 'http://x.example', last_name: 'http://y.example', email: 'a@b.co', household: [] },
        answers: { about: { notes: '[url=http://z.example] http://z.example http://w.example' } } },
      { honeypot: 'x', fillMs: 10, recentFromSameIp: 9, existingForEmail: 3 },
    );
    expect(worst.score).toBe(100);
    expect(worst.suspicious).toBe(true);
    expect(worst.reasons.length).toBeGreaterThan(3);
  });
});

describe('application status', () => {
  it('knows when the ministry owes an answer', () => {
    expect(isMinistryTurn('submitted')).toBe(true);
    expect(isMinistryTurn('in_review')).toBe(true);
    // Waiting on the applicant is not the ministry stalling.
    expect(isMinistryTurn('needs_info')).toBe(false);
    expect(isMinistryTurn('accepted')).toBe(false);
  });

  it('knows when it is over', () => {
    expect(isTerminal('accepted')).toBe(true);
    expect(isTerminal('declined')).toBe(true);
    expect(isTerminal('withdrawn')).toBe(true);
    expect(isTerminal('needs_info')).toBe(false);
  });
});

describe('the default form', () => {
  it('does not assume a statement of faith', () => {
    // Roughly half this category does not gate on one. A default that assumes
    // otherwise ships every non-faith-gated ministry a form that misrepresents
    // them until somebody notices.
    const text = JSON.stringify(DEFAULT_FORM).toLowerCase();
    expect(text).not.toContain('statement of faith');
    expect(text).not.toContain('church attendance');
  });

  it('asks nothing about health', () => {
    // Health disclosure is the second stage, after an account exists. Nothing
    // medical should be reachable over the public endpoint.
    const text = JSON.stringify(DEFAULT_FORM).toLowerCase();
    for (const word of ['diagnos', 'condition', 'medication', 'pregnan', 'symptom']) {
      expect(text, `default form asks about "${word}"`).not.toContain(word);
    }
  });

  it('makes the applicant confirm this is not insurance', () => {
    const attestation = DEFAULT_FORM.sections
      .flatMap((s) => s.fields)
      .find((f) => f.key === 'not_insurance');
    expect(attestation?.required).toBe(true);
    expect(attestation?.statement).toMatch(/personally responsible/i);
  });

  it('has unique keys throughout', () => {
    const sectionKeys = DEFAULT_FORM.sections.map((s) => s.key);
    expect(new Set(sectionKeys).size).toBe(sectionKeys.length);
    for (const section of DEFAULT_FORM.sections) {
      const keys = section.fields.map((f) => f.key);
      expect(new Set(keys).size, `${section.key} has duplicate field keys`).toBe(keys.length);
    }
  });
});

describe('turning a household into records', () => {
  const NOW = '2026-07-26';

  it('recognises a spouse without counting them as a dependent', () => {
    for (const word of ['spouse', 'Wife', 'my husband', 'partner']) {
      const r = classifyRelationship(word, '1985-01-01', NOW);
      expect(r.relationship, word).toBe('spouse');
      expect(r.is_dependent, word).toBe(false);
    }
  });

  it('recognises the many words people use for a child', () => {
    for (const word of ['son', 'Daughter', 'step-daughter', 'grandchild', 'ward', 'dependant']) {
      expect(classifyRelationship(word, '1980-01-01', NOW).relationship, word).toBe('dependent');
    }
  });

  it('lets age override the wording', () => {
    // A nine-year-old described as "other" is a dependent whatever the form
    // said. Familia counts children, and a typo should not hide one.
    const r = classifyRelationship('other', '2017-04-01', NOW);
    expect(r.relationship).toBe('dependent');
    expect(r.is_dependent).toBe(true);
  });

  it('does not guess when the date of birth is missing', () => {
    const r = classifyRelationship('cousin', undefined, NOW);
    expect(r.relationship).toBe('member');
    expect(r.is_dependent).toBe(false);
  });

  it('does not turn an adult into a dependent on their birthday', () => {
    expect(isMinorOn('2008-07-25', NOW)).toBe(false);  // just turned 18
    expect(isMinorOn('2008-07-27', NOW)).toBe(true);   // two days short
  });

  it('treats an unrecognised word as a member, not as "other"', () => {
    // "other" reads as a deliberate classification. A word we simply did not
    // recognise is not one.
    expect(classifyRelationship('housemate', '1979-02-02', NOW).relationship).toBe('member');
  });
});

describe('the second-stage health disclosure', () => {
  const F = DEFAULT_HEALTH_FORM;

  it('is not reachable from the public form', () => {
    // The whole point of splitting it out. If health questions ever appear in
    // the application default, medical history is being collected over an
    // unauthenticated endpoint again.
    const publicText = JSON.stringify(DEFAULT_FORM).toLowerCase();
    for (const q of F.questions) {
      expect(publicText).not.toContain(q.key);
    }
  });

  it('needs every question answered', () => {
    const issues = validateDisclosure(F, { answers: {} });
    expect(issues).toHaveLength(F.questions.length);
  });

  it('accepts a straightforward no', () => {
    // A "no" is never questioned. Pressing somebody to justify one turns this
    // into an interrogation, and the honest answer to most of these is no.
    const answers = Object.fromEntries(F.questions.map((q) => [q.key, { answer: false }]));
    expect(validateDisclosure(F, { answers })).toEqual([]);
  });

  it('refuses a bare yes', () => {
    // "Yes" alone is not something a ministry can act on and not something a
    // member can be held to — an answer that looks like a disclosure and
    // functions as nothing.
    const answers = Object.fromEntries(F.questions.map((q) => [q.key, { answer: false }]));
    answers.diagnosis = { answer: true };
    const issues = validateDisclosure(F, { answers });
    expect(issues.map((i) => i.path)).toEqual(['diagnosis']);
  });

  it('accepts a yes with detail', () => {
    const answers: Record<string, { answer: boolean; detail?: string }> =
      Object.fromEntries(F.questions.map((q) => [q.key, { answer: false }]));
    answers.diagnosis = { answer: true, detail: 'Type 2 diabetes, diagnosed 2021, controlled with metformin.' };
    expect(validateDisclosure(F, { answers })).toEqual([]);
  });

  it('states the lookback window in words a member reads', () => {
    expect(lookbackLabel(24)).toBe('the last 2 years');
    expect(lookbackLabel(12)).toBe('the last year');
    expect(lookbackLabel(18)).toBe('the last 18 months');
  });

  it('does not ship somebody else’s exclusion list', () => {
    // Regulators have collected what ministries treat as pre-existing — asthma,
    // diabetes, sleep apnea, autism. A default that ticks those off invites a
    // ministry to adopt exclusions it never decided on.
    const text = JSON.stringify(F).toLowerCase();
    for (const condition of ['asthma', 'diabetes', 'sleep apnea', 'autism', 'hiv', 'cerebral']) {
      expect(text, `default health form names "${condition}"`).not.toContain(condition);
    }
  });

  it('treats a partly-disclosed household as not disclosed', () => {
    // Treating "most of them" as done is how a need gets declined over a person
    // nobody asked about, discovered at the worst possible moment.
    const p = disclosureProgress(['m1', 'm2', 'm3'], [
      { member_id: 'm1', answers: {}, completed_at: '2026-07-01' },
      { member_id: 'm2', answers: {} },
    ]);
    expect(p.done).toBe(1);
    expect(p.total).toBe(3);
    expect(p.complete).toBe(false);
    expect(p.outstanding).toEqual(['m2', 'm3']);
  });

  it('is complete only when everyone has finished', () => {
    const p = disclosureProgress(['m1', 'm2'], [
      { member_id: 'm1', answers: {}, completed_at: 'x' },
      { member_id: 'm2', answers: {}, completed_at: 'y' },
    ]);
    expect(p.complete).toBe(true);
    expect(p.outstanding).toEqual([]);
  });

  it('is not complete for an empty household', () => {
    // Zero of zero is not "everyone has disclosed" — it is a household we know
    // nothing about, and reporting it as done would be the wrong way round.
    expect(disclosureProgress([], []).complete).toBe(false);
  });
});
