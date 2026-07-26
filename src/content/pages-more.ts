import type { MarketingPage } from './types';
import { ACA_MLR_INDIVIDUAL_BPS } from '../lib/integrity/types';
import { formatBps } from '../lib/integrity/mlr';
import {
  PRICING_BANDS,
  MINIMUM_MONTHLY_CENTS,
  ILLUSTRATIVE_MONTHLY_CONTRIBUTION_CENTS,
  platformFeeCents,
  annualFeeCents,
  blendedRateBps,
  volumeForMembers,
  headroomShareBps,
  formatDollars,
  formatRate,
} from '../lib/pricing/tiers';

/**
 * The rest of the public site: features, pricing, security, who it is for,
 * about, and the FAQ.
 *
 * Split from pages.ts purely for length. Same two rules apply and are tested:
 * numbers come from the engine rather than from prose, and no ministry is named
 * anywhere.
 */

const ACA_INDIVIDUAL = formatBps(ACA_MLR_INDIVIDUAL_BPS); // "80.0%"
const UPDATED = '2026-07-26';

/**
 * Pricing prose is derived, never typed.
 *
 * Same rule as the ACA benchmark above: if the schedule in src/lib/pricing
 * changes, every figure on the pricing page moves with it, and the tests fail
 * until they agree. A marketing page quoting a rate the biller does not use is
 * a dispute waiting to happen.
 */
const BAND_1_MEMBERS = 5_000;
const BAND_2_MEMBERS = 50_000;
const SMALL_BLENDED_BPS = blendedRateBps(volumeForMembers(1_000));
const LARGE_BLENDED_BPS = blendedRateBps(volumeForMembers(300_000));
const SMALL_HEADROOM_SHARE = headroomShareBps(
  volumeForMembers(1_000),
  ACA_MLR_INDIVIDUAL_BPS,
);

// ─────────────────────────────────────────────────────────────────────────────
// Features
// ─────────────────────────────────────────────────────────────────────────────

const features: MarketingPage = {
  slug: 'features',
  kind: 'feature',
  title: 'Every feature — Auxilium',
  h1: 'Everything Auxilium does, and everything it does not do yet',
  description:
    'The complete feature set: explainable member scoring, share-ratio reporting, claims SLAs, ' +
    'guideline-consistency checks, reference repricing, and roster import — each marked shipped ' +
    'or planned.',
  priority: 0.9,
  updated: UPDATED,
  blocks: [
    {
      type: 'hero',
      kicker: 'The full list',
      heading: 'Everything Auxilium does',
      subheading:
        'Filter by area. Everything is labelled shipped or planned, because a features page that ' +
        'lists intentions as capabilities is the same unsupported promise this product exists to ' +
        'catch everywhere else.',
      cta: { label: 'Open the demo ministry', href: '/app/login' },
      secondaryCta: { label: 'See how it works', href: '/how-it-works' },
      mockup: 'triage',
    },
    { type: 'featureIndex' },
    {
      type: 'cta',
      heading: 'The fastest way to judge this is to use it',
      body:
        'The demo ministry has five families in it, each carrying a different kind of trouble, ' +
        'and a full integrity report with real findings.',
      cta: { label: 'Open the demo', href: '/app/login' },
      secondaryCta: { label: 'Read the guides', href: '/guides' },
    },
  ],
  related: ['claims-integrity', 'narrative-relational-intelligence', 'how-it-works', 'pricing'],
};

// ─────────────────────────────────────────────────────────────────────────────
// Pricing
// ─────────────────────────────────────────────────────────────────────────────

const PRICING_EXAMPLES = [100, 1_000, 5_000, 10_000, 50_000, 100_000, 300_000];

