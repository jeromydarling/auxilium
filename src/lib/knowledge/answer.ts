/**
 * Answering a question.
 *
 * Two things get combined: what the knowledge base says about the process, and
 * what is actually true of the asker's own account. Either alone is close to
 * useless. "Claims are usually reviewed within 17 days" does not help someone
 * whose claim is on day 40, and "your claim is on day 40" does not tell them
 * what to do about it.
 *
 * Three rules govern every answer, and all three are tested:
 *
 *   1. **Nothing is asserted without a source.** Process answers cite the
 *      article. Account answers cite the record. An answer that can point at
 *      neither says so instead of improvising.
 *   2. **No outcome is ever promised.** "Likely" is the strongest word available
 *      about a future decision — the same discipline the eligibility check
 *      follows, and for the same reason: a member told "you're covered" and then
 *      declined has been harmed by the reassurance.
 *   3. **Limits are stated out loud.** What the answer could not determine goes
 *      in the answer, not in a footnote. The dangerous failure here is a
 *      confident answer to a question that was misunderstood.
 *
 * Pure. Facts are passed in; nothing here reads a database or a clock.
 */

import type { KbArticle, KbSource, KbStep } from './types';
import { search, type SearchHit } from './search';

/**
 * What the asker's own situation is, as far as the caller knows.
 *
 * Every field is optional because an answer has to be useful to someone whose
 * account has nothing interesting in it, and to an anonymous reader with no
 * account at all.
 */
export interface AccountFacts {
  role: 'staff' | 'member';
  memberName?: string;
  /** Claims belonging to the asker (member) or in their queue (staff). */
  claims?: {
    reference: string;
    status: string;
    submittedAt?: string;
    dueAt?: string;
    daysRemaining?: number;
    acknowledged?: boolean;
    declinedReason?: string;
    declinedProvision?: string;
    appealable?: boolean;
    appealDeadline?: string;
  }[];
  /** Which guideline version binds this member, and when they joined. */
  guidelineVersion?: string;
  joinedAt?: string;
  /** Contribution state, for "am I paid up" questions. */
  contributionsCurrent?: boolean;
  lastContributionAt?: string;
  /** Open care items with a promised follow-up. */
  openFollowUps?: number;
}

export interface Answer {
  question: string;
  /** The direct answer. Empty when nothing matched well enough to answer. */
  lead: string;
  /** Facts drawn from the asker's own record that bear on the question. */
  aboutYourAccount: string[];
  steps: KbStep[];
  articles: { slug: string; title: string; summary: string; appPath?: string }[];
  sources: KbSource[];
  /** What this answer deliberately does not or cannot tell you. */
  limits: string[];
  confidence: 'high' | 'partial' | 'none';
}

