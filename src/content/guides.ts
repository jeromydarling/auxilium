import type { MarketingPage } from './types';
import { SOURCES, ACA_INDIVIDUAL, ACA_LARGE_GROUP } from './pages';

/**
 * Guides.
 *
 * These are the organic-traffic surface, and they earn it by being genuinely
 * useful to someone running a ministry whether or not they ever buy anything.
 * A guide that is a product pitch with a headline on it does not get read,
 * linked, or cited — and does not get quoted accurately by an assistant
 * summarizing the category either.
 */

const shareRatioExplained: MarketingPage = {
  slug: 'guides/share-ratio-explained',
  kind: 'guide',
  category: 'Governance',
  title: 'What a share ratio is, and why it matters — Auxilium',
  h1: 'What a share ratio is, and why it matters',
  description:
    'Of every dollar members contribute, how much reaches medical bills? How to compute it, what ' +
    'a healthy number looks like, and how to read one honestly.',
  priority: 0.6,
  updated: '2026-07-25',
  blocks: [
    {
      type: 'prose',
      paragraphs: [
        'A share ratio answers one question: of every dollar members contributed, how many cents ' +
        'went to sharing their medical costs? Divide what you shared by what you collected. That ' +
        'is the whole calculation.',

        'It is the health sharing equivalent of an insurer\'s medical loss ratio, and it is the ' +
        'first number anyone from outside your ministry will reach for — a board member, an ' +
        'auditor, a state regulator, a reporter, a member who has started asking questions.',
      ],
    },
    {
      type: 'prose',
      heading: 'The benchmark, and why it applies to you even though it does not',
      paragraphs: [
        `Under the Affordable Care Act, regulated health plans must spend at least ` +
        `${ACA_INDIVIDUAL} of premium revenue on medical care in the individual and small-group ` +
        `market, and ${ACA_LARGE_GROUP} in the large-group market. Fall short and they owe ` +
        'rebates.',

        'Health care sharing ministries are exempt. There is no medical loss ratio requirement, ' +
        'no solvency requirement, and no statutory obligation to pay a claim on any timetable.',

        'That exemption is exactly why the benchmark is worth adopting voluntarily. You will be ' +
        'compared to it regardless — every journalist and regulator who looks at this category ' +
        'reaches for it — so the only question is whether you know your number before they do.',
      ],
    },
    {
      type: 'prose',
      heading: 'Computing it honestly',
      paragraphs: [
        'Three decisions determine whether the number means anything.',

        'First, use a trailing window rather than a single month. Sharing is lumpy — one large ' +
        'case can swing a month by twenty points in either direction. Three months smooths that ' +
        'without hiding a real trend.',

        'Second, separate administrative fees from sharing contributions on the way in. If ' +
        'members pay a distinct application or administrative fee, it is not part of the sharing ' +
        'pool and including it flatters your ratio dishonestly.',

        'Third, categorize outflows before you need to. Sharing, administration, marketing, and ' +
        'related-party payments are four different things, and a ledger that lumps them together ' +
        'cannot answer the question at all.',
      ],
    },
    {
      type: 'prose',
      heading: 'Reading a low ratio fairly',
      paragraphs: [
        'A low ratio in one period is not evidence of wrongdoing. Reserves get built. Claims lag ' +
        'contributions. A quiet quarter is a real thing, and a ministry that grew quickly will ' +
        'show contributions ahead of claims for a while simply because new members have not ' +
        'needed anything yet.',

        'What is hard to explain innocently is a sustained pattern: a ratio that falls quarter ' +
        'after quarter, overhead that consistently exceeds sharing, or months where contributions ' +
        'arrived and nothing at all went out. Regulators have alleged organizations retaining the ' +
        'large majority of contributions, and federal authorities have alleged one collecting ' +
        'millions while distributing nothing to members for an extended period.',

        'The useful discipline is simply to know your own number monthly, and to be able to ' +
        'explain any month that looks unusual before somebody else asks.',
      ],
    },
    {
      type: 'faq',
      heading: 'Questions',
      items: [
        {
          question: 'What ratio should we be aiming for?',
          answer:
            `The ACA floor of ${ACA_INDIVIDUAL} is a defensible target because it is externally ` +
            'defined rather than self-selected. Publishing a target and then quietly falling ' +
            'below it is considerably worse than never publishing one, so pick a number you can ' +
            'actually hold.',
        },
        {
          question: 'Should we publish our ratio publicly?',
          answer:
            'If you can clear your target consistently, publishing is the strongest trust signal ' +
            'available to you, and essentially nobody in this category does it. If you cannot, ' +
            'fix the number first. Publishing a bad ratio with an explanation attached is still ' +
            'better than being asked for it later, but it is not a substitute for the fix.',
        },
        {
          question: 'Does a high ratio mean a ministry is well run?',
          answer:
            'No. It means money is reaching medical bills. A ministry can have an excellent ratio ' +
            'and still leave claims unanswered for months, deny without a stated basis, or lose ' +
            'track of members entirely. The ratio is necessary and nowhere near sufficient.',
        },
      ],
    },
  ],
  related: ['claims-integrity', 'guides/how-integrity-scoring-works'],
};