const pricing: MarketingPage = {
  slug: 'pricing',
  kind: 'landing',
  title: 'Pricing — Auxilium',
  h1: 'You pay a share of what members actually contribute',
  description:
    'Auxilium charges the greater of $9 a month or a graduated percentage of settled member ' +
    'contribution volume: 1.50% of the first $1.25M, 0.75% of the next $11.25M, 0.50% above that. ' +
    'No implementation fee, no per-seat licence, no per-claim charge.',
  priority: 0.8,
  updated: UPDATED,
  blocks: [
    {
      type: 'hero',
      kicker: 'Pricing',
      heading: 'You pay a share of what members actually contribute',
      subheading:
        'No implementation fee. No per-seat licence. No charge per claim. The monthly fee is the ' +
        'greater of $9 or a graduated percentage of settled contribution volume — and the ' +
        'percentage falls as the ministry grows.',
      cta: { label: 'Try it with demo data first', href: '/app/login' },
      secondaryCta: { label: 'See every feature', href: '/features' },
      trust: [
        'No card to open the demo',
        'Every feature in every tier',
        'Export your data at any time',
      ],
    },
    {
      type: 'pricing',
      heading: 'Three marginal bands',
      intro:
        'Marginal means these work like tax brackets. Crossing a threshold lowers the rate on the ' +
        'additional volume only — it never reprices the whole book, so growing across a boundary ' +
        'can never increase the bill.',
      tiers: PRICING_BANDS.map((band, i) => ({
        name: formatRate(band.rateBps),
        forWho: band.label,
        priceNote:
          i === 0
            ? `Roughly the first ${(BAND_1_MEMBERS).toLocaleString('en-US')} members`
            : i === 1
              ? `Roughly members ${(BAND_1_MEMBERS + 1).toLocaleString('en-US')}–${BAND_2_MEMBERS.toLocaleString('en-US')}`
              : `Everything above ${BAND_2_MEMBERS.toLocaleString('en-US')} members`,
        includes:
          i === 0
            ? [
                'The entire product, every feature',
                `A ${formatDollars(MINIMUM_MONTHLY_CENTS)} monthly minimum, and nothing else`,
                'No implementation or onboarding fee',
              ]
            : i === 1
              ? [
                  'Applies only to volume above the first band',
                  'Claims SLAs, appeals, and reference repricing',
                  'Onboarding help with your first real import',
                ]
              : [
                  'Applies only to volume above the second band',
                  'Multiple organizations under one roof',
                  'Data-migration support from a legacy platform',
                ],
        cta: { label: 'Start with the demo', href: '/app/login' },
        // The first band is highlighted because it is the one every ministry
        // pays, whatever its size — not because it is a package anyone picks.
        featured: i === 0,
        flag: i === 0 ? 'Every ministry starts here' : undefined,
      })),
      footnote:
        'Tiers are measured in contribution volume rather than headcount on purpose. Billing on ' +
        'members invites an argument about whether spouses, dependents, inactive members, and ' +
        'partial-month joiners count. Settled dollars are unambiguous, and both sides can ' +
        'reconcile them against the same ledger.',
    },
    {
      type: 'table',
      heading: 'What that actually costs',
      intro:
        'Worked from the schedule above, illustrated at ' +
        `${formatDollars(ILLUSTRATIVE_MONTHLY_CONTRIBUTION_CENTS)} of average monthly ` +
        'contribution per member. Your figures will differ; the arithmetic will not.',
      columns: [
        { label: 'Members' },
        { label: 'Monthly volume', numeric: true },
        { label: 'Monthly fee', numeric: true },
        { label: 'Per year', numeric: true },
        { label: 'Blended rate', numeric: true },
      ],
      rows: PRICING_EXAMPLES.map((members) => {
        const volume = volumeForMembers(members);
        return [
          members.toLocaleString('en-US'),
          formatDollars(volume),
          formatDollars(platformFeeCents(volume)),
          formatDollars(annualFeeCents(volume)),
          formatRate(blendedRateBps(volume)),
        ];
      }),
      footnote:
        'The blended rate is the column that matters — not the headline band, but the share of ' +
        'contributions the platform actually consumed. It falls the whole way down the table.',
    },
    {
      type: 'callout',
      tone: 'caution',
      heading: 'What this fee does to your share ratio, stated plainly',
      body:
        `A platform fee is money that did not reach a medical bill. At the first band it is ` +
        `${formatRate(SMALL_BLENDED_BPS)} of contributions — about ` +
        `${SMALL_HEADROOM_SHARE}% of the roughly twenty points of room the ${ACA_INDIVIDUAL} ` +
        `medical-loss floor leaves a ministry. By ${(300_000).toLocaleString('en-US')} members it ` +
        `is ${formatRate(LARGE_BLENDED_BPS)}. Software that asks you to measure where every dollar ` +
        'went does not get to be vague about its own, so Auxilium counts its own fee as an ' +
        'administrative cost in your share ratio rather than quietly excluding it.',
    },
    {
      type: 'featureList',
      heading: 'What is not on the invoice',
      intro: 'Each of these is a deliberate omission, not an oversight.',
      features: [
        {
          title: 'No per-claim fee',
          body:
            'A charge that scales with claims processed creates a quiet incentive to process ' +
            'fewer of them. For software whose entire argument is that stalled claims strand ' +
            'families, that would be self-defeating.',
        },
        {
          title: 'No per-seat licence',
          body:
            'Charging per staff login discourages exactly the thing that makes the product work — ' +
            'giving everyone who touches member care their own account and audit trail.',
        },
        {
          title: 'No implementation fee',
          body:
            'Import is preview-first and designed to be self-service. Charging a five-figure ' +
            'onboarding fee for a CSV upload would be difficult to justify.',
        },
        {
          title: 'No paywall on integrity',
          body:
            'Share-ratio reporting, guideline-consistency checks, and the claims clock are in ' +
            'every band. Putting accountability behind the expensive plan would mean the ' +
            'ministries least able to afford scrutiny get the least of it.',
        },
        {
          title: 'Processing costs are passed through',
          body:
            'Payment-processing expense is billed at cost and shown separately rather than ' +
            'folded into the platform rate, so you can see both numbers.',
        },
        {
          title: 'Sharing funds are never ours',
          body:
            'Member contributions settle into the ministry\u2019s own account. Auxilium invoices its ' +
            'platform fee against that account at month end; it never holds sharing funds as ' +
            'operating money.',
        },
      ],
    },
    {
      type: 'faq',
      heading: 'Fair questions about cost',
      items: [
        {
          question: 'Why a percentage rather than a flat subscription?',
          answer:
            'Because the work scales with contributions, and so should the cost. A flat fee that ' +
            'suits a ministry of 50,000 would be unaffordable for one of 300, and a flat fee that ' +
            'suits the small ministry would not fund supporting the large one. The $9 minimum ' +
            'exists so a very small ministry pays something close to nothing.',
        },
        {
          question: 'Does the fee go up if we grow past a threshold?',
          answer:
            'Only on the new volume. The bands are marginal, like tax brackets: crossing $1.25M a ' +
            'month means the dollars above that line are billed at 0.75%, while everything below ' +
            'stays at 1.50%. Growing can never make the bill jump.',
        },
        {
          question: 'What if $9 is more than the percentage?',
          answer:
            'Then you pay $9. Below roughly $600 a month of contribution volume the minimum is ' +
            'what governs, which does mean the effective rate is above 1.50% at that size. In ' +
            'absolute terms it is nine dollars.',
        },
        {
          question: 'How is volume measured?',
          answer:
            'Settled member contributions in the calendar month — money that actually arrived. ' +
            'Auxilium records volume through the month, calculates the graduated fee at month end, ' +
            'and invoices the ministry\u2019s account. Refunds and disputes are netted out.',
        },
        {
          question: 'Can we try it with our own roster before committing?',
          answer:
            'Yes, and it is the sensible order. Import is preview-first: nothing is written to ' +
            'the members table until a human commits, so you can run your real export through it ' +
            'and see exactly what would happen without anything happening.',
        },
        {
          question: 'What happens to our data if we leave?',
          answer:
            'You export it. A ministry whose records are hostage to a vendor has swapped one ' +
            'accountability problem for another, and the whole argument of this product is that ' +
            'you should be able to demonstrate what you are doing at any moment.',
        },
      ],
    },
    {
      type: 'cta',
      heading: 'Look at it before you talk to anyone',
      body: 'The demo ministry is fully populated and needs no card, no form, and no call.',
      cta: { label: 'Open the demo', href: '/app/login' },
      secondaryCta: { label: 'See every feature', href: '/features' },
    },
  ],
  related: ['features', 'who-its-for', 'faq'],
};

