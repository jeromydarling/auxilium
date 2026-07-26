import type { KbArticle } from './types';

/**
 * The staff knowledge base: how to run this software, and how to make a
 * decision that holds up afterwards.
 *
 * Written to be read by someone in the middle of a task, not someone studying.
 * Every article leads with the answer, and procedures say *why* a step matters
 * — a step with no stated reason is the first one skipped when a queue is long.
 */

const UPDATED = '2026-07-26';

export const STAFF_ARTICLES: KbArticle[] = [
  // ── Getting started ────────────────────────────────────────────────────────
  {
    slug: 'staff/first-week',
    audience: 'staff',
    category: 'Getting started',
    title: 'Your first week in Auxilium',
    summary:
      'Import your roster, look at the triage board, and log one real contact. Everything else ' +
      'can wait — those three things are what turn the software from a database into something ' +
      'that notices people.',
    synonyms: ['new user', 'onboarding', 'where do I start', 'setup', 'getting started', 'first time'],
    appPath: '/app',
    body: [
      {
        paragraphs: [
          'Auxilium is built around one job: making sure nobody in your community gets missed. ' +
          'Everything else in it — claims, the ledger, the share ratio — exists to serve that or ' +
          'to let you prove you are doing it.',
          'You do not need to configure anything before it is useful. Scoring runs as soon as ' +
          'members exist, so the board is populated the moment your first import commits.',
        ],
      },
    ],
    steps: [
      {
        title: 'Import your roster',
        body: 'Settings → Imports → upload whatever spreadsheet you already have.',
        because:
          'The parser is written for real exports, not clean ones, and nothing is written to your ' +
          'members until you approve the preview. There is no way to break anything here.',
      },
      {
        title: 'Open the triage board',
        body: 'It ranks members by what changed, not by who wrote in.',
        because:
          'The families who need you most are usually the ones who went quiet. A board sorted by ' +
          'inbound requests shows you everyone except them.',
      },
      {
        title: 'Log one contact',
        body: 'Open any member, record a call or a visit you actually made.',
        because:
          'Logging contact is not filing — it is the input that tells the compass this family has ' +
          'been reached, and quiets a signal that would otherwise keep asking.',
      },
      {
        title: 'Read the rule set',
        body: 'Settings → Rules shows every rule, its weight, and why it exists.',
        because:
          'You are going to disagree with a score eventually. Knowing where the numbers come from ' +
          'is what lets you argue with a specific rule instead of distrusting the whole thing.',
      },
    ],
    related: ['staff/triage-board', 'staff/import-roster', 'staff/how-scoring-works'],
    updated: UPDATED,
  },

  // ── NRI ────────────────────────────────────────────────────────────────────
  {
    slug: 'staff/how-scoring-works',
    audience: 'staff',
    category: 'Narrative Relational Intelligence',
    title: 'How a score is calculated, and how to argue with it',
    summary:
      'A score is the sum of the weights of every rule that matched. There is no model and no ' +
      'learned coefficient — you can add the number up by hand, and if you disagree you can point ' +
      'at the specific rule.',
    synonyms: [
      'why is this number', 'where does the score come from', 'is this AI', 'algorithm',
      'disagree with score', 'score wrong', 'explain score', 'nri score',
    ],
    appPath: '/app/settings/rules',
    body: [
      {
        paragraphs: [
          'Every score you see is arithmetic. A set of rules looks at plain facts about a member — ' +
          'was there a hospitalization, how long since anyone made contact, is a claim past its due ' +
          'date — and each rule that matches contributes a fixed number of points. The score is the ' +
          'total. The reasons appear beside it with their exact weights.',
          'This is a deliberate constraint rather than a limitation we have not got round to ' +
          'removing. A system that cannot be argued with does not get trusted with pastoral care, ' +
          'and a number nobody can check is a number people quietly stop believing.',
        ],
      },
      {
        heading: 'What to do when a score looks wrong',
        paragraphs: [
          'First, read the reasons. Nine times out of ten the score is correct and the surprise is ' +
          'that a fact you knew informally was never recorded — a member told someone at church ' +
          'that they were fine, but no contact was logged, so the system still sees silence.',
          'If the score is right but the priority is wrong for your situation, dismiss the signal. ' +
          'That means "I have seen this and handled it", not "never show me this member again": it ' +
          'comes back if the facts get materially worse.',
          'If you think a rule itself is wrong, that is a conversation about the rule, and it is a ' +
          'legitimate one. The weights are a statement of what your ministry thinks matters, and ' +
          'they are visible so they can be challenged.',
        ],
      },
    ],
    related: ['staff/four-directions', 'staff/dismissing-signals', 'staff/triage-board'],
    updated: UPDATED,
  },
  {
    slug: 'staff/four-directions',
    audience: 'staff',
    category: 'Narrative Relational Intelligence',
    title: 'The four directions, and why a member can carry several',
    summary:
      'Cura is care, Onus is a case being handled badly, Familia is household complexity, Fides is ' +
      'whether you are still in touch. They are scored separately because the combination is the ' +
      'useful part.',
    synonyms: [
      'cura', 'onus', 'familia', 'fides', 'what do the colours mean', 'directions',
      'compass', 'what does urgent mean', 'bands',
    ],
    body: [
      {
        paragraphs: [
          'A single "risk score" would tell you a member needs attention without telling you what ' +
          'kind, and the kind is the entire decision. High Onus with low Cura is a billing problem ' +
          'and needs a case owner. High Onus *and* high Cura is a family in crisis and needs a ' +
          'phone call before anything else.',
        ],
      },
      {
        heading: 'What each one means in practice',
        paragraphs: [
          'Cura — care. Hospitalization, bereavement, an overdue pastoral follow-up. Somebody is ' +
          'carrying something heavy. The response is a person, not a form.',
          'Onus — case weight. A claim past its due date, a denial with no guideline behind it, ' +
          'coordination nobody owns. The response is to move the case and tell the member when.',
          'Familia — household complexity. Dependents, caregiving, a household in transition. The ' +
          'response is to look at the household as a unit rather than the individual who happened ' +
          'to surface.',
          'Fides — trust and communication. Unanswered outreach, incomplete onboarding, a ' +
          'relationship going quiet before renewal. The response is to re-establish contact before ' +
          'anything administrative happens.',
        ],
      },
      {
        heading: 'Bands, and how ties break',
        paragraphs: [
          'Clear is 0–24, watch is 25–49, attend is 50–74, urgent is 75–100. The board ranks by ' +
          'band and then by direction.',
          'When two members score the same, Cura outranks Onus. The hurting person comes before ' +
          'the expensive case. That is a moral choice written into the sort order, and it is worth ' +
          'knowing it is there.',
        ],
      },
    ],
    related: ['staff/how-scoring-works', 'staff/triage-board'],
    updated: UPDATED,
  },
  {
    slug: 'staff/triage-board',
    audience: 'staff',
    category: 'Narrative Relational Intelligence',
    title: 'Working the triage board',
    summary:
      'The board answers "who should I call today, and why them". Work from the top, log what you ' +
      'do, and dismiss what you have handled.',
    synonyms: ['dashboard', 'who to call', 'daily list', 'command center', 'today', 'work queue'],
    appPath: '/app',
    body: [
      {
        paragraphs: [
          'The board is ordered by band and then by direction, which means the top of it is not ' +
          'the loudest member — it is the one whose situation changed most and who is least likely ' +
          'to chase you about it.',
          'A realistic pattern is to work the urgent band each morning, glance at attend, and let ' +
          'watch accumulate until you have time. What you should not do is treat an empty inbox as ' +
          'an empty board; they measure completely different things.',
        ],
      },
      {
        heading: 'Today’s nudges',
        paragraphs: [
          'The nudge list is a short derived set of things worth doing now, rather than a dashboard ' +
          'that asks you to work out the priority yourself. It is deliberately short. A list of ' +
          'forty things is a list nobody starts.',
        ],
      },
    ],
    related: ['staff/four-directions', 'staff/dismissing-signals', 'staff/logging-contact'],
    updated: UPDATED,
  },
  {
    slug: 'staff/dismissing-signals',
    audience: 'staff',
    category: 'Narrative Relational Intelligence',
    title: 'Dismissing a signal, and when it comes back',
    summary:
      'Dismissing means "I have seen this and handled it". The signal returns if the member moves ' +
      'into a worse band or the score jumps by 15 or more.',
    synonyms: ['hide', 'snooze', 'remove from list', 'already handled', 'why did this come back', 'resurface'],
    body: [
      {
        paragraphs: [
          'Dismissal is not suppression. A dismissed signal comes back when the facts get ' +
          'materially worse, because someone who dismissed "member is quiet" should absolutely be ' +
          'shown "member is quiet and now hospitalized".',
          'Two things bring it back: moving into a higher band, or a jump of fifteen points or ' +
          'more. Small drift does not, which is what stops the board becoming noise.',
          'Dismissals live in the database rather than your browser, so what you handled at the ' +
          'office is still handled at home, and your colleague can see that you dealt with it.',
        ],
      },
    ],
    related: ['staff/how-scoring-works', 'staff/triage-board'],
    updated: UPDATED,
  },

  // ── Imports ────────────────────────────────────────────────────────────────
  {
    slug: 'staff/import-roster',
    audience: 'staff',
    category: 'Roster and members',
    title: 'Importing a roster from a spreadsheet',
    summary:
      'Upload whatever you have. Columns map themselves, nothing is written until you approve the ' +
      'preview, and a blank cell never deletes what you already know.',
    synonyms: [
      'csv', 'spreadsheet', 'excel', 'upload members', 'bulk add', 'import failed',
      'duplicate members', 'xlsx',
    ],
    appPath: '/app/imports',
    body: [
      {
        paragraphs: [
          'The parser was written for real ministry exports rather than clean ones. Byte-order ' +
          'marks, mixed date formats, embedded newlines inside a cell, ragged rows, duplicate ' +
          'headers, and columns called things like "Mbr #" all work.',
          'XLSX is not supported yet — export to CSV first. It is on the roadmap and the pipeline ' +
          'behind the parser is already format-agnostic.',
        ],
      },
      {
        heading: 'How duplicates are handled',
        paragraphs: [
          'Matching runs on email, then phone plus surname, then name plus date of birth. A match ' +
          'updates the existing member rather than creating a second one.',
          'There is deliberately no fuzzy name matching. It would catch some real duplicates and ' +
          'silently merge some real siblings, and merging two people who are different people is ' +
          'far worse than importing one duplicate you notice later.',
        ],
      },
      {
        heading: 'What gets rejected',
        paragraphs: [
          'Almost nothing. Only a row with no name at all is an error. Everything else imports ' +
          'with a warning attached, because refusing a family over a typo’d postcode is worse than ' +
          'importing them and flagging it.',
        ],
      },
    ],
    steps: [
      { title: 'Upload the file', body: 'Imports → New import.', because: 'The original file is kept, so any later question about what was imported can be answered against what was actually sent.' },
      { title: 'Check the column mapping', body: 'Auxilium guesses; you confirm.', because: 'A wrong column is far cheaper to fix here than after 4,000 rows have landed.' },
      { title: 'Read the preview counts', body: 'Ready, matched, warned, blocked.', because: 'The warned rows are the ones worth a glance — they imported, but something looked odd.' },
      { title: 'Commit', body: 'Only now is anything written.', because: 'The commit works from the exact rows you approved, not from a re-parse that might have drifted.' },
    ],
    related: ['staff/first-week', 'staff/households'],
    updated: UPDATED,
  },
  {
    slug: 'staff/households',
    audience: 'staff',
    category: 'Roster and members',
    title: 'Households, primary contacts, and why it matters for scoring',
    summary:
      'The household is the unit that matters for eligibility and most care conversations. ' +
      'Household complexity scores on the primary contact only, so mark one.',
    synonyms: ['family', 'dependents', 'spouse', 'primary contact', 'household size', 'who is the head'],
    body: [
      {
        paragraphs: [
          'Eligibility, share amounts, and most real conversations happen at the household rather ' +
          'than the individual, so the data model treats it that way instead of bolting families ' +
          'together afterwards.',
          'Household complexity — size, dependents, caregiving, recent change — scores on the ' +
          'primary contact rather than on everyone. Scoring it per-person put eight rows on the ' +
          'board for one family and ranked nothing.',
          'If no primary contact is marked, the household rules fall back to scoring everyone. ' +
          'That is the safe failure — a duplicated signal beats a complex family nobody sees — but ' +
          'it makes your board noisier, so marking a primary is worth the minute it takes.',
        ],
      },
    ],
    related: ['staff/import-roster', 'staff/four-directions'],
    updated: UPDATED,
  },

  // ── Claims ─────────────────────────────────────────────────────────────────
  {
    slug: 'staff/claim-lifecycle',
    audience: 'staff',
    category: 'Claims',
    title: 'What happens to a need from submission to sharing',
    summary:
      'Submitted, acknowledged, in review, shared. Every claim gets a due date at submission, and ' +
      'the clock pauses while you are genuinely waiting on the member.',
    synonyms: ['claim status', 'stages', 'workflow', 'need lifecycle', 'how long', 'turnaround', 'sla'],
    appPath: '/app/claims',
    body: [
      {
        paragraphs: [
          'Each claim gets a due date the moment it is submitted, from your ministry’s configured ' +
          'turnaround. The tracker the member sees shows the same dates you do, which removes an ' +
          'entire category of phone call.',
        ],
      },
      {
        heading: 'The clock, and the one thing to know about it',
        paragraphs: [
          'The clock pauses while a claim is waiting on the member for information. That is fair — ' +
          'you cannot be held to a deadline for something you are not holding.',
          'But that status has its own separate ageing rule, because "waiting on member" is exactly ' +
          'where claims go to die. Excluding it entirely would create a quiet incentive to park ' +
          'things there, so a claim sitting in it too long escalates anyway.',
          'A claim nobody has *opened* escalates before its deadline rather than after. From the ' +
          'member’s side, an unacknowledged claim is indistinguishable from a lost one, and they ' +
          'assume the former until it is too late to assume anything.',
        ],
      },
    ],
    related: ['staff/denying-a-claim', 'staff/appeals', 'member/claim-stages'],
    updated: UPDATED,
  },
  {
    slug: 'staff/denying-a-claim',
    audience: 'staff',
    category: 'Claims',
    title: 'Declining to share a need, defensibly',
    summary:
      'A decline needs both a reason code and the specific guideline provision that authorizes it. ' +
      'Auxilium warns loudly if the citation does not hold up, but it will not stop you.',
    synonyms: [
      'deny', 'denial', 'decline', 'reject', 'not eligible', 'turn down', 'refuse claim',
      'guideline reference', 'reason code',
    ],
    body: [
      {
        paragraphs: [
          'The single most damaging pattern in this category is a ministry marketing generous ' +
          'coverage and then declining on a basis members were never shown. Requiring a provision ' +
          'reference on every decline is what makes that impossible to do accidentally.',
          'Auxilium checks four things and flags each: a decline citing no provision at all, one ' +
          'citing a provision that does not exist, one citing a provision that does not authorize ' +
          'the reason you gave, and one applying a guideline version that took effect *after* the ' +
          'member joined.',
          'That last one is worth dwelling on. The guideline that binds a member is the one in ' +
          'force when they joined, unless they accepted a later version. Applying a newer ' +
          'restriction retroactively is the kind of thing that reads very badly in a deposition ' +
          'and very badly to the member.',
        ],
      },
      {
        heading: 'Why it warns instead of blocking',
        paragraphs: [
          'Blocking would push staff toward picking whatever provision the form accepts, which ' +
          'destroys the honest record and teaches everyone to game the field. A recorded warning ' +
          'keeps the truth: this decision was made, this citation was weak, and somebody knew.',
          'If you see the warning, the right move is almost always to stop and check the guideline ' +
          'rather than proceed. It is far cheaper to reconsider now than after an appeal.',
        ],
      },
    ],
    steps: [
      { title: 'Find the provision first, then write the decision', body: 'Not the other way round.', because: 'A decision looking for justification tends to find one. A provision looking at the facts tends to be correct.' },
      {
        title: 'Check which guideline version binds this need',
        body:
          'Whichever your ministry\u2019s published policy says governs \u2014 the version in force when ' +
          'the member joined, when the care happened, when the request was filed, or when you ' +
          'received the bills. Ministries genuinely differ, so use yours rather than the one you ' +
          'remember from somewhere else.',
        because:
          'Applying a later restriction than your own policy allows is the single most common ' +
          'serious error here, and it is what a regulator reads first.',
      },
      { title: 'Write the reason in language the member will understand', body: 'Not just the code.', because: 'A member who cannot understand why will appeal, complain, or leave — often all three.' },
      { title: 'Tell them how to appeal, in the same message', body: 'Include the deadline.', because: 'An appeal right nobody is told about is not a right.' },
    ],
    related: ['staff/appeals', 'staff/guidelines', 'member/if-your-need-is-declined'],
    updated: UPDATED,
  },
  {
    slug: 'staff/appeals',
    audience: 'staff',
    category: 'Claims',
    title: 'Running an appeal',
    summary:
      'An appeal gets its own clock, separate from the original claim, so it cannot inherit the ' +
      'silence that produced it.',
    synonyms: ['appeal', 'reconsider', 'dispute', 'second review', 'overturn', 'member disagrees'],
    body: [
      {
        paragraphs: [
          'An appeal is tracked as its own item with its own due date. That is deliberate: an ' +
          'appeal folded into the original claim inherits whatever inattention caused the appeal.',
          'The most useful thing you can do with an appeal is treat it as new information rather ' +
          'than a re-run of the same decision. Most successful appeals turn on a document nobody ' +
          'had, not on a change of mind.',
        ],
      },
      {
        heading: 'If you overturn a decline',
        paragraphs: [
          'Say plainly what changed. "On review, the itemized bill shows this was diagnostic rather ' +
          'than preventive, which our guidelines share" is a sentence that builds trust. A silent ' +
          'reversal builds none, and leaves the member unsure whether it will happen again.',
        ],
      },
    ],
    related: ['staff/denying-a-claim', 'member/how-to-appeal'],
    updated: UPDATED,
  },
  {
    slug: 'staff/repricing',
    audience: 'staff',
    category: 'Claims',
    title: 'Repricing a bill against a reference rate',
    summary:
      'Chargemaster prices bear little relation to cost. Repricing against the Medicare allowable ' +
      'commonly saves a substantial share on facility bills, and every proposal records its basis.',
    synonyms: ['negotiate', 'reduce bill', 'discount', 'medicare rate', 'too expensive', 'reprice', 'savings'],
    body: [
      {
        paragraphs: [
          'A hospital’s list price is close to fiction — it is a starting number that almost no ' +
          'payer actually pays. Repricing means proposing a defensible figure with a stated basis ' +
          'rather than simply paying the number on the letter.',
          'Because the proposal records its basis, it reads as a negotiation rather than a refusal ' +
          'to pay. That distinction matters to a provider’s billing office and it matters to the ' +
          'member standing between you.',
          'If there is no reference rate on file for a code, Auxilium declines to reprice rather ' +
          'than guessing. An early version priced those claims to zero and reported the entire ' +
          'billed amount as a saving, which would have had the ministry proposing nothing at all ' +
          'to a provider.',
        ],
      },
    ],
    related: ['staff/claim-lifecycle', 'member/medical-bill-rights'],
    updated: UPDATED,
  },
  {
    slug: 'staff/guidelines',
    audience: 'staff',
    category: 'Claims',
    title: 'Sharing guidelines: versions, and which one binds a member',
    summary:
      'Guidelines are versioned and dated, and each provision declares which decline reasons it ' +
      'actually authorizes. Which version binds a need is set by your ministry\u2019s own published '
      + 'policy \u2014 there is no category standard, and all four readings are in real use.',
    synonyms: ['guidelines', 'policy', 'rules document', 'version', 'which version applies', 'grandfathered'],
    body: [
      {
        paragraphs: [
          'Every provision records the reason codes it authorizes. That field is what makes the ' +
          'consistency checks possible: without it, "we declined under section 4.2" cannot be ' +
          'verified by anything except a human reading section 4.2.',
          'When you publish a new version, existing members are not automatically moved to it. ' +
          'Which version binds whom is a question with a real answer, and applying a newer ' +
          'restriction to someone who joined under an older one is both a governance failure and, ' +
          'in a dispute, the fact that decides it.',
        ],
      },
    ],
    related: ['staff/denying-a-claim', 'member/which-guidelines-apply-to-me'],
    updated: UPDATED,
  },

  // ── Integrity ──────────────────────────────────────────────────────────────
  {
    slug: 'staff/share-ratio',
    audience: 'staff',
    category: 'Financial integrity',
    title: 'The share ratio, and what a bad one is telling you',
    summary:
      'Of every dollar members contributed, how many cents reached their medical costs. Measured ' +
      'against a medical-loss floor sharing ministries are exempt from — which is exactly what ' +
      'makes clearing it mean something.',
    synonyms: [
      'mlr', 'medical loss ratio', 'where did the money go', 'percentage shared', 'ratio',
      'transparency', '80 percent', 'benchmark',
    ],
    appPath: '/app/integrity',
    body: [
      {
        paragraphs: [
          'The ratio is contributions in against sharing out, over a trailing window. It is the ' +
          'single number a board member, a journalist, or a regulator will ask for, and being able ' +
          'to produce it on a Tuesday rather than in six weeks is most of the value.',
          'It is compared against the ACA medical-loss floor. That floor binds health insurance ' +
          'issuers, and a sharing ministry is not one — so you are not held to it, which is the ' +
          'entire point of measuring against it. Clearing a bar you are not held to says ' +
          'something no marketing page can.',
        ],
      },
      {
        heading: 'The signals that matter most',
        paragraphs: [
          'A month with contributions in and nothing shared out is the loudest thing this system ' +
          'produces. The query is built by union rather than by join specifically so that month ' +
          'can never disappear.',
          'Related-party payments are broken out separately, because that is where diversion hides. ' +
          'The API will refuse a related-party disbursement that does not state the relationship.',
          'Rate-based findings need at least five observations before a rate is treated as a rate. ' +
          '"One of one denials" is a 100% rate carrying almost no information, and without that ' +
          'floor a small ministry with a single lapse would score like a collapse.',
        ],
      },
    ],
    related: ['staff/ledger', 'member/where-does-my-money-go'],
    updated: UPDATED,
  },
  {
    slug: 'staff/ledger',
    audience: 'staff',
    category: 'Financial integrity',
    title: 'Recording contributions and disbursements',
    summary:
      'Money in and money out on one timeline. The category on a disbursement decides which side ' +
      'of the share ratio it lands on, so it is worth getting right.',
    synonyms: ['ledger', 'accounting', 'record payment', 'disbursement', 'expenses', 'bookkeeping'],
    appPath: '/app/integrity',
    body: [
      {
        paragraphs: [
          'A contribution belongs to the sharing month it is *for*, not the day it arrived. A late ' +
          'March payment covering February belongs to February when that month’s ratio is computed.',
          'Disbursement categories are not cosmetic. Administrative costs and shared medical costs ' +
          'sit on opposite sides of the ratio, so miscategorising is how a ratio quietly becomes ' +
          'wrong in your own favour — which is the direction nobody notices.',
          'Any payment to an affiliated entity must state the relationship. This is not bureaucracy: ' +
          'the documented failures in this category almost all run through related parties, and a ' +
          'ministry that discloses them routinely has an answer ready when asked.',
        ],
      },
    ],
    related: ['staff/share-ratio'],
    updated: UPDATED,
  },

  // ── Care ───────────────────────────────────────────────────────────────────
  {
    slug: 'staff/logging-contact',
    audience: 'staff',
    category: 'Care',
    title: 'Logging contact, and why it is not paperwork',
    summary:
      'Recording an outreach is the input that tells the compass this family has been reached. ' +
      'Unlogged contact is, to the system, indistinguishable from silence.',
    synonyms: ['log a call', 'record visit', 'note', 'contact history', 'follow up', 'i already called them'],
    body: [
      {
        paragraphs: [
          'The most common complaint about any system like this is "it is telling me to call ' +
          'someone I called last week". That is always true and always fixable: the call was real, ' +
          'the record was not.',
          'Thirty seconds of logging removes a member from your board, tells your colleague the ' +
          'family has been reached, and — when someone asks in a year whether this household was ' +
          'supported — is the only evidence that they were.',
        ],
      },
    ],
    related: ['staff/prayer-requests', 'staff/triage-board'],
    updated: UPDATED,
  },
  {
    slug: 'staff/prayer-requests',
    audience: 'staff',
    category: 'Care',
    title: 'Prayer requests and follow-up dates',
    summary:
      'Every care item carries an owner and a follow-up date. An item nobody owns is an item ' +
      'nobody does, and an overdue one scores.',
    synonyms: ['prayer', 'care request', 'pastoral', 'follow up date', 'who owns this'],
    appPath: '/app/prayer',
    body: [
      {
        paragraphs: [
          'The owner field is not administrative tidiness. A request assigned to "the team" is ' +
          'assigned to nobody, and the failure is silent — everyone assumes someone else has it.',
          'An overdue follow-up raises Cura for that member. This is the mechanism by which a ' +
          'promise made in a meeting turns into something the software will keep reminding you ' +
          'about until it is either done or deliberately closed.',
        ],
      },
    ],
    related: ['staff/logging-contact'],
    updated: UPDATED,
  },

  // ── Admin ──────────────────────────────────────────────────────────────────
  {
    slug: 'staff/who-can-see-what',
    audience: 'staff',
    category: 'Administration',
    title: 'Roles, and who can see the ledger',
    summary:
      'Financial and integrity screens are restricted to owners and admins. Care and claims work ' +
      'is available to staff. Everything consequential is written to the audit log.',
    synonyms: ['permissions', 'roles', 'access', 'who can see', 'restrict', 'admin', 'audit log'],
    appPath: '/app/settings/users',
    body: [
      {
        paragraphs: [
          'The ledger and the integrity report are board-level information and are limited to ' +
          'owners and admins. Member care, claims, and the triage board are open to staff, because ' +
          'restricting those would defeat the purpose of the product.',
          'Eligibility checks, declines, imports, and administrative changes are all written to an ' +
          'audit log. That record exists for the member’s benefit as much as yours: someone told ' +
          '"likely shared" and then declined can point at what was said and when.',
        ],
      },
    ],
    related: ['staff/share-ratio'],
    updated: UPDATED,
  },
  {
    slug: 'staff/when-something-is-not-configured',
    audience: 'staff',
    category: 'Administration',
    title: 'What happens when part of the platform is switched off',
    summary:
      'Auxilium degrades loudly rather than silently. Scoring never depends on an AI key, imports ' +
      'still commit without background queues, and a broken rate limiter lets people in rather ' +
      'than locking them out.',
    synonyms: ['not configured', 'error', 'broken', 'ai not working', 'billing off', 'degraded', 'outage'],
    body: [
      {
        paragraphs: [
          'Without an AI key, narrative triage notes say "not configured" and nothing else changes. ' +
          'Scoring is rule-based and is never AI-dependent, so the number and its reasons are ' +
          'identical either way.',
          'Without background queues, imports commit inline and signals recompute inline. Slower, ' +
          'logged, and correct.',
          'Without payment configuration, billing features report that they are off. The ' +
          'contributions ledger, the share ratio, scoring, and claims are untouched — you can run ' +
          'the entire operational product with no payment processing at all.',
          'If the login rate limiter’s store is unavailable, logins are allowed through. A broken ' +
          'limiter must never lock a ministry out on the day it matters most.',
        ],
      },
    ],
    related: ['staff/first-week'],
    updated: UPDATED,
  },

  // ── Vocabulary ─────────────────────────────────────────────────────────────
  {
    slug: 'staff/sharing-vocabulary',
    audience: 'staff',
    category: 'Getting started',
    title: 'The category’s vocabulary, and the traps in it',
    summary:
      'Ministries use different words for the same concept and — far more dangerously — the same ' +
      'shape of word for genuinely different mechanics. The member-responsibility amount is ' +
      'per-need at some ministries and per-year at others, and confusing the two misquotes a ' +
      'family by thousands of dollars.',
    synonyms: [
      'IUA', 'AHP', 'AUA', 'PRA', 'personal responsibility', 'initial unshareable amount',
      'annual household portion', 'annual unshared amount', 'qualifying amount', 'co-share',
      'deductible', 'terminology', 'glossary', 'what does that mean', 'jargon',
      'member commitment', 'publishing', 'need', 'proration', 'save to share',
    ],
    body: [
      {
        heading: 'There is no shared vocabulary, and that is the hazard',
        paragraphs: [
          'The amount a member pays before any sharing happens goes by at least seven names ' +
          'across the ministries publishing guidelines today: Initial Unshareable Amount (IUA), ' +
          'Annual Household Portion (AHP), Annual Unshared Amount (AUA), Personal Responsibility ' +
          '(PR), Primary Responsibility Amount (PRA), Individual Sharing Amount (ISA), and ' +
          'Member Commitment. None of them is "deductible", and the avoidance is deliberate — ' +
          'sharing is not insurance and the guidelines are careful not to borrow its words.',
          'Learning the synonyms is the easy half. The half that costs money is that these are ' +
          'not all the same shape.',
        ],
      },
      {
        heading: 'Three shapes, not one',
        paragraphs: [
          'Per need or per incident: the member owes the amount again for each separate medical ' +
          'event. This is the IUA model, and it is almost always paired with an annual cap on ' +
          'the number of times it can be charged, plus a symptom-free interval before the same ' +
          'condition counts as a new event. Without those two qualifiers the model would be ' +
          'ruinous, so if someone quotes you a per-need amount and cannot tell you the cap, the ' +
          'quote is incomplete.',
          'Per household per year: one amount, reset annually on the membership anniversary ' +
          'rather than on 1 January. This is the AHP and AUA model.',
          'Two stacked thresholds: an annual per-unit responsibility and a separate per-incident ' +
          'qualifying amount that a bill must exceed before it is considered at all. At least one ' +
          'large ministry runs both simultaneously with different values.',
          'Someone moving between ministries hears the same reassuring sentence — "you pay the ' +
          'first amount, then sharing begins" — and it means something structurally different ' +
          'each time. When you are answering a member, name the shape, not just the number.',
        ],
      },
      {
        heading: 'Which guideline version governs is itself unsettled',
        paragraphs: [
          'Four different published rules are in force across the category: the version in effect ' +
          'when the member enrolled, when the care was delivered, when the request was submitted, ' +
          'and when the ministry logged the bills. Some ministries add a grandfathering ratchet ' +
          'so that anything shareable when a need began stays shareable; at least one explicitly ' +
          'applies amendments to needs already open.',
          'This is why Auxilium asks your ministry to declare its rule rather than assuming one. ' +
          'The integrity finding for a retroactively applied guideline is scored against the date ' +
          'your own published policy makes controlling — otherwise it would flag a ministry every ' +
          'time it followed its own rules correctly, and a rule that fires on correct behaviour ' +
          'trains everyone to ignore the report.',
        ],
      },
      {
        heading: 'Words that mean something specific',
        paragraphs: [
          'Publishing. Its origin is statutory, not operational: state insurance exemption statutes ' +
          'describe a ministry as publishing bills or assigning them to others for payment, and the ' +
          'required "this is not insurance" notices quote that language. Some ministries have since ' +
          'adopted it operationally to mean announcing an approved bill to the membership.',
          'Co-share. The category’s word for the member’s percentage after the initial amount. Not ' +
          '"coinsurance", for the same reason "deductible" is avoided. Several ministries share ' +
          '100% and have no co-share at all.',
          'Proration. When shares received in a month fall short of needs submitted, some ' +
          'ministries pay each need a percentage rather than paying some in full and others not at ' +
          'all. A federal review of five ministries in 2023 found four that prorate. It is a real ' +
          'and underdisclosed possibility for a member facing a very large bill.',
          'Need. The near-universal noun for a submitted medical event, but the compound forms ' +
          'differ — Needs Case, sharing request, Need Request — and forms and portals are named ' +
          'after whichever one the ministry uses.',
        ],
      },
      {
        heading: 'Two habits worth keeping',
        paragraphs: [
          'Use your ministry’s own term with members, not the generic one. A member who has read ' +
          'the guidelines is looking for the word that appears in them, and translating on their ' +
          'behalf makes them wonder whether you are describing the same thing.',
          'When a member is comparing ministries or has just switched, ask which shape their ' +
          'previous responsibility amount was before answering anything about cost. That single ' +
          'question prevents most of the misquotes in this area.',
        ],
      },
    ],
    related: ['staff/guidelines', 'staff/denying-a-claim', 'staff/first-week'],
    updated: UPDATED,
  },
];