const howIntegrityScoringWorks: MarketingPage = {
  slug: 'guides/how-integrity-scoring-works',
  kind: 'guide',
  category: 'Product',
  title: 'How Auxilium scores claims integrity — Auxilium',
  h1: 'How Auxilium scores claims integrity',
  description:
    'The full method: a starting score of 100, named deductions with stated weights, and a band. ' +
    'No model, no hidden coefficients.',
  priority: 0.6,
  updated: '2026-07-25',
  blocks: [
    {
      type: 'prose',
      paragraphs: [
        'Auxilium gives a ministry an integrity score out of 100. This is how it is calculated, ' +
        'in full — the method is published because a score nobody can check is a score nobody ' +
        'should act on.',
      ],
    },
    {
      type: 'prose',
      heading: 'Start at 100 and subtract named findings',
      paragraphs: [
        'Every ministry starts at 100. Each rule that matches subtracts a stated number of points ' +
        'and records why, in a sentence with the actual figures in it. The deductions sum to the ' +
        'score — you can add them up by hand and get the same answer.',

        'Rules fall into four groups: where the money went, where it went instead, whether ' +
        'denials follow your published guidelines, and whether claims actually move. Each rule ' +
        'also stores the documented failure it was written from, so a ministry that disagrees ' +
        'with a finding can argue with a specific case rather than an abstraction.',
      ],
    },
    {
      type: 'comparison',
      heading: 'What moves the score most',
      intro: 'The heaviest deductions, and why they are weighted that way.',
      rows: [
        { capability: 'Months with contributions received and nothing shared', auxilium: 'yes', alternative: 'no', note: 'Heaviest single finding. A run of these is the pattern behind federal action in this category.' },
        { capability: 'Share ratio far below the ACA floor', auxilium: 'yes', alternative: 'no', note: 'Weighted by severity — below 25% is treated far more seriously than 45%.' },
        { capability: 'Denials applying guidelines published after the member joined', auxilium: 'yes', alternative: 'no', note: 'Holding someone to rules they never agreed to.' },
        { capability: 'Related-party payments', auxilium: 'yes', alternative: 'no', note: 'Scaled by share of the pool. Small and disclosed is a note; large is a finding.' },
        { capability: 'Overhead exceeding sharing', auxilium: 'yes', alternative: 'no' },
        { capability: 'Claims past their turnaround commitment', auxilium: 'yes', alternative: 'no' },
      ],
    },
    {
      type: 'prose',
      heading: 'One calibration rule worth knowing',
      paragraphs: [
        'Rate-based findings require a minimum sample before they are treated as rates. "One of ' +
        'one denials had no guideline citation" is a 100% rate carrying almost no information, ' +
        'and without a floor a small ministry with a single lapse would score identically to an ' +
        'organization diverting most of its pool.',

        'Below that floor, Auxilium scores the count instead of the rate. A score that cannot ' +
        'distinguish a bad week from systemic diversion is one nobody will trust twice, and a ' +
        'compliance number people stop believing is worse than no number at all.',
      ],
    },
    {
      type: 'prose',
      heading: 'Bands',
      paragraphs: [
        'Healthy is 85 and above. Watch is 70 to 84. Concern is 50 to 69. Critical is below 50.',

        'The bands matter more than the exact number. A ministry at 72 and one at 78 are in the ' +
        'same situation and should do the same things about it; a ministry at 45 is in a ' +
        'different situation entirely. Treating the score as a precise ranking rather than a ' +
        'band invites exactly the kind of number-chasing that makes a metric useless.',
      ],
    },
    {
      type: 'prose',
      heading: 'What the score deliberately does not do',
      paragraphs: [
        'It does not accuse anyone of anything. Every finding describes something observable in ' +
        'the ledger or the claims record — a ratio, a run of months, a citation that does not ' +
        'hold up. Intent is not something software can assess, and a system that implied ' +
        'otherwise would be both wrong and dangerous.',

        'It does not compare you to other ministries. There is no percentile, no league table, ' +
        'and no benchmark against peers. Partly that is because reliable cross-ministry data does ' +
        'not exist in this category, and partly because a ratio that is merely better than ' +
        'average is not actually a defence if the average is poor.',

        'And it does not weight recency the way an operational dashboard would. A single bad ' +
        'month barely moves the score, because the trailing window exists precisely so that ' +
        'ordinary variation does not read as a crisis. The findings that move it most are ' +
        'patterns sustained across months.',
      ],
    },
    {
      type: 'prose',
      heading: 'How to use it',
      paragraphs: [
        'Look at the findings, not the number. The score is a summary; the findings are the work. ' +
        'Each one names the amounts and the members involved, and most can be resolved directly — ' +
        'assign the unowned claims, re-review the denials that cite nothing, decide the overdue ' +
        'appeals.',

        'Recompute after you act, and watch the specific finding disappear. A score that moves ' +
        'because you fixed something is the only kind worth tracking.',
      ],
    },
  ],
  related: ['claims-integrity', 'guides/share-ratio-explained', 'guides/explainable-scoring'],
};