// ─────────────────────────────────────────────────────────────────────────────
// Who it is for
// ─────────────────────────────────────────────────────────────────────────────

const whoItsFor: MarketingPage = {
  slug: 'who-its-for',
  kind: 'landing',
  title: 'Who Auxilium is for — Auxilium',
  h1: 'Built for the people who actually carry a sharing ministry',
  description:
    'What Auxilium changes for member care staff, claims administrators, finance leads, and the ' +
    'director who has to answer for all of it.',
  priority: 0.7,
  updated: UPDATED,
  blocks: [
    {
      type: 'hero',
      kicker: 'Who it is for',
      heading: 'Built for the people who actually carry a sharing ministry',
      subheading:
        'Four jobs, four different bad days. Auxilium is designed around what each of them is ' +
        'trying not to let happen.',
      cta: { label: 'Open the demo ministry', href: '/app/login' },
      photo: {
        src: '/img/care-call.webp',
        alt: 'A ministry staff member taking notes during a phone call with a member.',
        caption: 'The job is mostly this: noticing, then calling.',
      },
    },
    {
      type: 'split',
      eyebrow: 'Member care',
      heading: 'You are trying not to miss anyone',
      paragraphs: [
        'The families who need you most are the ones who go quiet. They stop replying, they stop ' +
        'submitting, and the absence looks exactly like everything being fine.',
        'The triage board ranks by what changed rather than by who wrote in, so silence is a ' +
        'signal instead of an omission.',
      ],
      bullets: [
        'Four directions, so a billing problem and a crisis do not look alike',
        'A signal you dismissed returns if the facts get materially worse',
        'Today’s nudges, rather than a dashboard you must interpret',
      ],
      mockup: 'triage',
      cta: { label: 'How the scoring works', href: '/narrative-relational-intelligence' },
    },
    {
      type: 'split',
      eyebrow: 'Claims administration',
      heading: 'You are trying not to let one sit',
      paragraphs: [
        'Claims rarely fail loudly. They stall — waiting on information nobody chased, in a status ' +
        'nobody owns, past a date nobody was tracking.',
        'Every claim gets a clock at submission, and the one nobody has opened escalates before ' +
        'its deadline rather than after.',
      ],
      bullets: [
        'The clock pauses for the member — but that status ages on its own timer',
        'Denials require both a reason code and a guideline citation',
        'Repricing against a reference rate, with its basis recorded',
      ],
      mockup: 'claims',
      flip: true,
      cta: { label: 'Why claims stall', href: '/guides/why-claims-stall' },
    },
    {
      type: 'split',
      eyebrow: 'Finance and leadership',
      heading: 'You are trying to be able to answer the question',
      paragraphs: [
        'Sooner or later somebody — a member, a journalist, a regulator, a board — asks where the ' +
        'money went. The honest answer needs to be available on a Tuesday, not assembled over six ' +
        'weeks by an accountant.',
        `The share ratio is computed continuously against the ACA medical-loss floor of ` +
        `${ACA_INDIVIDUAL}, which sharing ministries are exempt from.`,
      ],
      bullets: [
        'Contributions and disbursements on one timeline',
        'Related-party payments broken out and disclosed',
        'A month with money in and nothing out is surfaced, never averaged away',
      ],
      mockup: 'integrity',
      cta: { label: 'How the share ratio works', href: '/guides/share-ratio-explained' },
    },
    {
      type: 'cta',
      heading: 'See it with a ministry that has real problems in it',
      body:
        'The demo has five families and an integrity report with genuine findings — not a happy ' +
        'path with the failures edited out.',
      cta: { label: 'Open the demo', href: '/app/login' },
      secondaryCta: { label: 'See every feature', href: '/features' },
    },
  ],
  related: ['features', 'claims-integrity', 'narrative-relational-intelligence'],
};

