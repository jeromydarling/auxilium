import type { MarketingPage, Source } from './types';
import { ACA_MLR_INDIVIDUAL_BPS, ACA_MLR_LARGE_GROUP_BPS } from '../lib/integrity/types';
import { formatBps } from '../lib/integrity/mlr';

/**
 * Auxilium's public pages.
 *
 * The organizing claim, and the thing every page returns to: a health sharing
 * ministry's product is a promise, and the only way to keep a promise at scale
 * is to be able to prove you are keeping it.
 *
 * On sourcing — the failures described here are matters of public record:
 * attorney-general filings, federal action, and published investigative
 * reporting. They are described as patterns with citations, never as claims
 * about any ministry a reader might be evaluating. The ministries reading this
 * page are the customers; the point is that the honest ones currently have no
 * way to *show* they are honest, and that is the gap Auxilium fills.
 */

// Numbers pulled from the engine rather than typed into prose. A test pins
// this: if the scoring changes, the copy changes with it or the build fails.
const ACA_INDIVIDUAL = formatBps(ACA_MLR_INDIVIDUAL_BPS);   // "80.0%"
const ACA_LARGE_GROUP = formatBps(ACA_MLR_LARGE_GROUP_BPS); // "85.0%"

const SOURCES = {
  georgetown: {
    label: 'Georgetown CHIR — Health Care Sharing Ministry Data Point to Problems',
    url: 'https://chir.georgetown.edu/health-care-sharing-ministry-data-point-to-problems-for-consumers-regulators/',
  },
  alliance: {
    label: 'Alliance of Health Care Sharing Ministries — Data and Statistics',
    url: 'https://ahcsm.org/about-us/data-and-statistics/',
  },
  californiaAg: {
    label: 'California Attorney General — action against Aliera and Sharity',
    url: 'https://oag.ca.gov/news/press-releases/attorney-general-bonta-takes-legal-action-against-sham-health-care-sharing',
  },
  ministryWatch: {
    label: 'MinistryWatch — federal action over withheld contributions',
    url: 'https://ministrywatch.com/feds-accuse-christian-health-sharing-company-of-withholding-contribution-dollars-from-members-for-two-years/',
  },
  propublica: {
    label: 'ProPublica — reporting on the regulatory gap in health care sharing',
    url: 'https://www.propublica.org/article/liberty-healthshare-healthcare-sharing-ministries-obamacare',
  },
  healthcareDive: {
    label: 'Healthcare Dive — health system suit over unpaid claims',
    url: 'https://www.healthcaredive.com/news/florida-health-system-sues-health-sharing-ministry/625335/',
  },
} satisfies Record<string, Source>;

// ─────────────────────────────────────────────────────────────────────────────
// Home
// ─────────────────────────────────────────────────────────────────────────────