const explainableScoring: MarketingPage = {
  slug: 'guides/explainable-scoring',
  kind: 'guide',
  category: 'Product',
  title: 'Why Auxilium does not use AI for scoring — Auxilium',
  h1: 'Why Auxilium does not use AI for scoring',
  description:
    'Every score in Auxilium is a sum of named, weighted reasons. Here is the reasoning behind ' +
    'that constraint, and where AI would be appropriate.',
  priority: 0.55,
  updated: '2026-07-25',
  blocks: [
    {
      type: 'prose',
      paragraphs: [
        'Auxilium scores members and ministries continuously. None of it uses a model. Every ' +
        'score is the sum of the weights of the rules that matched, and the reasons are always ' +
        'shown beside the number.',

        'This is a constraint we accept costs for, so it is worth explaining.',
      ],
    },
    {
      type: 'prose',
      heading: 'Three reasons',
      paragraphs: [
        'A score has to be arguable. When Auxilium says a member needs attention or a ministry ' +
        'has an integrity problem, somebody has to be able to disagree specifically — to point at ' +
        'a rule and say "that weight is wrong for us". A model can be interrogated but not ' +
        'argued with, and pastoral and financial decisions should be made on things people can ' +
        'contest.',

        'A score has to be reproducible years later. If a denial is challenged in 2029, you need ' +
        'to show what the system said in 2026 and why. Rules and a stored ledger reproduce ' +
        'exactly. A model that has been retrained since does not.',

        'And the reasons are the product. Knowing a member scores 82 is nearly useless. Knowing ' +
        'they score 82 because a hospitalization request is open, a follow-up is nine days ' +
        'overdue, and four outreach attempts went unanswered tells you what to do this morning.',
      ],
    },
    {
      type: 'prose',
      heading: 'Where AI would be appropriate',
      paragraphs: [
        'Drafting the note a staff member sends after reading the reasons. Summarizing a long ' +
        'case history for somebody picking it up cold. Suggesting which alias a strange ' +
        'spreadsheet column probably maps to.',

        'The dividing line is simple: AI can help a human read faster or write better. It should ' +
        'not move a number that determines whether a family gets called.',
      ],
    },
    {
      type: 'prose',
      heading: 'What "explainable" has to mean to be worth anything',
      paragraphs: [
        'The word gets used loosely, and most of what it is applied to would not survive a ' +
        'serious question from a board member. Three things have to be true before an ' +
        'explanation is doing real work.',

        'The explanation has to be the cause, not a story about the cause. A great deal of what ' +
        'is marketed as explainable AI produces a plausible narrative alongside a decision the ' +
        'narrative did not actually drive. If the reasons shown are reconstructed after the fact, ' +
        'they can be convincing and wrong at the same time, which is worse than showing nothing.',

        'The arithmetic has to be checkable by hand. If a staff member cannot add the stated ' +
        'contributions together and arrive at the number on screen, they are being asked to ' +
        'trust rather than to verify, and trust is exactly what erodes the first time the system ' +
        'is wrong about someone they know well.',

        'And the rule set has to be visible in full, not sampled. Showing the top three reasons ' +
        'for one score tells you nothing about what the system systematically ignores. Auxilium ' +
        'publishes every rule to administrators, including ones that did not fire.',
      ],
    },
    {
      type: 'prose',
      heading: 'Why this matters more in this category than most',
      paragraphs: [
        'Health care sharing ministries operate without the external checks that regulated ' +
        'insurers have. There is no state insurance commissioner reviewing decisions, no ' +
        'statutory appeals process, and no solvency examination.',

        'That absence puts unusual weight on internal accountability. When the only thing ' +
        'standing between a member and an arbitrary decision is the ministry\'s own process, ' +
        'that process has to be legible to the people running it — and to the member, if they ' +
        'ask.',

        'A scoring system nobody inside the organization can explain does not add ' +
        'accountability. It relocates the arbitrariness and gives it a number.',
      ],
    },
    {
      type: 'callout',
      tone: 'plain',
      heading: 'The honest cost',
      body:
        'Rules miss things a model would catch. A pattern nobody thought to encode stays ' +
        'invisible until someone notices and writes a rule for it. We think that is the right ' +
        'trade in this domain — but it is a real trade, not a free win, and anyone telling you ' +
        'their approach has no downside is selling something.',
    },
  ],
  related: ['narrative-relational-intelligence', 'guides/how-integrity-scoring-works'],
};

