import type { MarketingPage } from './types';

/**
 * Comparison pages.
 *
 * A deliberate decision about who these compare against.
 *
 * The obvious move would be pages titled "Auxilium vs [named ministry]". We
 * are not doing that, for two reasons that point the same way.
 *
 * Large, reputable ministries are the *buyers* here — they have the most to
 * lose from this category's reputation and the most to gain from being able to
 * prove they are not part of it. Publishing attack pages about prospective
 * customers would be strategically self-defeating.
 *
 * And they are not competitors in any case. Auxilium competes with the
 * spreadsheet a ministry is using today, the generic CRM somebody adapted, and
 * the legacy administration systems built for this market. Those are the real
 * alternatives, so those are what these pages compare against — including
 * where they win.
 */

const vsSpreadsheets: MarketingPage = {
  slug: 'compare/spreadsheets',
  kind: 'comparison',
  title: 'Auxilium vs spreadsheets — Auxilium',
  h1: 'Auxilium vs the spreadsheets you have now',
  description:
    'An honest comparison against the tool most ministries actually run on, including the things ' +
    'spreadsheets genuinely do better.',
  priority: 0.5,
  updated: '2026-07-25',
  blocks: [
    {
      type: 'prose',
      paragraphs: [
        'Most health care sharing ministries run on spreadsheets, and that is not as foolish as ' +
        'software vendors like to imply. Spreadsheets are free, universally understood, infinitely ' +
        'flexible, and nobody needs training. A great many ministries have served members well for ' +
        'years using nothing else.',

        'Here is where they hold up and where they stop.',
      ],
    },
    {
      type: 'comparison',
      heading: 'Head to head',
      rows: [
        { capability: 'Cost', auxilium: 'no', alternative: 'yes', note: 'Spreadsheets win outright. They are free and Auxilium is not.' },
        { capability: 'Flexibility to model anything', auxilium: 'partial', alternative: 'yes', note: 'A spreadsheet will do whatever you want. Auxilium has opinions about households and claims.' },
        { capability: 'Anyone can use it without training', auxilium: 'partial', alternative: 'yes' },
        { capability: 'Ad-hoc analysis on a Tuesday afternoon', auxilium: 'partial', alternative: 'yes', note: 'Auxilium exports, but a pivot table is faster for a one-off question.' },
        { capability: 'Share ratio computed and benchmarked continuously', auxilium: 'yes', alternative: 'partial', note: 'You can compute it in a spreadsheet. Almost nobody does it monthly, every month, for years.' },
        { capability: 'Denials automatically checked against published guidelines', auxilium: 'yes', alternative: 'no' },
        { capability: 'Claims escalating on their own when they breach a commitment', auxilium: 'yes', alternative: 'no', note: 'The core gap. A spreadsheet cannot notice anything.' },
        { capability: 'Audit trail of who changed what, and when', auxilium: 'yes', alternative: 'no', note: 'Version history is not an audit trail.' },
        { capability: 'Two people working at once without overwriting each other', auxilium: 'yes', alternative: 'partial' },
        { capability: 'Producing a claims record on demand for a hospital', auxilium: 'yes', alternative: 'partial' },
      ],
    },
    {
      type: 'prose',
      heading: 'The honest summary',
      paragraphs: [
        'A spreadsheet is a record of what you decided. It cannot tell you what you have ' +
        'forgotten, and it will never interrupt you.',

        'That distinction stops mattering at a certain size and then matters enormously. If your ' +
        'ministry is small enough that one person holds every open case in their head, a ' +
        'spreadsheet is genuinely fine and you should keep your money. If nobody can name every ' +
        'open case from memory, the gap in that table is where members start going missing.',
      ],
    },
    {
      type: 'callout',
      tone: 'plain',
      heading: 'You do not have to leave them behind',
      body:
        'Auxilium imports the spreadsheets you already have, and exports back out. Nothing about ' +
        'adopting it requires abandoning a tool your team is fluent in.',
    },
  ],
  related: ['how-it-works', 'guides/csv-import-that-survives-real-spreadsheets'],
};

