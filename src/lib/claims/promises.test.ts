import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  assessEligibility, type EligibilityQuery, type CategoryHistory,
} from './eligibility';
import type { GuidelineVersion } from '../integrity/types';
import { answer } from '../knowledge/answer';
import { STAFF_ARTICLES } from '../knowledge/staff';
import { MEMBER_ARTICLES } from '../knowledge/member';

/**
 * Nothing tells a member an outcome is certain.
 *
 * "'Likely' is the strongest word it may use about a future claim" is stated in
 * three places in this codebase and enforced in none of them. It is the one
 * discipline here whose violation causes the exact harm the feature exists to
 * prevent: somebody told they are covered, who then is not, has been harmed
 * twice — once by the denial and once by having relied on us.
 *
 * Two layers, because they fail differently. The source scan catches a phrase
 * somebody types into a template next year. The behavioural check catches a
 * *combination* of inputs producing a promise none of the individual strings
 * looks like.
 */

/** Phrases that assert a future outcome rather than estimating one. */
const PROMISSORY = [
  /\bwill be (?:shared|covered|paid|approved|reimbursed)\b/i,
  /\bis covered\b/i,
  /\byou(?:'re| are) covered\b/i,
  /\bguaranteed?\b/i,
  /\bwe (?:will|shall) (?:share|cover|pay)\b/i,
  /\bfully covered\b/i,
  /\brest assured\b/i,
];

/**
 * Words that make a promissory phrase into its opposite.
 *
 * Without this the guard fires on the sentences this product most wants to say —
 * "it cannot tell you whether a need will be shared" contains "will be shared"
 * and is the honest wording. A guard that flags correct behaviour is one people
 * mute, and then it guards nothing. `whether` and `if` are in the list because
 * they turn the phrase into a question rather than a claim.
 */
const NEGATED = /\b(not|never|cannot|can't|won't|isn't|aren't|no|nothing|unable|whether|if|rather than|does not)\b/i;

/** Promissory phrases in text, ignoring any sentence that negates or hedges. */
function promisesIn(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .filter((sentence) => !NEGATED.test(sentence))
    .flatMap((sentence) =>
      PROMISSORY.filter((p) => p.test(sentence)).map((p) => `${p} in "${sentence.trim()}"`),
    );
}

/**
 * Where a promise would actually reach a member.
 *
 * Deliberately narrow. A scan over the whole tree would flag the *negations* —
 * "sharing is not guaranteed" is the sentence this product most wants to say —
 * and a guard that fires on the correct behaviour is one people mute.
 */
const MEMBER_FACING_SOURCES = [
  'src/lib/claims/eligibility.ts',
  'src/lib/claims/sla.ts',
  'src/lib/knowledge/answer.ts',
];

/** Source lines that could reach a member: string literals, comments excluded. */
function memberFacingStrings(source: string): string[] {
  return source
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .filter((line) => /['"`]/.test(line));
}

describe('no outcome is ever promised', () => {
  it('has no promissory phrase in any member-facing string', () => {
    const offences: string[] = [];

    for (const path of MEMBER_FACING_SOURCES) {
      for (const line of memberFacingStrings(readFileSync(path, 'utf8'))) {
        for (const hit of promisesIn(line)) offences.push(`${path}: ${hit.slice(0, 140)}`);
      }
    }

    expect(offences, `promissory language:\n${offences.join('\n')}`).toEqual([]);
  });

  it('never promises in an eligibility answer, even in the best possible case', () => {
    // The interesting failure is combinational: a verdict string and a factor
    // string that are each fine, reading as a promise together. So this runs the
    // most favourable inputs available — a member of six years, a clearly
    // eligible category, nothing pre-existing, a ministry that has never denied
    // one of these. If anything promises, it promises here.
    const query: EligibilityQuery = {
      category: 'hospitalisation',
      estimated_cents: 500_000,
      planned_date: '2026-09-01',
      member_joined_at: '2020-01-01',
      is_preexisting: false,
      shared_this_year_cents: 0,
    };
    const guideline: GuidelineVersion = {
      version: 'v1',
      effective_from: '2019-01-01',
      effective_to: null,
      provisions: [
        {
          code: 'HOSP-1',
          statement: 'Inpatient hospitalisation is eligible for sharing.',
          supports_denial_codes: [],
        },
      ],
    };
    const history: CategoryHistory = {
      category: 'hospitalisation',
      submitted: 40,
      denied: 0,
      common_denial_reasons: [],
    };

    const best = assessEligibility(query, guideline, history, '2026-07-01T00:00:00Z');
    const text = [
      best.member_guidance,
      ...best.factors.map((f) => f.detail),
      ...best.next_steps,
    ].join(' ');

    expect(promisesIn(text), `eligibility promised something:\n${promisesIn(text).join('\n')}`)
      .toEqual([]);
    // And it still says the strongest permitted word, rather than being useless.
    expect(best.verdict).toBe('likely_shared');
    expect(best.member_guidance.toLowerCase()).toContain('likely');
  });

  it('never promises in a knowledge answer', () => {
    const library = [...STAFF_ARTICLES, ...MEMBER_ARTICLES];
    const questions = [
      'will my surgery be covered',
      'is my hospital stay covered',
      'am I covered for maternity',
      'is this guaranteed',
      'what happens when a claim is declined',
    ];

    for (const question of questions) {
      const result = answer(library, question, { role: 'member' });
      // Every field a member actually reads, in the order the panel renders
      // them. `limits` in particular is where the honest caveats live, and it
      // is the field most likely to be rewritten by somebody trying to sound
      // more reassuring.
      const text = [
        result.lead,
        ...result.aboutYourAccount,
        ...result.steps.map((s) => `${s.title} ${s.body ?? ''}`),
        ...result.limits,
      ].join(' ');
      expect(promisesIn(text), `"${question}" promised something:\n${promisesIn(text).join('\n')}`)
        .toEqual([]);
    }
  });

  it('would catch a promise if one were introduced', () => {
    // A guard nobody has seen fail is a guard nobody knows works.
    expect(promisesIn('Your surgery will be shared in full.')).not.toEqual([]);
    expect(promisesIn('You are covered from day one.')).not.toEqual([]);

    // …and stays quiet on the sentences this product most wants to say.
    for (const honest of [
      'Sharing is voluntary and is not guaranteed.',
      'It cannot tell you whether a particular need will be shared.',
      'We will never tell you that you are covered before a decision is made.',
    ]) {
      expect(promisesIn(honest), honest).toEqual([]);
    }
  });
});