const csvImport: MarketingPage = {
  slug: 'guides/csv-import-that-survives-real-spreadsheets',
  kind: 'guide',
  category: 'Operations',
  title: 'Moving a member roster without losing anybody — Auxilium',
  h1: 'Moving a member roster without losing anybody',
  description:
    'Practical guidance on migrating years of member records out of spreadsheets and legacy ' +
    'systems: what breaks, what to check, and how to dedupe without merging two real people.',
  priority: 0.55,
  updated: '2026-07-25',
  blocks: [
    {
      type: 'prose',
      paragraphs: [
        'Every ministry has the same migration problem: years of member records spread across ' +
        'spreadsheets, an old admin system, and somebody\'s email. Moving that without losing ' +
        'anyone is unglamorous and genuinely difficult, and it is where most software projects ' +
        'in this category quietly stall.',

        'This is what actually goes wrong, whatever tool you use.',
      ],
    },
    {
      type: 'prose',
      heading: 'Dates are the first thing to break',
      paragraphs: [
        'A real roster will contain 1979-04-12, 3/2/1981, and "Jan 5 1968" in the same column. ' +
        'Worse, it will contain 3/2/1981 and 25/12/1988 — one unambiguous, one not. Anything ' +
        'importing US-format dates will silently swap a day and month somewhere in your file.',

        'Check dates of birth after any import by sorting on them and looking at both ends. ' +
        'Members born in the future or aged 120 are the ones a swapped format produces.',
      ],
    },
    {
      type: 'prose',
      heading: 'Deduplicate carefully, and prefer a duplicate to a merge',
      paragraphs: [
        'Match on email first — it is nearly always decisive. Phone is strong but households ' +
        'share landlines, so require the surname to agree before treating a phone match as the ' +
        'same person. Name plus date of birth is the fallback for the many rosters with no ' +
        'contact details at all.',

        'Be extremely wary of fuzzy name matching. Treating "Jon" and "John" as the same person ' +
        'catches some real duplicates and silently merges some real siblings. Merging two people ' +
        'who are different people destroys information you cannot recover; importing a duplicate ' +
        'creates work a human notices and fixes. Those are not comparable errors and should not ' +
        'be traded off as if they were.',
      ],
    },
    {
      type: 'prose',
      heading: 'Reject almost nothing',
      paragraphs: [
        'A roster is somebody\'s entire membership. Refusing to import a family because a zip ' +
        'code has a typo is worse than importing them with the problem recorded.',

        'The only row that genuinely cannot become a member is one with no name at all. ' +
        'Everything else — a malformed email, a short phone number, no household, an ' +
        'unrecognized relationship — should import with the issue attached so somebody can fix ' +
        'it with the member in front of them.',
      ],
    },
    {
      type: 'prose',
      heading: 'Preview before you commit, and keep the original',
      paragraphs: [
        'Never let an import write to your member list without a human seeing what it plans to ' +
        'do to every row. And keep the file exactly as it was uploaded — when the mapping turns ' +
        'out to be wrong three weeks later, you want to re-run against the original bytes rather ' +
        'than asking the ministry to export again.',

        'One more rule worth holding: in an update, a blank cell means "not provided", never ' +
        '"delete what you already know". Getting that backwards turns a routine refresh into ' +
        'data loss.',
      ],
    },
  ],
  related: ['how-it-works', 'claims-integrity'],
};