const home: MarketingPage = {
  slug: '',
  kind: 'landing',
  title: 'Auxilium — prove your ministry keeps its promise',
  h1: 'Your product is a promise. Auxilium is how you prove you are keeping it.',
  description:
    'Operations software for health care sharing ministries. Show exactly what share of member ' +
    'contributions reaches medical bills, keep every denial tied to a published guideline, and ' +
    'make sure no member is quietly missed.',
  priority: 1,
  updated: '2026-07-25',
  blocks: [
    {
      type: 'hero',
      kicker: 'Health care sharing ministry operations',
      heading: 'Your product is a promise. Auxilium is how you prove you are keeping it.',
      subheading:
        'A ministry asks families to trust that a community will carry their medical bills. ' +
        'Auxilium measures whether that is happening — in dollars, per month, against a public ' +
        'benchmark — and makes sure no member goes quiet without anyone noticing.',
      cta: { label: 'See the demo ministry', href: '/app/login' },
      secondaryCta: { label: 'How claims integrity works', href: '/claims-integrity' },
      photo: {
        src: '/img/hero-kitchen.webp',
        alt: 'A woman at a kitchen table in morning light, working through a stack of medical bills.',
        caption: 'This is the moment the whole product is about.',
      },
      trust: [
        'Every score explainable by hand',
        'Nothing imported until you commit',
        'No card to open the demo',
      ],
    },
    {
      type: 'prose',
      paragraphs: [
        'Roughly 692,000 Americans belong to a health care sharing ministry, sharing more than ' +
        '$1.1 billion in medical costs a year. These organizations are exempt from state insurance ' +
        'law: there are no solvency requirements and no statutory obligation to pay a claim on any ' +
        'timetable. Membership rests on trust.',

        'That exemption cuts both ways. It is also why an honest ministry currently has no ' +
        'straightforward way to demonstrate it is honest — and why, from the outside, a ministry ' +
        'doing this well can be hard to distinguish from one that is not. Auxilium exists to close ' +
        'that gap.',
      ],
    },
    {
      type: 'statRow',
      stats: [
        { value: '692,000', label: 'Americans in an Alliance-affiliated ministry', source: SOURCES.alliance },
        { value: '$1.1B+', label: 'shared in medical costs each year', source: SOURCES.alliance },
        { value: '0', label: 'statutory requirement to pay a claim on time', source: SOURCES.georgetown },
      ],
    },
    {
      type: 'featureList',
      heading: 'Four failures this category keeps having',
      intro:
        'Each of these is documented in public filings and reporting. Each has a specific ' +
        'answer inside Auxilium — not a policy or a promise, but a number on a screen that a ' +
        'board member can read.',
      features: [
        {
          title: 'Nobody can say where the money went',
          body:
            'Auxilium keeps contributions and disbursements on one ledger and computes the share ' +
            `ratio: of every dollar members gave, how many cents reached medical bills. It is ` +
            `benchmarked against the ACA medical-loss floor of ${ACA_INDIVIDUAL} — a standard ` +
            'sharing ministries are exempt from, which is exactly why clearing it means something.',
          prevents:
            'Regulators have alleged organizations in this category retained the large majority ' +
            'of member contributions rather than sharing them.',
        },
        {
          title: 'Denials that cite nothing',
          body:
            'Every denial must name both a reason and the published guideline provision that ' +
            'permits it. Auxilium flags denials citing a provision that does not exist, does not ' +
            'authorize that reason, or took effect after the member joined.',
          prevents:
            'Members across multiple ministries describe being denied with no stated basis and ' +
            'no route to appeal.',
        },
        {
          title: 'Claims that quietly stop moving',
          body:
            'Every claim gets a turnaround commitment and a visible clock. Claims that breach it ' +
            'escalate on their own — and so do claims nobody has opened yet, before the deadline, ' +
            'because silence is what turns a delay into a complaint.',
          prevents:
            'Families have carried hospital bills for months past a ministry\'s own published ' +
            'turnaround because nothing in the process escalated automatically.',
        },
        {
          title: 'Data you cannot produce on demand',
          body:
            'Claims are captured as structured records — procedure code, diagnosis, provider NPI, ' +
            'dates, amounts — so a hospital\'s records request is one export, not a reconstruction.',
          prevents:
            'A health system sued a ministry over unpaid claims; asked to verify the balances, ' +
            'the ministry could not produce patient names, procedures, dates, or account numbers.',
        },
      ],
    },
    {
      type: 'split',
      eyebrow: 'Financial integrity',
      heading: 'Answer the money question on a Tuesday, not in six weeks',
      paragraphs: [
        'Of every dollar members contributed, how many cents reached their medical costs? The ' +
        'ratio is computed continuously and measured against a floor sharing ministries are ' +
        'exempt from — which is exactly what makes clearing it worth something.',
        'A month with contributions and no distributions is the loudest signal this system ' +
        'produces, so the query is built to make that month impossible to lose.',
      ],
      bullets: [
        'Contributions and disbursements on one timeline',
        'Related-party payments broken out and disclosed separately',
        'An opt-in public page with no member data in it',
      ],
      mockup: 'integrity',
      cta: { label: 'How the share ratio works', href: '/guides/share-ratio-explained' },
    },
    {
      type: 'split',
      eyebrow: 'Need Response Intelligence',
      heading: 'A score you can add up by hand, and argue with',
      paragraphs: [
        'Four directions, scored separately, because a member can carry several at once. High ' +
        'Onus with low Cura is a billing problem. High Onus and high Cura is a family in crisis.',
        'There is no model and no learned coefficient anywhere in the calculation. A score is the ' +
        'sum of the rules that matched, shown with their exact weights — because a system that ' +
        'cannot be argued with does not get trusted with pastoral care.',
      ],
      bullets: [
        'Ties break toward Cura — the hurting person outranks the expensive case',
        'A dismissed signal returns when the facts get materially worse',
        'The full rule set is published to administrators as a product page',
      ],
      mockup: 'compass',
      flip: true,
      cta: { label: 'How the scoring works', href: '/need-response-intelligence' },
    },
    {
      type: 'steps',
      heading: 'From a nine-year-old spreadsheet to a working board',
      intro:
        'The first hour is usually the part ministries dread most. It is designed to be the part ' +
        'that goes well.',
      steps: [
        {
          title: 'Upload whatever you have',
          body:
            'Byte-order marks, mixed date formats, embedded newlines, ragged rows, a column called ' +
            '"Mbr #". The parser was written for real exports rather than clean ones.',
        },
        {
          title: 'Look at the preview',
          body:
            'Columns map themselves, duplicates are matched without fuzzy name guessing, and ' +
            'nothing at all is written to your members until you commit.',
        },
        {
          title: 'Commit when it looks right',
          body:
            'Matched members are updated rather than duplicated. A blank cell means "not ' +
            'provided", never "delete what you know".',
        },
        {
          title: 'The board is already populated',
          body:
            'Scoring runs as soon as members exist, so the first thing you see is who needs ' +
            'attention — not an empty state asking you to configure something.',
        },
      ],
    },
    {
      type: 'mockup',
      kind: 'import',
      heading: 'The preview that stands between a messy file and your roster',
      caption:
        'Real output from the demo import: 11 of 11 columns inferred, an in-file duplicate ' +
        'skipped, an existing member matched by email and updated rather than duplicated.',
    },
    {
      type: 'callout',
      tone: 'plain',
      heading: 'What Auxilium does not do',
      body:
        'It does not prevent fraud, and it will not make a ministry compliant with anything. It ' +
        'is software: it measures what your own ledger says, checks your decisions against your ' +
        'own published guidelines, and shows you both. A ministry determined to divert funds can ' +
        'still do so — it just cannot do so and have this dashboard agree with it.',
    },
    {
      type: 'featureList',
      heading: 'And the day-to-day work',
      intro:
        'Integrity is the reason to buy it. Making sure nobody is missed is the reason staff open ' +
        'it every morning.',
      features: [
        {
          title: 'Need Response Intelligence',
          body:
            'Every member is scored on four directions — care, case weight, household complexity, ' +
            'and whether you are still in touch. Every score is a sum of named, weighted reasons. ' +
            'No model, no black box: you can add the numbers up by hand.',
        },
        {
          title: 'Roster import that survives real spreadsheets',
          body:
            'Column inference, forgiving validation, and duplicate matching on email, phone, or ' +
            'name and date of birth. Nothing is written to your member list until you approve a ' +
            'full preview.',
        },
        {
          title: 'Household-first records',
          body:
            'The sharing unit is the family, not the individual. Eligibility, share amounts, and ' +
            'most care conversations happen at that level, and the software works the same way.',
        },
        {
          title: 'Prayer and pastoral follow-up',
          body:
            'Care requests ordered by urgency and overdue follow-up rather than by date, so the ' +
            'person who has been waiting longest is never quietly buried under newer ones.',
        },
      ],
    },
    {
      type: 'cta',
      heading: 'Look at the demo before you talk to anyone',
      body:
        'Two seeded ministries: one well-run, one reproducing the patterns above. Sign into ' +
        'either and compare the numbers. No form, no call.',
      cta: { label: 'Open the demo', href: '/app/login' },
      secondaryCta: { label: 'Read how the scoring works', href: '/guides/how-integrity-scoring-works' },
    },
  ],
  related: ['claims-integrity', 'need-response-intelligence', 'guides'],
};