const vsGenericCrm: MarketingPage = {
  slug: 'compare/generic-crm',
  kind: 'comparison',
  title: 'Auxilium vs a general-purpose CRM — Auxilium',
  h1: 'Auxilium vs a general-purpose CRM',
  description:
    'A generic CRM is good at what a CRM is for. Here is what it costs to bend one into a ' +
    'sharing ministry, and how to decide between them.',
  priority: 0.5,
  updated: '2026-07-27',
  blocks: [
    {
      type: 'prose',
      paragraphs: [
        'Plenty of ministries run on a general-purpose CRM — a nonprofit platform, a church ' +
        'management system, or a sales CRM someone bent into shape. These are capable products, ' +
        'genuinely better than Auxilium at the things a CRM is for: campaigns, donors, events, ' +
        'and a connector for every other tool you own.',

        'None of that is the work of running a health share. The daily job is needs, claims, ' +
        'guidelines, and a ledger — and a CRM has no idea what any of those are. So somebody ' +
        'teaches it, one custom field at a time, and the ministry pays for that lesson every ' +
        'week thereafter.',
      ],
    },
    {
      type: 'table',
      heading: 'What it costs to bend one into shape',
      intro:
        'Every row is a thing a sharing ministry does daily, the nearest object a CRM has for ' +
        'it, and the work that gap creates. None of it is difficult. All of it is permanent.',
      columns: [
        { label: 'What you actually do' },
        { label: 'What the CRM makes you call it' },
        { label: 'What that costs, every week' },
      ],
      rows: [
        [
          'A family submits a medical need',
          'A deal or opportunity, with a dollar value and a pipeline stage',
          'Your dashboard reports a win rate on families’ medical bills. Staff learn to ignore the pipeline view, which is the view the CRM is built around.',
        ],
        [
          'Check whether a household is eligible',
          'Several contacts, tagged or linked, with the rules in somebody’s memory',
          'Eligibility genuinely lives at the household. Answering one question means opening four records and reasoning across them by hand, every time.',
        ],
        [
          'Decline a need under a published provision',
          'A status change, and a note field',
          'Nothing checks the provision cited against the document that was in force. Consistency is whoever happens to remember, and the gap only surfaces in a complaint.',
        ],
        [
          'Show where the money went',
          'Contributions in the processor, disbursements in a bank export',
          'They are joined in a spreadsheet, monthly, by one person. The share ratio is arithmetic that same person does by hand — and it is the number a journalist asks for.',
        ],
        [
          'Meet the turnaround you promised members',
          'A task with a due date',
          'A due date that passes is silent. Nobody is told, and the member cannot tell “being worked” from “lost”.',
        ],
        [
          'Record what a guideline says about a member',
          'Custom fields: waiting-period end, pre-existing flag, guideline version',
          'Typed by hand with nothing validating them. They drift, and a decision made on a drifted field is indistinguishable from one made correctly.',
        ],
      ],
      footnote:
        'The bill is not the licence. It is the standing tax on staff time, plus the fact that ' +
        'the whole arrangement lives in the head of whoever built it — so the real cost lands ' +
        'the month that person leaves.',
    },
    {
      type: 'prose',
      heading: 'The part that is worse than doing nothing',
      paragraphs: [
        'A spreadsheet at least looks like a spreadsheet. A configured CRM produces confident ' +
        'reports — a pipeline, a forecast, a conversion rate — built on objects that mean ' +
        'something else entirely. It is possible to run a board meeting off a chart that is ' +
        'measuring the wrong thing and looks completely authoritative doing it.',

        'And every guideline change is a re-configuration: fields to add, reports to rebuild, ' +
        'staff to re-teach which of the forty custom fields still matter and which are dead. ' +
        'That work never appears on a budget line, because it is absorbed by the people who ' +
        'were meant to be looking after members.',
      ],
    },
    {
      type: 'comparison',
      heading: 'Head to head',
      intro:
        'The first four rows are real CRM strengths and Auxilium does not attempt them. They ' +
        'are also, deliberately, not the daily work of a sharing ministry.',
      rows: [
        { capability: 'Breadth of general features', auxilium: 'no', alternative: 'yes', note: 'A mature CRM does far more things than Auxilium does.' },
        { capability: 'Integration ecosystem', auxilium: 'no', alternative: 'yes', note: 'Established platforms have hundreds of connectors. Auxilium has an API.' },
        { capability: 'Email and campaign tooling', auxilium: 'no', alternative: 'yes' },
        { capability: 'Donation and event management', auxilium: 'no', alternative: 'yes' },
        { capability: 'Households as the unit, not a contact tag', auxilium: 'yes', alternative: 'partial', note: 'Most CRMs model households as a grouping. Sharing eligibility genuinely lives there.' },
        { capability: 'Contributions and disbursements on one ledger with a share ratio', auxilium: 'yes', alternative: 'no' },
        { capability: 'Sharing guidelines as versioned, dated, checkable rules', auxilium: 'yes', alternative: 'no' },
        { capability: 'Denials validated against those guidelines', auxilium: 'yes', alternative: 'no' },
        { capability: 'Claim intake validation (procedure codes, provider NPI, itemized bill)', auxilium: 'yes', alternative: 'no' },
        { capability: 'Turnaround commitments that escalate automatically', auxilium: 'yes', alternative: 'partial', note: 'Generic workflow tools can approximate this. Nobody configures it before the first crisis.' },
      ],
    },
    {
      type: 'prose',
      heading: 'How to actually decide',
      paragraphs: [
        'A CRM tracks relationships. Sharing ministries have a second problem sitting on top of ' +
        'that: a fiduciary one. Money comes in against a promise, goes out against published ' +
        'rules, and you have to be able to show the relationship between the two.',

        'That is not a CRM shortcoming — it is simply not what a CRM is for, and configuring one ' +
        'to do it means building the ledger, the guideline model, and the escalation logic ' +
        'yourself, in a tool that has no opinions about any of them and will not tell you when ' +
        'your version of them is wrong.',

        'If your pressing problem is communication, campaigns, and donor relationships, a good ' +
        'CRM is the better purchase and we would say so. Plenty of ministries should run both. ' +
        'If the problem is that needs stall where nobody sees them and nobody can show where the ' +
        'money went, that is the one Auxilium was built for — and it arrives already knowing ' +
        'what a household, a guideline, and a share ratio are.',
      ],
    },
    {
      type: 'callout',
      tone: 'plain',
      heading: 'Keep the CRM',
      body:
        'This is not usually a replacement. The relationships, the newsletter, and the giving ' +
        'history can stay exactly where they are — what moves across is the sharing workflow, ' +
        'which is the part the CRM was never shaped to hold.',
    },
  ],
  related: ['claims-integrity', 'how-it-works'],
};