// ─────────────────────────────────────────────────────────────────────────────
// Security
// ─────────────────────────────────────────────────────────────────────────────

const security: MarketingPage = {
  slug: 'security',
  kind: 'landing',
  title: 'Security and data handling — Auxilium',
  h1: 'How Auxilium handles the most sensitive records a ministry holds',
  description:
    'Tenant isolation, session handling, auditability, degradation behaviour, and a plain account ' +
    'of what Auxilium does not claim about compliance.',
  priority: 0.6,
  updated: UPDATED,
  blocks: [
    {
      type: 'hero',
      kicker: 'Security',
      heading: 'How Auxilium handles the most sensitive records a ministry holds',
      subheading:
        'Household health circumstances, financial hardship, and prayer requests are among the ' +
        'most private things a person will ever hand an organization. This page says plainly how ' +
        'they are handled.',
      secondaryCta: { label: 'Read the FAQ', href: '/faq' },
    },
    {
      type: 'featureList',
      heading: 'What is actually enforced',
      intro: 'Each of these is a property of the code, not a policy document.',
      features: [
        {
          title: 'Every query is tenant-scoped',
          body:
            'Multi-tenancy is enforced at the query itself rather than trusted to a filter someone ' +
            'remembers to add. There is no exception path.',
        },
        {
          title: 'Sessions are hashed, passwords are derived',
          body:
            'Session tokens are stored as hashes, so a database copy does not yield usable ' +
            'sessions. Passwords go through a deliberately slow key-derivation function.',
        },
        {
          title: 'Production refuses to run unsigned',
          body:
            'Without a session secret, development uses a fixed key with a loud warning and ' +
            'production refuses to issue sessions at all rather than falling back to something ' +
            'guessable.',
        },
        {
          title: 'The rate limiter fails open, on purpose',
          body:
            'If the limiter’s store is unavailable, logins are allowed. A broken limiter must ' +
            'never lock a ministry out on the day it matters most.',
          prevents: 'Availability failures during exactly the crisis the software exists for.',
        },
        {
          title: 'Nothing is hard-deleted',
          body:
            'Records are soft-deleted, so a mistaken removal is recoverable and the history of ' +
            'what was known stays intact for the audit trail.',
        },
        {
          title: 'Consequential actions are written down',
          body:
            'Eligibility checks, denials, imports, and administrative changes go to an audit log. ' +
            'A member told one thing and then another can point at the record.',
        },
      ],
    },
    {
      type: 'callout',
      tone: 'caution',
      heading: 'What Auxilium does not claim',
      body:
        'Auxilium is not a compliance certification and does not make an organization compliant ' +
        'with anything. It records what happened and measures it against benchmarks you choose to ' +
        'be held to. Any vendor telling you their software makes you compliant is selling you a ' +
        'feeling rather than a control.',
    },
    {
      type: 'faq',
      heading: 'Questions worth asking any vendor',
      items: [
        {
          question: 'Where does the data live?',
          answer:
            'In a managed relational database owned by your organization’s account, with files in ' +
            'object storage under per-ministry key prefixes. Cache layers hold only derived data ' +
            'and are never the system of record, so losing the cache loses nothing.',
        },
        {
          question: 'Is scoring ever sent to a third-party model?',
          answer:
            'No. Scoring is rule-based and runs locally to the application. An optional AI feature ' +
            'writes narrative triage notes, and with no key configured it reports that it is not ' +
            'configured — scoring is entirely unaffected either way.',
        },
        {
          question: 'Can we get everything out?',
          answer:
            'Yes. Records export, and the source file for every roster import is retained so any ' +
            'question about what was imported can be answered against the file that was sent.',
        },
        {
          question: 'What happens when part of the platform is unavailable?',
          answer:
            'It degrades loudly rather than silently. Without background queues, imports commit ' +
            'inline and signals recompute inline; each fallback is logged. The failure mode to be ' +
            'afraid of is the one nobody is told about.',
        },
      ],
    },
  ],
  related: ['faq', 'about', 'features'],
};