// ─────────────────────────────────────────────────────────────────────────────
// Claims integrity — the flagship
// ─────────────────────────────────────────────────────────────────────────────

const claimsIntegrity: MarketingPage = {
  slug: 'claims-integrity',
  kind: 'feature',
  title: 'Claims integrity — Auxilium',
  h1: 'Where the money went, and whether you followed your own rules',
  description:
    'Auxilium computes your share ratio against the ACA medical-loss floor, checks every denial ' +
    'against your published guidelines, and escalates claims that stop moving.',
  priority: 0.9,
  updated: '2026-07-25',
  blocks: [
    {
      type: 'hero',
      kicker: 'The flagship',
      heading: 'Where the money went, and whether you followed your own rules',
      subheading:
        'Two questions decide whether a sharing ministry survives scrutiny. Auxilium answers both ' +
        'continuously, from your own ledger, in language a board member can read aloud.',
      cta: { label: 'See it on demo data', href: '/app/login' },
    },
    {
      type: 'prose',
      heading: 'The share ratio',
      paragraphs: [
        'Of every dollar members contributed, how many cents reached their medical bills? It is a ' +
        'simple number and the simplicity is the point — it is the one measure a member, a board, ' +
        'a journalist, and a regulator would all reach for first.',

        `Auxilium computes it monthly and on a trailing three-month window, and benchmarks it ` +
        `against the ACA medical loss ratio: ${ACA_INDIVIDUAL} for individual and small group, ` +
        `${ACA_LARGE_GROUP} for large group. Health care sharing ministries are statutorily ` +
        'exempt from that standard. Measuring against it anyway is the entire point — a ministry ' +
        'that clears a bar it is not held to has said something no marketing page can.',

        'If you choose to, you can publish it. One opt-in endpoint exposes the trailing ' +
        'twelve-month ratio and the benchmark comparison, with no member data in it at all.',
      ],
    },
    {
      type: 'featureList',
      heading: 'What the ledger makes visible',
      features: [
        {
          title: 'A falling ratio, before it is a crisis',
          body:
            'No organization goes from healthy to catastrophic in one month. It slides, and every ' +
            'individual month looks defensible in isolation. Auxilium compares your recent window ' +
            'against the one before it and says so when the trend turns.',
        },
        {
          title: 'Money in, nothing out',
          body:
            'A month that took contributions and disbursed nothing is the loudest signal the ' +
            'system produces. A single such month is a quiet month; a run of them is the pattern ' +
            'that has ended in federal action.',
          prevents:
            'Federal authorities have alleged an organization collected millions while ' +
            'distributing nothing to members for an extended period.',
        },
        {
          title: 'Related-party payments, disclosed by construction',
          body:
            'Payments to owners, their entities, or family are their own category, and Auxilium ' +
            'refuses to record one without a stated relationship. Undisclosed related-party ' +
            'payments are the mechanism in essentially every diversion case on record.',
        },
        {
          title: 'Overhead against sharing',
          body:
            'When administration, marketing, and related-party payments together outweigh what ' +
            'reaches members\' medical bills, the organization has stopped being a sharing ' +
            'ministry in substance. That comparison is on the dashboard, not in an annual report.',
        },
      ],
    },
    {
      type: 'prose',
      heading: 'Denials that can be checked',
      paragraphs: [
        'Your sharing guidelines are versioned and dated inside Auxilium, and each provision ' +
        'declares which denial reasons it actually authorizes. That last part is what makes the ' +
        'whole thing work.',

        'A denial must cite both a reason and a provision. Auxilium then checks four things: that ' +
        'the provision exists, that it authorizes the stated reason, that the member joined before ' +
        'it took effect, and that a reason was recorded at all. Anything that fails becomes a ' +
        'finding the same week — with the amount at stake and the member\'s name — rather than an ' +
        'exhibit in a deposition three years later.',

        'The most consequential of those four is the third. Applying a guideline written after ' +
        'someone joined means holding them to rules they never agreed to, and it is the single ' +
        'clearest pattern in the public record of this category.',
      ],
    },
    {
      type: 'callout',
      tone: 'caution',
      heading: 'It warns; it does not block',
      body:
        'When a citation does not hold up, Auxilium records a loud warning rather than refusing ' +
        'the denial. Blocking would push staff to pick whichever provision the form accepts, and ' +
        'a tidy record of the wrong thing is worse than an honest record of a problem.',
    },
    {
      type: 'prose',
      heading: 'Claims that stop moving',
      paragraphs: [
        'Every claim gets a turnaround commitment when it is submitted, and a visible clock. ' +
        'Breaching it escalates automatically to a named person.',

        'Two decisions in that clock matter more than the rest. The clock pauses while you are ' +
        'waiting on the member — but "waiting on information" gets its own two-week ageing rule, ' +
        'because that status is precisely where claims go to die, and excluding it entirely would ' +
        'create an incentive to park them there.',

        'And a claim nobody has opened escalates before its deadline. An unacknowledged claim is ' +
        'worse than a slow one: the member cannot tell "being worked" from "lost", and assumes ' +
        'the former until it is far too late.',
      ],
    },
    {
      type: 'prose',
      heading: 'Answering before the bill, not after',
      paragraphs: [
        'The cruelest failure in this category happens in the right order but too late: years of ' +
        'contributions, then a procedure, then the discovery that it will not be shared.',

        'Auxilium can assess a planned procedure against the guideline version that actually binds ' +
        'that member and your own denial history for that category. It is deliberately never ' +
        'promissory — "likely" is the strongest word it is permitted to use about a future claim, ' +
        'and that restraint is enforced in the code, not left to a writer. Every assessment is ' +
        'logged, so a member told one thing and then denied can point at the record.',
      ],
    },
    {
      type: 'faq',
      heading: 'Common questions',
      items: [
        {
          question: 'Does this make our ministry compliant with anything?',
          answer:
            'No. Health care sharing ministries are exempt from state insurance regulation, and ' +
            'no software changes that. Auxilium measures what your ledger says and checks your ' +
            'decisions against your own published guidelines. That is evidence you can show — it ' +
            'is not a compliance certification, and anyone selling you one is overstating.',
        },
        {
          question: 'What if our share ratio is below the benchmark?',
          answer:
            'Then you will see it, with the reasons and the amounts. A ratio can be low for ' +
            'legitimate reasons — a quiet quarter, a reserve build, a lumpy month. Auxilium says ' +
            'which of those the ledger supports and which it does not, and the trailing window ' +
            'exists precisely so one unusual month does not read as a crisis.',
        },
        {
          question: 'Do we have to publish the ratio?',
          answer:
            'No. Publishing is opt-in and off by default. It is a decision, not a setting we make ' +
            'for you.',
        },
        {
          question: 'Is any of this AI?',
          answer:
            'No. Every score is a sum of named, weighted reasons over your own data, and the full ' +
            'rule set — every code, weight, and the documented failure it was written from — is ' +
            'published inside the app. A score you cannot argue with is one you should not trust ' +
            'with pastoral or financial decisions.',
        },
      ],
    },
    {
      type: 'cta',
      heading: 'Compare a well-run ministry against a failing one',
      body:
        'The demo seeds both. Same software, same screens — an 89% share ratio next to a 16% one.',
      cta: { label: 'Open the demo', href: '/app/login' },
    },
  ],
  related: ['need-response-intelligence', 'guides/how-integrity-scoring-works', 'guides/share-ratio-explained'],
};