const vsLegacyAdmin: MarketingPage = {
  slug: 'compare/legacy-administration-systems',
  kind: 'comparison',
  title: 'Auxilium vs legacy administration systems — Auxilium',
  h1: 'Auxilium vs legacy administration systems',
  description:
    'Established platforms administer a ministry. Auxilium administers it and proves it was ' +
    'administered properly. Here is the split.',
  priority: 0.5,
  updated: '2026-07-27',
  blocks: [
    {
      type: 'prose',
      paragraphs: [
        'There are established administration platforms built specifically for this market, some ' +
        'of them running large ministries for many years. They cover more ground than Auxilium ' +
        'in a few places, and this page says where.',

        'The difference worth deciding on is not the feature count. These platforms were built ' +
        'to run a ministry — enroll members, collect dues, process claims — in an era when ' +
        'nobody was being asked to show their work. The question the category now gets asked ' +
        'from outside is a different one, and it is the one Auxilium answers.',
      ],
    },
    {
      type: 'comparison',
      heading: 'Head to head',
      rows: [
        { capability: 'Billing, dues collection, and payment processing', auxilium: 'yes', alternative: 'yes', note: 'Contributions settle into the ministry’s own Stripe account, never ours, and are recorded and reconciled daily.' },
        { capability: 'Moving members to a new processor without re-enrollment', auxilium: 'yes', alternative: 'no', note: 'Stored cards and verified mandates transfer processor to processor. Billing dates are preserved, so nobody is charged twice or skipped.' },
        { capability: 'Member-facing self-service portal', auxilium: 'yes', alternative: 'yes', note: 'Bills, health disclosure, and a plain account of what a member may ask for when a need is declined.' },
        { capability: 'Provider network access and negotiated PPO rates', auxilium: 'no', alternative: 'yes', note: 'Established platforms carry network relationships. Auxilium reprices against Medicare rates instead, which is a different approach rather than a smaller one.' },
        { capability: 'Staffed claims administration as a service', auxilium: 'no', alternative: 'yes', note: 'Some platforms come with people who process the work. Auxilium is software your team runs.' },
        { capability: 'Share ratio benchmarked against the ACA medical-loss floor', auxilium: 'yes', alternative: 'no' },
        { capability: 'Guideline-consistency checking on every denial', auxilium: 'yes', alternative: 'no' },
        { capability: 'Retroactive-guideline detection', auxilium: 'yes', alternative: 'no' },
        { capability: 'Published, arguable scoring rules', auxilium: 'yes', alternative: 'no' },
        { capability: 'Reference-based repricing against Medicare rates', auxilium: 'yes', alternative: 'partial' },
        { capability: 'Member neglect detection across the whole roster', auxilium: 'yes', alternative: 'no' },
      ],
    },
    {
      type: 'prose',
      heading: 'The honest summary',
      paragraphs: [
        'Legacy platforms are built to administer a ministry, and they do it well. Auxilium does ' +
        'that work too — contributions, claims, guidelines, the portal — and adds the part they ' +
        'were never asked for.',

        'That part is the question this category now gets from regulators, journalists, and ' +
        'plaintiffs’ attorneys: can you demonstrate that member money reached member care, and ' +
        'that every decision followed your own published rules on the date it was made? An ' +
        'administration system records what happened. It does not check itself.',

        'Where a platform genuinely covers ground we do not — a provider network, staffed claims ' +
        'processing — the right answer may well be both: keep what runs your operations, and add ' +
        'the layer that can show they are being run properly.',
      ],
    },
    {
      type: 'callout',
      tone: 'plain',
      heading: 'You do not have to switch to find out',
      body:
        'Auxilium reads the roster and the ledger you already have. Run it alongside whatever ' +
        'administers your ministry today, on your real numbers, and see what it finds before ' +
        'anything moves. Nothing about starting requires leaving.',
    },
  ],
  related: ['claims-integrity', 'how-it-works'],
};

export const COMPARISONS: MarketingPage[] = [vsSpreadsheets, vsGenericCrm, vsLegacyAdmin];