/** Question shapes that should pull in the asker's own record. */
const ACCOUNT_INTENT = {
  claim: /\b(my|our|this)\b.*\b(claim|need|bill|submission)|claim.*\b(status|where|when|stuck|taking)|when will.*\b(paid|shared|reviewed|decided)/i,
  declined: /\b(denied|declined|rejected|turned down|refused|won'?t (pay|share)|not (covered|shared))\b/i,
  appeal: /\bappeal|dispute|challenge|overturn|second (look|review)|disagree\b/i,
  money: /\b(contribution|payment|dues|share amount|paid up|billing|charged|owe)\b/i,
  // Deliberately broad on the "will this be covered" shape. Any question about
  // whether something gets shared has to attract the disclaimer, and the
  // phrasings are endless — "will my surgery be covered", "is physio shared",
  // "does this count". Missing one means answering a question about a future
  // decision without saying it is not a decision.
  // Prefix matches, deliberately without a trailing word boundary: "guideline"
  // must also catch "guidelines", and "eligib" must catch "eligibility" and
  // "eligible". A trailing \b silently fails on every plural, which is most of
  // how people actually write.
  guidelines:
    /\bguideline|which version|\beligib|pre-?existing|waiting period|\b(will|would|is|are|does|do|can)\b[^?]{0,40}\b(cover|shar|includ|count|qualif|appl)/i,
  rights: /\b(rights?|legal|sue|lawyer|attorney|complain|regulator|insurance commissioner|report them)\b/i,
};

function detectIntents(question: string): string[] {
  return Object.entries(ACCOUNT_INTENT)
    .filter(([, pattern]) => pattern.test(question))
    .map(([key]) => key);
}

/**
 * Ground the answer in the asker's own record.
 *
 * Deliberately factual and unembellished. These lines are read by someone who
 * is worried, and the useful thing is the date, not the reassurance.
 */
function accountLines(intents: string[], facts: AccountFacts | undefined): string[] {
  if (!facts) return [];
  const lines: string[] = [];

  const wantsClaim = intents.includes('claim') || intents.includes('declined') || intents.includes('appeal');

  if (wantsClaim && facts.claims?.length) {
    for (const claim of facts.claims.slice(0, 4)) {
      const parts = [`Claim ${claim.reference} is currently "${claim.status}"`];

      if (claim.acknowledged === false) {
        parts.push('and has not been opened by anyone yet');
      }
      if (typeof claim.daysRemaining === 'number') {
        parts.push(
          claim.daysRemaining >= 0
            ? `with ${claim.daysRemaining} day${claim.daysRemaining === 1 ? '' : 's'} left before its due date`
            : `and is ${Math.abs(claim.daysRemaining)} day${Math.abs(claim.daysRemaining) === 1 ? '' : 's'} past its due date`,
        );
      }
      lines.push(`${parts.join(', ')}.`);

      if (claim.declinedReason) {
        lines.push(
          `It was declined for "${claim.declinedReason}"` +
            (claim.declinedProvision ? `, citing ${claim.declinedProvision}.` : ', with no guideline provision recorded.'),
        );
      }
      if (claim.appealable && claim.appealDeadline) {
        lines.push(`You can appeal this until ${claim.appealDeadline}.`);
      }
    }
  }

  if (wantsClaim && facts.claims && facts.claims.length === 0) {
    lines.push('There are no open claims on your account right now.');
  }

  if (intents.includes('guidelines') && facts.guidelineVersion) {
    lines.push(
      `The guidelines that apply to you are version ${facts.guidelineVersion}` +
        (facts.joinedAt ? `, which is the version in force when you joined on ${facts.joinedAt}.` : '.'),
    );
  }

  if (intents.includes('money') && typeof facts.contributionsCurrent === 'boolean') {
    lines.push(
      facts.contributionsCurrent
        ? `Your contributions are up to date${facts.lastContributionAt ? ` as of ${facts.lastContributionAt}` : ''}.`
        : 'Your contributions are not currently up to date, which can affect whether a need is shared.',
    );
  }

  return lines;
}

/**
 * What we could not work out.
 *
 * Named explicitly, because the failure that hurts someone is a confident
 * answer to a question that was misread.
 */
function limitsFor(intents: string[], facts: AccountFacts | undefined, hits: SearchHit[]): string[] {
  const limits: string[] = [];

  if (hits.length === 0) {
    limits.push('Nothing in the knowledge base matched this question closely enough to answer it.');
    return limits;
  }

  if (!facts) {
    limits.push('This is a general answer — it is not based on your own account.');
  } else if (intents.includes('claim') && !facts.claims) {
    limits.push('Your own claim details were not available, so this answer is about the process in general.');
  }

  // The single most important sentence in the whole module.
  if (intents.includes('declined') || intents.includes('appeal') || intents.includes('guidelines')) {
    limits.push(
      'This explains the process and your options. It is not a decision, and it cannot tell you ' +
        'whether a particular need will be shared.',
    );
  }

  if (intents.includes('rights')) {
    limits.push(
      'This is general information, not legal advice. Rules differ by state, and a lawyer in your ' +
        'state can tell you how they apply to you.',
    );
  }

  return limits;
}

/**
 * Answer a question from the knowledge base and the asker's own record.
 *
 * `confidence` is about retrieval, not about truth: "high" means an article
 * clearly addressed the question, "partial" means something related came back,
 * and "none" means we should say so rather than assemble a plausible paragraph
 * out of the nearest three articles.
 */
export function answer(
  articles: KbArticle[],
  question: string,
  facts?: AccountFacts,
): Answer {
  const audience = facts?.role;
  const hits = search(articles, question, { audience, limit: 5 });
  const intents = detectIntents(question);

  const best = hits[0];
  // The gap between the top hit and the rest is a better confidence signal than
  // the raw score, which moves around with article length.
  const decisive = best && (hits.length === 1 || best.score >= (hits[1]?.score ?? 0) * 1.25);

  const confidence: Answer['confidence'] = !best ? 'none' : decisive ? 'high' : 'partial';

  const sources: KbSource[] = [];
  for (const hit of hits.slice(0, 3)) {
    for (const source of hit.article.sources ?? []) {
      if (!sources.some((s) => s.url === source.url)) sources.push(source);
    }
  }

  return {
    question,
    lead: best ? best.article.summary : '',
    aboutYourAccount: accountLines(intents, facts),
    steps: best?.article.steps ?? [],
    articles: hits.map((h) => ({
      slug: h.article.slug,
      title: h.article.title,
      summary: h.article.summary,
      appPath: h.article.appPath,
    })),
    sources,
    limits: limitsFor(intents, facts, hits),
    confidence,
  };
}

/**
 * Questions worth suggesting when someone has not asked one yet.
 *
 * Different by audience, because the anxious questions are different. Staff
 * want to know how to do something correctly; members want to know what is
 * happening to them and whether they have any say in it.
 */
export function suggestedQuestions(role: 'staff' | 'member'): string[] {
  return role === 'staff'
    ? [
        'Why does this member have a high score?',
        'How do I decline a need properly?',
        'Which guideline version applies to this member?',
        'What does the share ratio mean?',
        'How do I import a roster?',
        'A claim is past its due date — what should I do?',
      ]
    : [
        'What happens to my bill after I submit it?',
        'How long should this take?',
        'My need was declined — what can I do?',
        'How do I appeal a decision?',
        'What are my rights if this is not shared?',
        'Should I pay this bill myself while I wait?',
      ];
}
