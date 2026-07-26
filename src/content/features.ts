/**
 * The feature registry.
 *
 * Every capability Auxilium has, in one list, tagged so the features page can
 * group and filter without a second source of truth.
 *
 * Two rules, both load-bearing:
 *
 *   1. **Status is honest.** Anything not finished is marked `planned` and says
 *      so on the page. A features page that lists intentions as capabilities is
 *      the same failure this product exists to catch elsewhere — a promise the
 *      record does not support. A test asserts planned items are visibly
 *      labelled.
 *
 *   2. **No capability implies a guarantee.** Auxilium surfaces, measures, and
 *      explains. It does not prevent fraud and does not certify compliance, and
 *      no entry here may imply otherwise.
 */

export type FeatureCategory =
  | 'Members & households'
  | 'Roster import'
  | 'Narrative Relational Intelligence'
  | 'Claims'
  | 'Financial integrity'
  | 'Care & prayer'
  | 'Platform';

export interface FeatureEntry {
  title: string;
  body: string;
  category: FeatureCategory;
  /** Free-form tags for filtering and scent. */
  tags: string[];
  status: 'shipped' | 'planned';
}

export const FEATURE_CATEGORIES: FeatureCategory[] = [
  'Narrative Relational Intelligence',
  'Financial integrity',
  'Claims',
  'Roster import',
  'Members & households',
  'Care & prayer',
  'Platform',
];