// ─────────────────────────────────────────────────────────────────────────────
// NRI
// ─────────────────────────────────────────────────────────────────────────────

const nri: MarketingPage = {
  slug: 'need-response-intelligence',
  kind: 'feature',
  title: 'Need Response Intelligence — Auxilium',
  h1: 'Make sure nobody is missed',
  description:
    'NRI scores every member on four directions — care, case weight, household complexity, and ' +
    'engagement — using rules you can read, argue with, and change.',
  priority: 0.8,
  updated: '2026-07-25',
  blocks: [
    {
      type: 'hero',
      kicker: 'Need Response Intelligence',
      heading: 'Make sure nobody is missed',
      subheading:
        'Ministries fail members in a specific way: a family goes quiet, a case stalls in ' +
        'somebody\'s inbox, a promised follow-up never happens, and nobody notices until they ' +
        'leave. NRI notices.',
      cta: { label: 'See the command center', href: '/app/login' },
    },
    {
      type: 'featureList',
      heading: 'Four directions',
      intro: 'A member can carry several at once, and that combination is the useful part.',
      features: [
        { title: 'Cura — care', body: 'Hospitalization, bereavement, overdue pastoral follow-up. Somebody is carrying something heavy.' },
        { title: 'Onus — case weight', body: 'Large amounts, stalled processing, denials without a basis, coordination nobody owns.' },
        { title: 'Familia — household', body: 'Dependents, caregiving, a household in transition — a new baby, an adult child ageing off.' },
        { title: 'Fides — engagement', body: 'Unanswered outreach, incomplete onboarding, a relationship going quiet before renewal.' },
      ],
    },
    {
      type: 'callout',
      tone: 'plain',
      heading: 'High Onus is a billing problem. High Onus and high Cura is a family in crisis.',
      body:
        'That difference should be legible in half a second on a list of two hundred names, and ' +
        'it is the reason the compass has four directions rather than one priority score.',
    },
    {
      type: 'prose',
      heading: 'A score is a sum of named reasons',
      paragraphs: [
        'That is the entire algorithm. Each rule that matches contributes a stated number of ' +
        'points, the reasons are always shown beside the score, and they add up. A staff member ' +
        'who distrusts a number can check it by hand and either agree or point at the rule they ' +
        'disagree with.',

        'There is no model, no training data, and no learned coefficient anywhere in the ' +
        'calculation. The full rule set is published to administrators inside the app — every ' +
        'code, every weight, and the reasoning behind each one. A system nobody can argue with ' +
        'does not get trusted with pastoral care, and it should not be.',

        'When staff dismiss a signal it stays dismissed — until the facts get materially worse. ' +
        'Somebody who dismissed "this member has gone quiet" should absolutely be shown "this ' +
        'member has gone quiet and is now in hospital".',
      ],
    },
    {
      type: 'cta',
      heading: 'See it against realistic data',
      body: 'Five seeded members, one for each thing NRI is meant to catch, plus one who is perfectly fine.',
      cta: { label: 'Open the demo', href: '/app/login' },
    },
  ],
  related: ['claims-integrity', 'guides/explainable-scoring'],
};

