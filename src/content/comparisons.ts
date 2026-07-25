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
    'What a generic CRM does better, what it cannot model about sharing ministries, and how to ' +
    'decide between them.',
  priority: 0.5,
  updated: '2026-07-25',
  blocks: [
    {
      type: 'prose',
      paragraphs: [
        'Plenty of ministries run on a general-purpose CRM — a nonprofit platform, a church ' +
        'management system, or a sales CRM someone bent into shape. These are capable products ' +
        'with real advantages, and they beat Auxilium on several dimensions.',
      ],
    },
    {
      type: 'comparison',
      heading: 'Head to head',
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
        'yourself in a tool that has no opinions about any of them.',

        'If your pressing problem is communication, campaigns, and donor relationships, a good ' +
        'CRM is the better purchase and we would say so. If it is proving where the money went ' +
        'and making sure no claim goes quiet, that is the problem Auxilium was built for.',
      ],
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
    'Purpose-built ministry administration platforms are more complete than Auxilium in several ' +
    'areas. Here is the honest split.',
  priority: 0.5,
  updated: '2026-07-25',
  blocks: [
    {
      type: 'prose',
      paragraphs: [
        'There are established administration platforms built specifically for this market, some ' +
        'of them running large ministries for many years. They are more complete than Auxilium in ' +
        'several respects and it would be dishonest to pretend otherwise.',
      ],
    },
    {
      type: 'comparison',
      heading: 'Head to head',
      rows: [
        { capability: 'Billing, dues collection, and payment processing', auxilium: 'no', alternative: 'yes', note: 'Auxilium records contributions; it does not collect them.' },
        { capability: 'Member-facing self-service portal', auxilium: 'partial', alternative: 'yes', note: 'Auxilium ships a white-label portal shell, not a full member portal.' },
        { capability: 'Provider network management', auxilium: 'no', alternative: 'partial' },
        { capability: 'Years of operational hardening at scale', auxilium: 'no', alternative: 'yes', note: 'Auxilium is new. That is a real risk and you should weigh it.' },
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
        'Legacy platforms are built to administer a ministry: enroll members, collect dues, ' +
        'process claims. They do that well, and Auxilium does not do most of it.',

        'What they generally do not do is answer the question this category is now being asked ' +
        'from outside — can you demonstrate that member money reached member care, and that your ' +
        'decisions followed your own published rules? That is an accountability question rather ' +
        'than an administration one, and it is a different product.',

        'For many ministries the right answer is both: keep the platform that runs your ' +
        'operations, and add the layer that can prove they are being run properly.',
      ],
    },
    {
      type: 'callout',
      tone: 'caution',
      heading: 'The risk of choosing us',
      body:
        'Auxilium is new. It has not administered a ministry through a decade of edge cases, and ' +
        'an established platform has. If you need one system to do everything today, that is a ' +
        'genuine reason to choose one of them — and we would rather say that now than have you ' +
        'discover it in month three.',
    },
  ],
  related: ['claims-integrity', 'how-it-works'],
};

export const COMPARISONS: MarketingPage[] = [vsSpreadsheets, vsGenericCrm, vsLegacyAdmin];