export const FEATURES: FeatureEntry[] = [
  // ── NRI ───────────────────────────────────────────────────────────────────
  {
    title: 'The four-direction compass',
    body:
      'Cura, Onus, Familia, and Fides scored separately, because a member can carry several at ' +
      'once. High Onus with low Cura is a billing problem. High Onus and high Cura is a family ' +
      'in crisis, and the difference should be visible at a glance.',
    category: 'Narrative Relational Intelligence',
    tags: ['scoring', 'triage', 'core'],
    status: 'shipped',
  },
  {
    title: 'Scores you can add up by hand',
    body:
      'A score is the sum of the weights of every rule that matched. No model, no training data, ' +
      'no learned coefficient. The reasons appear beside the number with their exact weights, so ' +
      'a staff member who distrusts a score can check it and either agree or point at the rule ' +
      'they disagree with.',
    category: 'Narrative Relational Intelligence',
    tags: ['explainability', 'scoring', 'trust'],
    status: 'shipped',
  },
  {
    title: 'The rule set is a product page, not a debug screen',
    body:
      'Every rule, its weight, and its rationale are published to administrators. A system that ' +
      'cannot be argued with does not get trusted with pastoral care.',
    category: 'Narrative Relational Intelligence',
    tags: ['explainability', 'admin', 'trust'],
    status: 'shipped',
  },
  {
    title: 'Bands and triage ranking',
    body:
      'Clear, watch, attend, urgent. The board ranks by band and then by direction, and ties ' +
      'break toward Cura — when scores are equal the hurting person outranks the expensive case. ' +
      'That is a moral choice written into the code, not an accident of sorting.',
    category: 'Narrative Relational Intelligence',
    tags: ['triage', 'scoring'],
    status: 'shipped',
  },
  {
    title: 'Dismissal that knows when to come back',
    body:
      'Dismissing a signal means "I have seen this and handled it", not "never show me this ' +
      'member again". It returns when the facts get materially worse — a higher band, or a ' +
      '15-point jump. Someone who dismissed "member is quiet" should absolutely be shown ' +
      '"member is quiet and now hospitalized".',
    category: 'Narrative Relational Intelligence',
    tags: ['workflow', 'triage'],
    status: 'shipped',
  },
  {
    title: 'Household complexity counted once',
    body:
      'Size, dependents, caregiving, and recent change are properties of a household, so they ' +
      'score on the primary contact rather than on every member. Scoring them per-person put ' +
      'eight rows on the board for one family and ranked nothing.',
    category: 'Narrative Relational Intelligence',
    tags: ['households', 'scoring'],
    status: 'shipped',
  },
  {
    title: 'A deliberate interruption budget',
    body:
      'The compass may open itself at most once per calendar day, and only behind a ' +
      'high-confidence action. Software that pops open for routine work gets closed reflexively ' +
      '— and is then closed reflexively on the morning a member is in an ICU.',
    category: 'Narrative Relational Intelligence',
    tags: ['ux', 'workflow'],
    status: 'shipped',
  },
  {
    title: 'Cross-device working state',
    body:
      'Dismissals, cooldowns, and orientation progress live in the database rather than in one ' +
      'browser, so what a staff member handled at the office is still handled at home.',
    category: 'Narrative Relational Intelligence',
    tags: ['workflow', 'sync'],
    status: 'shipped',
  },
  {
    title: 'Signals recomputed off the request path',
    body:
      'Scoring runs from a queue with no request context, against the same pure rules the tests ' +
      'exercise. Given the same facts and the same timestamp the output is byte-identical, ' +
      'forever.',
    category: 'Narrative Relational Intelligence',
    tags: ['architecture', 'scoring'],
    status: 'shipped',
  },
  {
    title: 'Household-level signals',
    body:
      'Scoring the household directly, rather than through the primary-contact proxy, so the ' +
      'board can show a family as one row with its members underneath.',
    category: 'Narrative Relational Intelligence',
    tags: ['households', 'scoring'],
    status: 'planned',
  },
  {
    title: 'Score history over time',
    body:
      'Signals are a point-in-time reading today. Retaining them would answer the question a ' +
      'director actually has: is this ministry getting better at follow-up?',
    category: 'Narrative Relational Intelligence',
    tags: ['reporting', 'scoring'],
    status: 'planned',
  },

  // ── Integrity ─────────────────────────────────────────────────────────────
  {
    title: 'The share ratio',
    body:
      'Of every dollar members contributed, how many cents reached their medical costs — ' +
      'measured against the ACA medical-loss floor that health care sharing ministries are ' +
      'statutorily exempt from. Clearing a bar you are not held to says something no marketing ' +
      'page can.',
    category: 'Financial integrity',
    tags: ['transparency', 'reporting', 'core'],
    status: 'shipped',
  },
  {
    title: 'Contributions and disbursements on one timeline',
    body:
      'Money in and money out, stitched by union rather than joined — so a month with ' +
      'contributions and no distributions can never be lost to an inner join. That month is the ' +
      'loudest signal this system produces.',
    category: 'Financial integrity',
    tags: ['ledger', 'transparency'],
    status: 'shipped',
  },
  {
    title: 'Related-party payments broken out',
    body:
      'Diversion hides in payments to affiliated entities, so the API refuses a related-party ' +
      'disbursement that does not state the relationship.',
    category: 'Financial integrity',
    tags: ['ledger', 'governance'],
    status: 'shipped',
  },
  {
    title: 'Versioned, dated sharing guidelines',
    body:
      'Each provision declares which denial reason codes it actually authorizes. That field is ' +
      'load-bearing: the signature pattern in this category is marketing "covered from day one" ' +
      'and then denying on precisely that basis.',
    category: 'Financial integrity',
    tags: ['guidelines', 'governance'],
    status: 'shipped',
  },
  {
    title: 'Denial consistency findings',
    body:
      'Four checks, each the week-it-happens version of a deposition exhibit: a denial citing no ' +
      'provision, one citing a provision that does not exist, one citing a provision that does ' +
      'not authorize the stated reason, and one applying a guideline that took effect after the ' +
      'member joined.',
    category: 'Financial integrity',
    tags: ['guidelines', 'auditing', 'core'],
    status: 'shipped',
  },
  {
    title: 'Every rule carries its provenance',
    body:
      'Each integrity rule records the documented failure it traces to. When a ministry disputes ' +
      'a finding, the answer should be a specific thing that happened to a real community, not ' +
      'an abstraction.',
    category: 'Financial integrity',
    tags: ['transparency', 'auditing'],
    status: 'shipped',
  },
  {
    title: 'A minimum sample floor',
    body:
      '"One of one denials" is a 100% rate carrying almost no information. Rate-based rules need ' +
      'five observations before a rate is treated as a rate, so a small ministry with a single ' +
      'lapse does not score like a collapse.',
    category: 'Financial integrity',
    tags: ['calibration', 'scoring'],
    status: 'shipped',
  },
  {
    title: 'Opt-in public transparency page',
    body:
      'A published endpoint showing the share ratio and how it was calculated, with no member ' +
      'data in it. Opt-in, because publishing is a decision a ministry makes rather than one ' +
      'made for it.',
    category: 'Financial integrity',
    tags: ['transparency', 'public'],
    status: 'shipped',
  },

  // ── Claims ────────────────────────────────────────────────────────────────
  {
    title: 'A clock on every claim',
    body:
      'A turnaround target puts a due date on each claim at submission. The clock pauses while ' +
      'waiting on the member — but the waiting-on-member status has its own ageing rule, because ' +
      'that status is exactly where claims go to die and excluding it would create an incentive ' +
      'to park them there.',
    category: 'Claims',
    tags: ['sla', 'workflow', 'core'],
    status: 'shipped',
  },
  {
    title: 'Unacknowledged claims escalate early',
    body:
      'A claim nobody has opened escalates before its deadline, not after. The member cannot tell ' +
      '"being worked" from "lost", and assumes the former until it is too late.',
    category: 'Claims',
    tags: ['sla', 'workflow'],
    status: 'shipped',
  },
  {
    title: 'Intake validation with a real NPI check',
    body:
      'Provider identifiers are validated with the actual check-digit algorithm, not a length ' +
      'test, alongside procedure and diagnosis code formats. Incomplete intake is the quiet ' +
      'reason claims stall weeks later.',
    category: 'Claims',
    tags: ['validation', 'data-quality'],
    status: 'shipped',
  },
  {
    title: 'Denials require a reason and a citation',
    body:
      'Both a reason code and a guideline reference. It warns loudly — but does not block — when ' +
      'the citation does not hold up, because blocking would push staff to pick whatever ' +
      'provision the form accepts, and a recorded warning keeps the honest record instead.',
    category: 'Claims',
    tags: ['guidelines', 'governance', 'core'],
    status: 'shipped',
  },
  {
    title: 'Reference-based repricing',
    body:
      'Chargemaster prices bear little relation to cost. Repricing against the Medicare allowable ' +
      'commonly saves a substantial share on facility claims. Every proposal records its basis, ' +
      'so it reads as a negotiation rather than a refusal to pay — and with no reference rate on ' +
      'file it declines to reprice rather than inventing a number.',
    category: 'Claims',
    tags: ['repricing', 'cost'],
    status: 'shipped',
  },
  {
    title: 'Eligibility answered before the bill',
    body:
      'Checked against the guideline version that actually binds that member and the ministry’s ' +
      'real denial history. Deliberately never promissory — "likely" is the strongest word it may ' +
      'use about a future claim, and every check is written to the audit log.',
    category: 'Claims',
    tags: ['eligibility', 'member-facing', 'core'],
    status: 'shipped',
  },
  {
    title: 'Appeals with their own clock',
    body:
      'An appeal is tracked separately with its own due date, so it cannot inherit the silence ' +
      'that produced it.',
    category: 'Claims',
    tags: ['sla', 'workflow'],
    status: 'shipped',
  },
  {
    title: 'A tracker the member can read',
    body:
      'Submitted, acknowledged, in review, shared — with the date each step happened and the date ' +
      'the next one is due.',
    category: 'Claims',
    tags: ['member-facing', 'sla'],
    status: 'shipped',
  },

  // ── Import ────────────────────────────────────────────────────────────────
  {
    title: 'A parser written for real exports',
    body:
      'Byte-order marks, mixed date formats, embedded newlines, ragged rows, duplicate headers, ' +
      '"Mbr #" as a column name. A hand-written RFC 4180 parser, because messy files need ' +
      'forgiving behaviour that most libraries make hard to reach.',
    category: 'Roster import',
    tags: ['csv', 'data-quality', 'core'],
    status: 'shipped',
  },
  {
    title: 'Columns that map themselves',
    body:
      'An alias table first, content sniffing as a fallback. Adding an alias for a ministry whose ' +
      'file does not auto-map is a one-line change.',
    category: 'Roster import',
    tags: ['csv', 'automation'],
    status: 'shipped',
  },
  {
    title: 'Validation that rejects as little as possible',
    body:
      'Only a nameless row is an error. Everything else imports with a warning attached, because ' +
      'refusing a family over a typo’d postcode is worse than importing them and flagging it.',
    category: 'Roster import',
    tags: ['validation', 'data-quality'],
    status: 'shipped',
  },
  {
    title: 'Duplicate matching that will not merge siblings',
    body:
      'Email, then phone plus surname, then name plus date of birth. Fuzzy name matching is ' +
      'deliberately absent: it would catch some real duplicates and silently merge some real ' +
      'siblings, and merging two people who are different people is far worse than importing one ' +
      'duplicate a human later notices.',
    category: 'Roster import',
    tags: ['dedupe', 'data-quality', 'core'],
    status: 'shipped',
  },
  {
    title: 'Nothing is written until a human commits',
    body:
      'The preview is persisted, so the commit works from the exact rows that were approved — not ' +
      'from a re-parse that may have drifted. A blank cell means "not provided", never "delete ' +
      'what you know".',
    category: 'Roster import',
    tags: ['safety', 'csv'],
    status: 'shipped',
  },
  {
    title: 'Commits that resume instead of duplicating',
    body:
      'Each row is marked committed in the same batch that writes its member, so an interrupted ' +
      'or redelivered import picks up where it stopped.',
    category: 'Roster import',
    tags: ['reliability', 'csv'],
    status: 'shipped',
  },
  {
    title: 'The source file is kept',
    body:
      'The original upload is retained, so any question about what was imported can be answered ' +
      'against the file that was actually sent.',
    category: 'Roster import',
    tags: ['auditing', 'csv'],
    status: 'shipped',
  },
  {
    title: 'XLSX import',
    body:
      'Spreadsheet files without a CSV export step. The pipeline downstream of parsing is already ' +
      'format-agnostic, so this is one function at a seam that already exists.',
    category: 'Roster import',
    tags: ['xlsx', 'roadmap'],
    status: 'planned',
  },

  // ── Members ───────────────────────────────────────────────────────────────
  {
    title: 'Households as the unit that matters',
    body:
      'Eligibility, share amounts, and most care conversations happen at the household, not the ' +
      'individual — so the data model treats it that way rather than bolting families together ' +
      'afterwards.',
    category: 'Members & households',
    tags: ['households', 'core'],
    status: 'shipped',
  },
  {
    title: 'Rosters that stay fast when they are large',
    body:
      'Keyset pagination rather than offsets, so page 400 of a roster costs what page 1 costs.',
    category: 'Members & households',
    tags: ['performance', 'scale'],
    status: 'shipped',
  },
  {
    title: 'Money as integer cents, everywhere',
    body:
      'There is no floating-point currency column and there never should be. A share amount that ' +
      'drifts by a cent is a member ringing to ask why their statement is wrong.',
    category: 'Members & households',
    tags: ['correctness', 'money'],
    status: 'shipped',
  },
  {
    title: 'Nothing is really deleted',
    body:
      'Soft deletes throughout, so a removal is recoverable and the record of what was known ' +
      'stays intact.',
    category: 'Members & households',
    tags: ['safety', 'auditing'],
    status: 'shipped',
  },
  {
    title: 'Documents and member files',
    body:
      'Uploads stored against a member or a household, with prefixes that keep one ministry’s ' +
      'files categorically separate from another’s.',
    category: 'Members & households',
    tags: ['files', 'storage'],
    status: 'shipped',
  },
  {
    title: 'Full create and edit forms',
    body:
      'The API supports every mutation and the read screens are complete, but the interface ' +
      'currently offers forms only for contact logging and follow-ups. The remaining forms are ' +
      'plain form work against settled contracts.',
    category: 'Members & households',
    tags: ['ui', 'roadmap'],
    status: 'planned',
  },

  // ── Care ──────────────────────────────────────────────────────────────────
  {
    title: 'Prayer requests with an owner and a date',
    body:
      'A care item nobody owns is a care item nobody does. Every request carries a person and a ' +
      'follow-up date, and an overdue one scores.',
    category: 'Care & prayer',
    tags: ['care', 'workflow', 'core'],
    status: 'shipped',
  },
  {
    title: 'Contact logging that feeds the score',
    body:
      'Recording an outreach is not filing — it is the input that tells the compass this family ' +
      'has been reached, and quiets a signal that would otherwise keep asking.',
    category: 'Care & prayer',
    tags: ['care', 'scoring'],
    status: 'shipped',
  },
  {
    title: 'Today’s nudges',
    body:
      'A short, derived list of what is worth doing now, rather than a dashboard that asks the ' +
      'reader to work out the priority themselves.',
    category: 'Care & prayer',
    tags: ['workflow', 'triage'],
    status: 'shipped',
  },
  {
    title: 'A daily digest of urgent members',
    body:
      'Signals are computed and displayed but never pushed. Most missed follow-ups happen because ' +
      'nobody opened the dashboard, which makes delivery the highest-value thing not yet built.',
    category: 'Care & prayer',
    tags: ['notifications', 'roadmap'],
    status: 'planned',
  },

  // ── Platform ──────────────────────────────────────────────────────────────
  {
    title: 'Every query is tenant-scoped',
    body:
      'There is no exception. Multi-tenancy enforced at the query rather than trusted to a ' +
      'filter someone remembers to add.',
    category: 'Platform',
    tags: ['security', 'multi-tenant', 'core'],
    status: 'shipped',
  },
  {
    title: 'An audit log with real entries in it',
    body:
      'Eligibility checks, denials, imports, and administrative actions are written down. A ' +
      'member told "likely shared" and then denied can point at the record.',
    category: 'Platform',
    tags: ['auditing', 'governance'],
    status: 'shipped',
  },
  {
    title: 'Degradation that is loud, not silent',
    body:
      'Without an AI key, triage notes say "not configured" and scoring is unaffected — it is ' +
      'never AI-dependent. Without queues, imports commit inline. Each fallback is logged rather ' +
      'than hidden.',
    category: 'Platform',
    tags: ['reliability', 'architecture'],
    status: 'shipped',
  },
  {
    title: 'A rate limiter that fails open',
    body:
      'If the limiter’s store is unavailable, logins are allowed. A broken limiter must never ' +
      'lock a ministry out on the day it matters.',
    category: 'Platform',
    tags: ['security', 'reliability'],
    status: 'shipped',
  },
  {
    title: 'Production refuses to run unsigned',
    body:
      'Without a session secret, development uses a fixed key with a loud warning and production ' +
      'refuses to issue sessions at all.',
    category: 'Platform',
    tags: ['security'],
    status: 'shipped',
  },
  {
    title: 'One deployable, edge-run',
    body:
      'The API, the application, the public site, and the background consumers are one Worker ' +
      'running next to the database, so there is no second service to keep in sync.',
    category: 'Platform',
    tags: ['architecture', 'performance'],
    status: 'shipped',
  },
  {
    title: 'White-label shell and CMS pages',
    body:
      'Per-ministry branding, plus pages and blocks with draft and publish states and a public ' +
      'read endpoint.',
    category: 'Platform',
    tags: ['cms', 'branding'],
    status: 'shipped',
  },
  {
    title: 'A visual block editor',
    body:
      'Pages, blocks, draft and publish, and the public read endpoint all exist. The builder for ' +
      'arranging them does not yet.',
    category: 'Platform',
    tags: ['cms', 'roadmap'],
    status: 'planned',
  },
  {
    title: 'Tokened team invites',
    body:
      'Administrators create users with a password today. An invitation where the invitee sets ' +
      'their own is the right pattern and is not built yet.',
    category: 'Platform',
    tags: ['admin', 'security', 'roadmap'],
    status: 'planned',
  },
];

export function featuresByCategory(category: FeatureCategory): FeatureEntry[] {
  return FEATURES.filter((f) => f.category === category);
}

export function shippedCount(): number {
  return FEATURES.filter((f) => f.status === 'shipped').length;
}

/** Every distinct tag, most-used first — used for the filter row. */
export function allTags(): string[] {
  const counts = new Map<string, number>();
  for (const f of FEATURES) {
    for (const t of f.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
}