// ─────────────────────────────────────────────────────────────────────────────
// About
// ─────────────────────────────────────────────────────────────────────────────

const about: MarketingPage = {
  slug: 'about',
  kind: 'landing',
  title: 'Why Auxilium exists — Auxilium',
  h1: 'Nobody should get missed',
  description:
    'Why Auxilium was built, the convictions written into how it scores and what it refuses to ' +
    'do, and what it deliberately is not.',
  priority: 0.6,
  updated: UPDATED,
  blocks: [
    {
      type: 'hero',
      kicker: 'About',
      heading: 'Nobody should get missed',
      subheading:
        'Health sharing ministries run on relationships and spreadsheets, and they fail in a very ' +
        'specific way: a family in crisis goes quiet, a case stalls in an inbox, a promised ' +
        'follow-up never happens, and nobody notices until the member leaves.',
      photo: {
        src: '/img/family-walk.webp',
        alt: 'A multigenerational family walking together down a tree-lined street at sunset.',
      },
    },
    {
      type: 'prose',
      heading: 'The conviction underneath the software',
      paragraphs: [
        'A sharing ministry sells a promise. Not a policy, not a contract enforceable by an ' +
        'insurance commissioner — a promise that when the worst happens, a community will carry ' +
        'the cost. That is a genuinely different and, done well, better thing than insurance.',

        'But a promise has a problem insurance does not: from the outside, on the day you are ' +
        'deciding whether to join, an organization keeping its promise and one that is not can ' +
        'look identical. Both have warm websites. Both talk about family. The difference only ' +
        'becomes visible years later, to the person holding the bill.',

        'Auxilium is built on the belief that the honest ministries in this category are the ' +
        'majority, and that they are badly served by having no way to show it. Every feature here ' +
        'is either about noticing a person who is slipping, or about making the ministry’s own ' +
        'conduct legible enough to defend.',
      ],
    },
    {
      type: 'featureList',
      heading: 'Decisions we would make the same way again',
      intro:
        'Each of these cost something. They are written down because a user deserves to know what ' +
        'the software believes.',
      features: [
        {
          title: 'Ties break toward the person, not the invoice',
          body:
            'When two members score identically, the one who is hurting outranks the one who is ' +
            'expensive. That is a moral choice encoded in the sort order, not an accident.',
        },
        {
          title: 'No score is unexplainable',
          body:
            'A number is the sum of named rules with published weights. If AI is ever added to the ' +
            'scoring path, it will advise a human — it will not silently move a number.',
        },
        {
          title: 'Fuzzy name matching is deliberately absent',
          body:
            'It would catch some real duplicates and silently merge some real siblings. Merging ' +
            'two people who are different people is far worse than importing one duplicate a human ' +
            'later notices.',
        },
        {
          title: 'Warnings, not blocks, on a weak citation',
          body:
            'A denial with a citation that does not hold up is recorded and flagged rather than ' +
            'refused. Blocking would push staff toward whichever provision the form accepts, and ' +
            'destroy the honest record in the process.',
        },
        {
          title: 'The interruption budget is spent carefully',
          body:
            'The compass may interrupt at most once a day. Software that pops open for routine ' +
            'work gets closed reflexively, and is then closed reflexively on the morning a member ' +
            'is in intensive care.',
        },
        {
          title: 'Eligibility answers are never promissory',
          body:
            '"Likely" is the strongest word the pre-check may use about a future claim. Softening ' +
            'that would recreate the exact harm the feature exists to prevent.',
        },
      ],
    },
    {
      type: 'callout',
      tone: 'plain',
      heading: 'What this is not',
      body:
        'Auxilium is software for health care sharing ministries. It is not insurance, not a ' +
        'health plan, and not a compliance certification. It cannot make an organization honest — ' +
        'it can only make what an organization is already doing visible, to itself first.',
    },
    {
      type: 'cta',
      heading: 'Judge it by using it',
      cta: { label: 'Open the demo ministry', href: '/app/login' },
      secondaryCta: { label: 'Read the guides', href: '/guides' },
    },
  ],
  related: ['security', 'features', 'faq'],
};