const claimsThatStall: MarketingPage = {
  slug: 'guides/why-claims-stall',
  kind: 'guide',
  category: 'Operations',
  title: 'Why claims stall, and how to stop it — Auxilium',
  h1: 'Why claims stall, and how to stop it',
  description:
    'The specific mechanics of a claim going quiet for months, and the process changes that ' +
    'prevent it — most of which are not software.',
  priority: 0.55,
  updated: '2026-07-25',
  blocks: [
    {
      type: 'prose',
      paragraphs: [
        'A family submits a claim. Months pass. Nobody at the ministry is acting in bad faith and ' +
        'nothing is technically broken, but the bill is unpaid and the family is now calling a ' +
        'reporter.',

        'This happens through a small number of specific mechanisms, and most of them are fixable ' +
        'without buying anything.',
      ],
    },
    {
      type: 'prose',
      heading: 'The claim was never workable',
      paragraphs: [
        'It arrived without a procedure code, or with a mistyped provider identifier, or with a ' +
        'summary statement instead of an itemized bill. It entered the queue anyway, and could ' +
        'not be actioned when it reached the top.',

        'The fix is to validate at intake and refuse what cannot be worked, telling the member ' +
        'immediately what is missing. A claim rejected in an hour with a clear list is a far ' +
        'better experience than one accepted and stalled for eleven weeks.',
      ],
    },
    {
      type: 'prose',
      heading: 'Nobody owned it',
      paragraphs: [
        'An unassigned claim is nobody\'s job. It is the cheapest failure to fix and among the ' +
        'most common: assign every claim to a named person at intake, even if that assignment is ' +
        'provisional.',
      ],
    },
    {
      type: 'prose',
      heading: 'It went into "waiting on the member" and never came out',
      paragraphs: [
        'This is the one worth watching hardest. Parking a claim pending information is ' +
        'legitimate, and it also stops most people\'s clocks — which makes it the perfect place ' +
        'for a claim to disappear.',

        'Give that status its own deadline. If a member has not responded in two weeks, that is ' +
        'the ministry\'s problem to chase, not theirs to remember. Very often they did send the ' +
        'document and it went to the wrong inbox.',
      ],
    },
    {
      type: 'prose',
      heading: 'Nobody had opened it at all',
      paragraphs: [
        'The worst version, because the member cannot tell it apart from being processed. They ' +
        'assume work is happening right up until they discover it never started.',

        'Track first response separately from resolution. A claim nobody has opened after a few ' +
        'days should escalate before its deadline, not after.',
      ],
    },
    {
      type: 'prose',
      heading: 'Tell members where they stand',
      paragraphs: [
        'Most of the anger in published complaints about this category is about opacity rather ' +
        'than speed. "We are still reviewing this, and you will hear from us by the 14th" is ' +
        'tolerable. Silence is not.',

        'A ministry that publishes a turnaround commitment, tracks it, and tells members when it ' +
        'is going to miss will absorb an occasional delay without losing anyone\'s trust.',
      ],
    },
  ],
  related: ['claims-integrity', 'narrative-relational-intelligence'],
};

export const GUIDES: MarketingPage[] = [
  shareRatioExplained,
  howIntegrityScoringWorks,
  explainableScoring,
  csvImport,
  claimsThatStall,
];

export { SOURCES };