// ─────────────────────────────────────────────────────────────────────────────
// How it works
// ─────────────────────────────────────────────────────────────────────────────

const howItWorks: MarketingPage = {
  slug: 'how-it-works',
  kind: 'feature',
  title: 'How Auxilium works — Auxilium',
  h1: 'How Auxilium works',
  description:
    'Import your roster, record contributions and disbursements, publish your guidelines, and ' +
    'the integrity and NRI layers compute themselves.',
  priority: 0.7,
  updated: '2026-07-25',
  blocks: [
    {
      type: 'hero',
      heading: 'How Auxilium works',
      subheading: 'Four things you put in. Everything else is computed from them.',
      cta: { label: 'Open the demo', href: '/app/login' },
    },
    {
      type: 'featureList',
      heading: 'What you put in',
      features: [
        {
          title: '1. Your roster',
          body:
            'Upload the spreadsheet you already have. Auxilium infers which column is which, ' +
            'validates every row, finds duplicates against existing members, and shows you a full ' +
            'preview. Nothing is written until you approve it. A blank cell means "not provided", ' +
            'never "delete what you know".',
        },
        {
          title: '2. Your ledger',
          body:
            'Contributions in, disbursements out, each categorized. This is what makes the share ' +
            'ratio possible, and it is the difference between believing you are sharing most of ' +
            'what you collect and being able to show it.',
        },
        {
          title: '3. Your guidelines',
          body:
            'Your sharing guidelines, versioned and dated, with each provision declaring which ' +
            'denial reasons it authorizes. Roughly an afternoon of work, once.',
        },
        {
          title: '4. Your claims',
          body:
            'Submitted with the fields a reviewer actually needs. Auxilium refuses a claim that ' +
            'cannot be worked — missing procedure code, invalid provider NPI, no itemized bill — ' +
            'rather than accepting it into a queue where it will stall for months.',
        },
      ],
    },
    {
      type: 'prose',
      heading: 'What comes out',
      paragraphs: [
        'A share ratio benchmarked against a public standard. A list of denials that need ' +
        're-opening, with the amount at stake. An escalation desk of every claim past its ' +
        'commitment and every claim nobody has opened. A triage board of members who need ' +
        'attention, most pressing first. And an audit trail that answers "why did this happen" ' +
        'months later.',
      ],
    },
    {
      type: 'prose',
      heading: 'Built on Cloudflare',
      paragraphs: [
        'Auxilium runs on Cloudflare Workers with D1 for records, R2 for documents, and queues ' +
        'for background work. Practically, that means it is fast everywhere, there are no servers ' +
        'to maintain, and your data lives in one auditable place rather than across four ' +
        'spreadsheets and an inbox.',
      ],
    },
    {
      type: 'cta',
      heading: 'Start with the demo',
      cta: { label: 'Open the demo', href: '/app/login' },
      secondaryCta: { label: 'See claims integrity', href: '/claims-integrity' },
    },
  ],
  related: ['claims-integrity', 'guides/csv-import-that-survives-real-spreadsheets'],
};

export const CORE_PAGES: MarketingPage[] = [home, claimsIntegrity, nri, howItWorks];
export { SOURCES, ACA_INDIVIDUAL, ACA_LARGE_GROUP };