// ─────────────────────────────────────────────────────────────────────────────
// FAQ
// ─────────────────────────────────────────────────────────────────────────────

const faq: MarketingPage = {
  slug: 'faq',
  kind: 'landing',
  title: 'Frequently asked questions — Auxilium',
  h1: 'Questions ministries actually ask',
  description:
    'Straight answers on migration, scoring, claims administration, what Auxilium refuses to ' +
    'promise, and how it behaves when parts of it are unavailable.',
  priority: 0.6,
  updated: UPDATED,
  blocks: [
    {
      type: 'hero',
      kicker: 'FAQ',
      heading: 'Questions ministries actually ask',
      subheading:
        'Including the awkward ones. If an answer here is hedged, it is hedged because the honest ' +
        'answer is uncertain, not because the real one is bad.',
      cta: { label: 'Open the demo ministry', href: '/app/login' },
    },
    {
      type: 'faq',
      heading: 'Getting started',
      items: [
        {
          question: 'Our roster is a spreadsheet somebody has maintained for nine years. Is that a problem?',
          answer:
            'That is the expected input. The parser is written for real exports: byte-order marks, ' +
            'mixed date formats, embedded newlines, ragged rows, duplicate headers, and columns ' +
            'called things like "Mbr #". Import is preview-first, so you can see exactly what would ' +
            'happen before anything is written.',
        },
        {
          question: 'What happens to duplicates?',
          answer:
            'Matching runs on email, then phone plus surname, then name plus date of birth. Fuzzy ' +
            'name matching is deliberately not used, so two siblings on a shared landline stay two ' +
            'people. A matched member is updated rather than duplicated, and a blank cell means ' +
            '"not provided" rather than "delete what you know".',
        },
        {
          question: 'How long does it take to see something useful?',
          answer:
            'Scoring runs as soon as members exist, so the triage board is populated immediately ' +
            'after a first import. The integrity report needs contribution and disbursement data ' +
            'to be meaningful, which is usually the second thing a ministry loads.',
        },
      ],
    },
    {
      type: 'faq',
      heading: 'About the scoring',
      items: [
        {
          question: 'Is this AI deciding who needs help?',
          answer:
            'No. Scoring is a sum of rule weights with no model, no training data, and no learned ' +
            'coefficient anywhere in the calculation. The reasons are shown with their exact ' +
            'weights so you can add the number up by hand and disagree with a specific rule.',
        },
        {
          question: 'Can we change the rules?',
          answer:
            'The full rule set with weights and rationale is published to administrators as a ' +
            'product feature rather than a debug screen. Changing weights is a deliberate ' +
            'operation, because a score that quietly means something different next month is worse ' +
            'than one you disagree with consistently.',
        },
        {
          question: 'What stops staff from ignoring it?',
          answer:
            'Nothing, and that is correct — it advises rather than commands. What the design tries ' +
            'to earn is the right to be believed: interruptions are capped at one a day, dismissed ' +
            'signals stay dismissed until the facts get materially worse, and every number can be ' +
            'checked.',
        },
      ],
    },
    {
      type: 'faq',
      heading: 'The uncomfortable ones',
      items: [
        {
          question: 'Will this stop fraud?',
          answer:
            'No, and be wary of software that says it will. Auxilium measures and records. It ' +
            'makes certain patterns visible early — money in with nothing out, denials citing ' +
            'guidelines that postdate a member, a share ratio drifting — but a determined bad ' +
            'actor with administrative access can misuse any system. What changes is how long it ' +
            'takes anyone to notice.',
        },
        {
          question: 'Does using this make us compliant?',
          answer:
            'No. Health care sharing ministries are exempt from state insurance regulation, and no ' +
            `software changes that. Measuring against the ${ACA_INDIVIDUAL} medical-loss floor is ` +
            'meaningful precisely because you are not required to meet it.',
        },
        {
          question: 'What if our share ratio is not good?',
          answer:
            'Then you will find out privately, before someone else finds out publicly, and the ' +
            'report will show which months and categories moved it. The public page is opt-in; ' +
            'nothing is published because the software felt like it.',
        },
        {
          question: 'We already have an administration platform. Why add this?',
          answer:
            'If it already tells you which members are quiet, which claims have stalled, and what ' +
            'share of contributions reached medical costs this month, you may not need to. The ' +
            'comparison pages are honest about where the alternatives win.',
        },
      ],
    },
    {
      type: 'cta',
      heading: 'Still deciding?',
      body: 'The demo answers most of these faster than reading about them does.',
      cta: { label: 'Open the demo ministry', href: '/app/login' },
      secondaryCta: { label: 'Compare the alternatives', href: '/compare/spreadsheets' },
    },
  ],
  related: ['pricing', 'security', 'features'],
};

export const MORE_PAGES: MarketingPage[] = [features, pricing, whoItsFor, security, about, faq];
