import type { KbArticle } from './types';

/**
 * The member knowledge base.
 *
 * Written for someone holding a bill they cannot pay, which shapes every
 * decision in here. Answers lead with the answer. Steps say why. Nothing
 * reassures where reassurance is not warranted, because a member told "don't
 * worry, it'll be covered" and then declined has been harmed twice — once by
 * the decision and once by the confidence.
 *
 * Three rules, all tested:
 *   • No article promises an outcome. "Likely" is the strongest word available.
 *   • No article calls sharing insurance, because it is not, and the difference
 *     is the single most consequential thing a member can misunderstand.
 *   • Anything asserting what the law is carries a source.
 */

const UPDATED = '2026-07-26';

export const MEMBER_ARTICLES: KbArticle[] = [
  // ── What this is ───────────────────────────────────────────────────────────
  {
    slug: 'member/what-sharing-is',
    audience: 'member',
    category: 'Understanding your membership',
    title: 'What health care sharing is, and how it differs from insurance',
    summary:
      'A sharing ministry is a community that voluntarily shares one another’s medical costs ' +
      'according to published guidelines. It is not insurance, it is not regulated as insurance, ' +
      'and understanding that difference is the most useful thing you can know as a member.',
    synonyms: [
      'is this insurance', 'what is a health share', 'how does this work', 'difference from insurance',
      'am I covered', 'is it a policy', 'what did I join',
    ],
    body: [
      {
        paragraphs: [
          'When you submit a medical bill, you are asking a community to share it under a set of ' +
          'published guidelines. Those guidelines describe what the community has agreed to share, ' +
          'what it has agreed not to, and under what conditions. They are a real and binding ' +
          'description of the arrangement — but they are guidelines, not an insurance policy, and ' +
          'sharing ministries are generally not regulated by state insurance departments.',
          'That has two consequences worth holding in mind together. The first is that this model ' +
          'can do things insurance cannot: negotiate a bill on your behalf without a network, ' +
          'share a cost because it is the right thing rather than because a contract compels it, ' +
          'and keep administrative costs low enough that far more of each dollar reaches actual ' +
          'medical bills.',
          'The second is that the protections you may be used to do not automatically apply. There ' +
          'is no state guarantee fund behind a sharing ministry, and if a need is not shared, the ' +
          'escalation paths available to you are different from the ones an insured patient would ' +
          'use. Knowing which paths *do* exist, before you need them, is worth more than any ' +
          'amount of reassurance.',
        ],
      },
      {
        heading: 'What this means practically',
        paragraphs: [
          'Providers will usually treat you as self-pay. That is not a problem — in several ways ' +
          'it is an advantage — but it changes what you should ask for and when. Ask about ' +
          'self-pay pricing before a procedure, ask for an itemized bill afterwards, and do not ' +
          'assume a hospital will bill the ministry directly unless it has agreed to.',
          'Read your guidelines once, properly, before you need them. The two sections that decide ' +
          'most outcomes are the one about pre-existing conditions and the one about what you have ' +
          'to do *before* a planned procedure. Both are far easier to comply with in advance than ' +
          'to argue about afterwards.',
        ],
      },
    ],
    sources: [
      {
        label: 'Georgetown CHIR — Health Care Sharing Ministry Data Point to Problems',
        url: 'https://chir.georgetown.edu/health-care-sharing-ministry-data-point-to-problems-for-consumers-regulators/',
        authority: 'research',
      },
    ],
    related: ['member/before-a-procedure', 'member/which-guidelines-apply-to-me', 'member/claim-stages'],
    updated: UPDATED,
  },

  // ── The process ────────────────────────────────────────────────────────────
  {
    slug: 'member/claim-stages',
    audience: 'member',
    category: 'Your needs and bills',
    title: 'What happens after you submit a bill',
    summary:
      'Submitted, acknowledged, in review, then shared or declined. Your tracker shows the date ' +
      'each stage happened and the date the next one is due, so you never have to guess whether ' +
      'anything is moving.',
    synonyms: [
      'status', 'what happens next', 'how long does it take', 'where is my claim', 'stages',
      'is anyone looking at this', 'stuck', 'no response', 'taking forever',
    ],
    appPath: '/app/claims',
    body: [
      {
        paragraphs: [
          'Every need you submit gets a due date immediately, and you can see it. The single most ' +
          'common source of anxiety here is not slowness — it is not knowing whether anything is ' +
          'happening at all, which from the outside looks identical to being forgotten.',
          'Acknowledgement is the stage worth watching. It means a person has opened your ' +
          'submission. If a need has been sitting unacknowledged, that is the point to make a ' +
          'phone call, not after the due date has passed.',
        ],
      },
      {
        heading: 'If the clock seems to have stopped',
        paragraphs: [
          'The review clock pauses while the ministry is waiting on information from you. That is ' +
          'usually fair, but it also means an unanswered request for a document can quietly stall ' +
          'everything. If your need is in a "waiting on you" state, find out exactly what is ' +
          'missing and send it, even if you have sent it before.',
          'If your need is past its due date and nobody has contacted you, say so in writing and ' +
          'ask for a specific date. A written request creates a record, and a record is what makes ' +
          'any later escalation possible.',
        ],
      },
    ],
    related: ['member/what-to-send', 'member/if-your-need-is-declined', 'member/keeping-records'],
    updated: UPDATED,
  },
  {
    slug: 'member/what-to-send',
    audience: 'member',
    category: 'Your needs and bills',
    title: 'What to send with a medical bill, and what to keep',
    summary:
      'An itemized bill with billing codes, not a statement showing a balance. Most delays and a ' +
      'good share of declines come down to a document nobody had rather than a decision anyone ' +
      'made.',
    synonyms: [
      'what documents', 'itemized bill', 'paperwork', 'what do I need to submit', 'receipt',
      'they need more information', 'codes', 'eob',
    ],
    body: [
      {
        paragraphs: [
          'The difference between a statement and an itemized bill matters more than almost ' +
          'anything else in this process. A statement says "you owe $14,280". An itemized bill ' +
          'lists each procedure with its billing code, date, and charge — and only the itemized ' +
          'version can actually be reviewed, repriced, or defended.',
          'You are entitled to ask any provider for an itemized bill, and it is a routine request. ' +
          'Ask for it in writing, keep the request, and keep the reply.',
        ],
      },
    ],
    steps: [
      {
        title: 'Ask for an itemized bill with billing codes',
        body: 'Not the summary statement. The version with CPT or HCPCS codes and dates of service.',
        because: 'It is the only version that can be checked line by line, and errors on medical bills are common enough to be worth checking for.',
      },
      {
        title: 'Get the discharge summary or visit notes if there was a hospital stay',
        body: 'Ask medical records, not billing.',
        because: 'When a decline turns on whether something was diagnostic or preventive, or when a condition began, the clinical note is what settles it.',
      },
      {
        title: 'Keep every letter and note every call',
        body: 'Date, who you spoke to, what they said.',
        because: 'A contemporaneous note of a phone call is evidence. A memory of one, six months later, is not.',
      },
      {
        title: 'Submit everything at once rather than in pieces',
        body: 'A partial submission restarts the waiting.',
        because: 'Each round trip for a missing document can add weeks, and the clock often pauses while they wait on you.',
      },
    ],
    related: ['member/claim-stages', 'member/keeping-records'],
    updated: UPDATED,
  },
  {
    slug: 'member/before-a-procedure',
    audience: 'member',
    category: 'Your needs and bills',
    title: 'What to do before a planned procedure',
    summary:
      'Tell the ministry first, in writing, and ask them to confirm in writing. Nearly every ' +
      'avoidable decline for a planned procedure traces back to a notification requirement nobody ' +
      'read until afterwards.',
    synonyms: [
      'surgery', 'planned', 'pre-notification', 'do I need approval', 'before I go',
      'scheduled procedure', 'will this be covered', 'pre-authorization',
    ],
    body: [
      {
        paragraphs: [
          'Most sharing guidelines require you to notify the ministry before a non-emergency ' +
          'procedure, and many make sharing conditional on it. This is the single highest-value ' +
          'thing you can do as a member, and it costs one email.',
          'Ask two questions in that email: whether anything about this procedure would fall ' +
          'outside the guidelines, and what they need from you. Then keep the reply. An answer in ' +
          'writing is worth a great deal later; the same answer given on the phone is worth very ' +
          'little.',
          'A ministry cannot promise in advance that a need will be shared, and you should be ' +
          'wary of one that does — the facts are not all known until the bill exists. What it can ' +
          'tell you is whether anything obvious stands in the way, and that is genuinely useful.',
        ],
      },
      {
        heading: 'Ask the provider too',
        paragraphs: [
          'Tell the provider you will be self-paying and ask what the procedure costs. Ask ' +
          'specifically whether the surgeon, the facility, the anaesthetist, and any pathology are ' +
          'billed separately, because they usually are and the separate bills are what people are ' +
          'not expecting.',
        ],
      },
    ],
    related: ['member/what-sharing-is', 'member/which-guidelines-apply-to-me'],
    updated: UPDATED,
  },
  {
    slug: 'member/which-guidelines-apply-to-me',
    audience: 'member',
    category: 'Understanding your membership',
    title: 'Which version of the guidelines applies to you',
    summary:
      'Generally the version in force when you joined, unless you have accepted a later one. If a ' +
      'decision cites a rule that took effect after you joined, that is worth questioning.',
    synonyms: [
      'guidelines version', 'rules changed', 'they changed the rules', 'grandfathered',
      'which policy', 'when I joined', 'new guidelines',
    ],
    body: [
      {
        paragraphs: [
          'Sharing guidelines get revised. The question of which revision governs your membership ' +
          'is not academic — it decides outcomes, and it is one of the few places where a member ' +
          'can spot an error that staff missed.',
          'The ordinary answer is that the version in effect when you joined is the one that binds ' +
          'you, unless you were notified of a change and continued as a member under terms that ' +
          'made the new version apply. Ministries differ on this, and your own guidelines will say.',
          'If you receive a decline citing a provision, check the effective date of the version it ' +
          'came from against the date you joined. A restriction introduced after you joined, ' +
          'applied to you retroactively, is a specific and answerable objection — and it is one ' +
          'of the four things this software flags automatically for staff.',
        ],
      },
    ],
    related: ['member/if-your-need-is-declined', 'member/how-to-appeal'],
    updated: UPDATED,
  },

  // ── When it goes wrong ─────────────────────────────────────────────────────
  {
    slug: 'member/if-your-need-is-declined',
    audience: 'member',
    category: 'If something goes wrong',
    title: 'Your need was declined — what to do first',
    summary:
      'Get the decision in writing with the specific guideline provision it relies on, then check ' +
      'that provision against your own facts and your joining date. Most successful challenges ' +
      'turn on a document or a date, not on persuasion.',
    synonyms: [
      'denied', 'declined', 'rejected', 'they wont pay', 'refused', 'turned down',
      'not covered', 'what now', 'unfair', 'no',
    ],
    body: [
      {
        paragraphs: [
          'A decline is not necessarily the end, and it is very often the beginning of a process ' +
          'rather than the conclusion of one. What matters most in the first week is getting the ' +
          'decision pinned down precisely enough to examine.',
          'Ask for the decision in writing, including the exact provision relied on and the ' +
          'version of the guidelines it comes from. A decline that cannot name a provision is a ' +
          'decline that has not been properly made, and asking politely for one is entirely ' +
          'reasonable.',
        ],
      },
      {
        heading: 'Then check four things',
        paragraphs: [
          'Does the provision actually say what the decision says it says? Read it yourself.',
          'Did that version of the guidelines exist when you joined? A restriction added later, ' +
          'applied backwards, is a real objection.',
          'Does the reason match your facts? Declines for "pre-existing condition" frequently turn ' +
          'on a date in a clinical note that nobody has actually looked at.',
          'Is the bill itself right? A meaningful share of medical bills contain errors, and a ' +
          'decline on an inflated or miscoded bill is worth challenging at the provider as well ' +
          'as at the ministry.',
        ],
      },
    ],
    steps: [
      { title: 'Ask for it in writing, with the provision cited', body: 'Email, not a phone call.', because: 'A written decision is what an appeal is built on. A remembered one is not.' },
      { title: 'Read the provision yourself', body: 'Get the version of the guidelines that applies to you.', because: 'The most common successful challenge is simply that the provision does not say what the decision assumed.' },
      { title: 'Check the effective date against your joining date', body: 'Both are facts you can verify.', because: 'Applying a newer restriction retroactively is a distinct and answerable error.' },
      { title: 'Gather the document that was missing', body: 'Usually an itemized bill or a clinical note.', because: 'Most overturned decisions turn on new information, not on a change of mind.' },
      { title: 'Appeal in writing, before the deadline', body: 'Note the deadline the moment you get the decline.', because: 'An appeal window that closes is very hard to reopen, whatever the merits.' },
    ],
    related: ['member/how-to-appeal', 'member/which-guidelines-apply-to-me', 'member/what-to-send'],
    updated: UPDATED,
  },
  {
    slug: 'member/how-to-appeal',
    audience: 'member',
    category: 'If something goes wrong',
    title: 'How to write an appeal that has a chance',
    summary:
      'Address the specific reason given, attach the document that answers it, and ask for a ' +
      'decision by a date. An appeal that argues fairness in general is far weaker than one that ' +
      'shows a single fact is wrong.',
    synonyms: [
      'appeal', 'dispute', 'challenge the decision', 'second review', 'overturn', 'reconsider',
      'how do I fight this', 'they said no',
    ],
    body: [
      {
        paragraphs: [
          'The appeals that succeed are narrow. They identify the precise reason given, show why ' +
          'that reason does not apply, and attach the evidence. The appeals that fail are usually ' +
          'the ones that argue the decision was unfair without engaging with what it actually said.',
          'Keep it short. One page, the reason quoted, your response, and the attachments listed. ' +
          'Whoever reads it is deciding whether a specific factual claim holds — help them do that ' +
          'quickly.',
        ],
      },
      {
        heading: 'What to include',
        paragraphs: [
          'The reference number, the date of the decision, and the exact reason given.',
          'The specific fact you say is wrong, and the document that shows it — a clinical note ' +
          'with a date, an itemized bill with a code, a copy of the guidelines version you joined ' +
          'under.',
          'A clear request: what you want, and by when. "Please confirm a decision by the 30th" is ' +
          'a reasonable thing to ask and it creates a date you can follow up against.',
          'Keep a copy of everything you send, and note when you sent it.',
        ],
      },
    ],
    related: ['member/if-your-need-is-declined', 'member/keeping-records'],
    updated: UPDATED,
  },
  {
    slug: 'member/keeping-records',
    audience: 'member',
    category: 'If something goes wrong',
    title: 'Keeping records that will actually help you',
    summary:
      'Dated notes of every call, every document you sent, and every decision you received. This ' +
      'sounds like bureaucracy until the moment it is the only thing standing between you and a ' +
      'bill nobody will explain.',
    synonyms: [
      'documentation', 'paper trail', 'notes', 'what should I keep', 'records', 'evidence', 'proof',
    ],
    body: [
      {
        paragraphs: [
          'The people who get good outcomes in this process are almost always the ones who kept ' +
          'records, and they rarely knew at the time which record would matter.',
          'Keep it simple: one folder, physical or digital. Every bill, every letter, every email. ' +
          'For phone calls, a single line is enough — the date, who you spoke to, and what they ' +
          'said they would do.',
          'The reason this works is that it converts your account of events into a contemporaneous ' +
          'record. "I called in March and was told it was approved" is a memory. A note written in ' +
          'March saying the same thing is something quite different, and everyone treats it ' +
          'differently.',
        ],
      },
    ],
    related: ['member/what-to-send', 'member/how-to-appeal'],
    updated: UPDATED,
  },

  // ── Money ──────────────────────────────────────────────────────────────────
  {
    slug: 'member/where-does-my-money-go',
    audience: 'member',
    category: 'Understanding your membership',
    title: 'Where your monthly contribution actually goes',
    summary:
      'Of every dollar members contribute, some share reaches medical bills and the rest covers ' +
      'administration. Your ministry can show you that number, and a ministry willing to publish ' +
      'it is telling you something meaningful.',
    synonyms: [
      'where does my money go', 'what do they do with it', 'administration', 'overhead',
      'share ratio', 'is it a scam', 'how much goes to bills', 'transparency',
    ],
    body: [
      {
        paragraphs: [
          'It is a fair question and there is a real answer to it. The measure is the proportion ' +
          'of member contributions that reaches actual medical costs, as opposed to salaries, ' +
          'marketing, and overhead.',
          'Auxilium computes that figure continuously and compares it to the medical-loss floor ' +
          'that applies to insurers — 80% in the individual market, 85% for large groups. That ' +
          'floor binds health insurance issuers, and a sharing ministry is not one, so it does ' +
          'not apply to your ministry. Which is exactly why measuring against it voluntarily ' +
          'says something: a ministry clearing a bar it is not held to has made a claim it can ' +
          'be checked on.',
          'The spread across ministries is real and it is wide. In the one state that compels ' +
          'ministries to report — Colorado, since 2022 — the 2024 filings show one ministry ' +
          'retaining 10% of contributions for administration and program costs combined, and ' +
          'another retaining 100%. Seven ministries, including three of the largest, asked the ' +
          'regulator to keep their figures confidential.',
          'If your ministry publishes this, look at it, and look at the trend rather than the ' +
          'single year. If it does not publish it, asking is reasonable, and the manner of the ' +
          'answer will tell you a good deal.',
        ],
      },
    ],
    sources: [
      {
        label: 'Colorado Division of Insurance — Health Care Sharing Plans and Arrangements in Colorado, 2024',
        url: 'https://doi.colorado.gov/health-care-sharing-plans-or-arrangements-summary-reports',
        authority: 'regulator',
      },
      {
        label: '45 CFR § 158.210 — Minimum medical loss ratio',
        url: 'https://www.law.cornell.edu/cfr/text/45/158.210',
        authority: 'law',
      },
    ],
    related: ['member/what-sharing-is', 'member/your-rights'],
    updated: UPDATED,
  },

  // ── Rights ─────────────────────────────────────────────────────────────────
  {
    slug: 'member/your-rights',
    audience: 'member',
    category: 'If something goes wrong',
    title: 'What you can and cannot rely on as a member',
    summary:
      'Sharing is voluntary and not legally enforceable the way an insurance policy is, and no ' +
      'state insurance department supervises it. What you do have is your ministry’s own ' +
      'published guidelines, its internal appeal, your state Attorney General, and — separately ' +
      'and much more strongly — rights against the hospital that billed you.',
    synonyms: [
      'my rights', 'legal rights', 'can I sue', 'do I have any recourse', 'who regulates this',
      'insurance commissioner', 'file a complaint', 'report them', 'attorney general',
      'they refuse to pay', 'is this legal', 'am I protected', 'consumer protection',
      'what am I entitled to', 'ombudsman',
    ],
    body: [
      {
        heading: 'Start with the honest version',
        paragraphs: [
          'The National Association of Insurance Commissioners puts it in one sentence: health ' +
          'care sharing ministries "are not insurance and can’t guarantee the payment of ' +
          'claims", and "state insurance regulators don’t supervise HCSMs". That is not a ' +
          'criticism of your ministry. It is the legal structure sharing operates under, and it ' +
          'is the reason the rest of this article matters.',
          'The practical consequence is that the protections you may be assuming from experience ' +
          'with insurance are not there. There is no state-mandated external review of a denial ' +
          'by an independent doctor. There is no insurance department that will order payment. ' +
          'There is no guaranty fund if the ministry becomes insolvent. Several ministries also ' +
          'ask members to agree not to sue — a federal review of five ministries in 2023 found ' +
          'four whose guidelines contained that agreement.',
          'The sharpest version of this is in your own state\u2019s law, if it has a sharing-ministry ' +
          'statute. Those statutes require a notice on your enrolment materials, and legislatures ' +
          'wrote the wording themselves. Texas\u2019s says that whether anyone assists with your bills ' +
          '"will be totally voluntary because no other participant will be compelled by law to ' +
          'contribute", and that "regardless of whether you receive any payment for medical ' +
          'expenses or whether this ministry continues to operate, you are always personally ' +
          'responsible for the payment of your own medical bills." That is not the ministry\u2019s ' +
          'fine print. It is the condition attached to letting it operate outside insurance ' +
          'regulation — and the same sentence that grants the exemption is the one that removes ' +
          'any right you might have thought you had to be paid. Those are one fact, not two.',
          'None of that means you are without recourse. It means your recourse runs along ' +
          'different lines than you expect, and knowing which lines is most of the battle.',
        ],
      },
      {
        heading: 'The guidelines are the contract-like document',
        paragraphs: [
          'Your ministry’s published guidelines are the thing that actually defines what it ' +
          'has committed to. Read the version that governs you — and know that which version ' +
          'governs is itself a published rule that differs between ministries. Some apply the ' +
          'version in force when you enrolled, some the version in force on the date of service, ' +
          'some the version in force when you submitted, some when they received the bills. Ask ' +
          'which one your ministry uses and get the answer in writing.',
          'A denial that cannot be traced to a specific provision of the governing version is ' +
          'the single most reviewable thing that can happen to you. It is also common enough ' +
          'that Auxilium scores it as an integrity finding. If your decline letter names no ' +
          'provision, or names one that does not say what the letter says it says, write that ' +
          'down in those words and put it at the top of your appeal.',
        ],
      },
      {
        heading: 'Appeal, because almost nobody does and it works about half the time',
        paragraphs: [
          'This is the most useful number in this article. Colorado’s 2024 regulator filings ' +
          'record 13,741 denied share requests across reporting ministries, 111 appeals of those ' +
          'denials — under one percent — and 54 of those appeals later approved. Roughly half of ' +
          'appealed denials were reversed, and roughly ninety-nine out of a hundred members ' +
          'never appealed.',
          'That is not evidence your appeal will succeed, and nothing here can tell you it will. ' +
          'It is evidence that appealing is worth the afternoon it costs, and that the reason ' +
          'most denials stand is that they were never contested.',
        ],
      },
      {
        heading: 'Where to complain, and why it is probably not the insurance department',
        paragraphs: [
          'Because ministries are generally outside insurance regulation, most state insurance ' +
          'departments will decline the complaint and route you elsewhere. Michigan’s ' +
          'says so explicitly and directs consumers to the Attorney General instead. Try the ' +
          'insurance department first anyway — a handful of states do collect this, and a ' +
          'declined complaint costs you nothing but tells you where the line is in your state.',
          'Then file with your state Attorney General’s consumer protection division. That ' +
          'is where enforcement in this sector has actually come from: the settlements, consent ' +
          'orders, and restitution on the public record were brought by Attorneys General and by ' +
          'a small number of state insurance regulators acting on unauthorized-insurance ' +
          'grounds, not through individual claim appeals.',
          'One state matters more than the others. Colorado requires ministries to report ' +
          'enrollment, finances, denial rates, and appeal outcomes annually, and publishes the ' +
          'results per ministry. If you are choosing a ministry or arguing with one, those ' +
          'reports are the only independently collected numbers that exist.',
        ],
      },
      {
        heading: 'The rights you do have are against the hospital',
        paragraphs: [
          'This is the part members most often miss, and it is where the leverage actually is. ' +
          'Your rights against the provider who billed you are ordinary consumer and tax law, ' +
          'they apply whether or not anything is ever shared, and they do not depend on your ' +
          'ministry at all. Nonprofit hospitals in particular operate under federal conditions ' +
          'on their tax exemption that give you a financial assistance application window ' +
          'measured in months — longer, in most cases, than any ministry takes to decide.',
          'Read “Your rights with the hospital that billed you” next. If you only do ' +
          'one thing after a denial, do that one.',
        ],
      },
    ],
    steps: [
      {
        title: 'Get the decline in writing, with the provision cited',
        body:
          'Ask for the specific guideline provision and the version it comes from. If the letter ' +
          'does not name one, ask in writing and keep the reply.',
        because:
          'A denial that cannot point at a provision is the most reviewable kind there is, and ' +
          'the written record is what an Attorney General or a board will look at later.',
      },
      {
        title: 'Appeal within your ministry, in writing, before the deadline',
        body:
          'Quote the provision, state why it does not apply to your facts, and attach the ' +
          'records that show it. Ask for the decision and its reasoning in writing.',
        because:
          'About half of appealed denials in the one state that measures were later approved — ' +
          'and under one percent of denials were appealed at all.',
      },
      {
        title: 'Apply to the hospital for financial assistance at the same time',
        body:
          'Do not wait for the sharing decision. The two processes are independent and the ' +
          'hospital’s window is usually the longer one.',
        because:
          'Waiting for a denial before applying is how members lose a deadline they never knew ' +
          'was running.',
      },
      {
        title: 'File with your state Attorney General if the ministry will not engage',
        body:
          'Consumer protection division, with your written record attached. Try the insurance ' +
          'department too, and note what it tells you.',
        because:
          'Enforcement in this sector has come almost entirely from Attorneys General, not from ' +
          'individual appeals.',
      },
      {
        title: 'Ask for the ministry\u2019s annual audit',
        body:
          'Federal law defines a sharing ministry as one that has an independent CPA audit and ' +
          'makes it available to the public on request. Ask for it in writing.',
        because:
          'It is one of the few things a ministry owes you on demand — and when researchers ' +
          'asked seven ministries for theirs, only three produced one. A refusal is itself an ' +
          'answer.',
      },
      {
        title: 'Talk to a lawyer in your state before signing anything that ends the dispute',
        body:
          'Especially if your guidelines contain an agreement not to sue, or a mediation or ' +
          'arbitration clause. Those provisions vary and their enforceability varies by state.',
        because:
          'This article cannot tell you how a clause applies to you. A lawyer in your state can.',
      },
    ],
    sources: [
      {
        label: 'NAIC — Not All Products Are Health Insurance: Health Care Sharing Ministries, Discount Plans and Risk Sharing',
        url: 'https://content.naic.org/article/not-all-products-are-health-insurance-health-care-sharing-ministries-discount-plans-and-risk-sharing',
        authority: 'regulator',
      },
      {
        label: 'Michigan DIFS — Health Care Sharing Ministries are not health insurance (Jan. 23, 2024)',
        url: 'https://www.michigan.gov/difs/news-and-outreach/press-releases/2024/01/23/difs-reminds-consumers-that-health-care-sharing-ministries-are-not-health-insurance',
        authority: 'regulator',
      },
      {
        label: 'Colorado Division of Insurance — Health Care Sharing Plans and Arrangements summary reports',
        url: 'https://doi.colorado.gov/health-care-sharing-plans-or-arrangements-summary-reports',
        authority: 'regulator',
      },
      {
        label: 'GAO-23-106034 — Private Health Coverage: Farm Bureau Plans, Health Care Sharing Ministries, and Fixed Indemnity Plans',
        url: 'https://www.gao.gov/products/gao-23-106034',
        authority: 'research',
      },
      {
        label: '26 U.S.C. § 5000A(d)(2)(B) — Health care sharing ministry definition',
        url: 'https://www.law.cornell.edu/uscode/text/26/5000A',
        authority: 'law',
      },
    ],
    related: [
      'member/medical-bill-rights',
      'member/how-to-appeal',
      'member/if-your-need-is-declined',
      'member/where-does-my-money-go',
    ],
    updated: UPDATED,
  },

  {
    slug: 'member/medical-bill-rights',
    audience: 'member',
    category: 'If something goes wrong',
    title: 'Your rights with the hospital that billed you',
    summary:
      'These rights are the strongest ones you have, they come from federal tax law rather than ' +
      'from your ministry, and they apply whether or not anything is ever shared. At a nonprofit ' +
      'hospital you generally have 240 days from the first bill to apply for financial ' +
      'assistance, and if you qualify the hospital may not charge you the list price.',
    synonyms: [
      'hospital bill', 'charity care', 'financial assistance', 'cant afford this bill',
      'collections', 'debt collector', 'sent to collections', 'chargemaster', 'list price',
      'negotiate my bill', 'payment plan', 'reduce my bill', 'medical debt',
      'the hospital is suing me', 'wage garnishment', 'credit report', 'self pay discount',
      'price transparency', 'what should this cost', 'good faith estimate', 'no surprises act',
      'surprise bill', 'balance billing', 'estimate before surgery', 'bill higher than quoted',
    ],
    body: [
      {
        heading: 'Why this is the part that matters',
        paragraphs: [
          'Sharing is voluntary and cannot be compelled. The hospital’s obligations are neither. ' +
          'Most nonprofit hospitals in the United States hold their tax exemption on conditions ' +
          'written into federal law at 26 U.S.C. § 501(r), and those conditions are enforceable ' +
          'against the hospital regardless of what your ministry decides. If your need is ' +
          'declined, this is where your remaining leverage lives.',
          'It is also, in most cases, the longer clock. Run both processes at once rather than ' +
          'waiting for the sharing decision first — that is how members lose a deadline they ' +
          'never knew was running.',
        ],
      },
      {
        heading: 'The 240-day application window',
        paragraphs: [
          'A nonprofit hospital must accept and process a financial assistance application for ' +
          'an application period that ends no earlier than the 240th day after it gave you the ' +
          'first post-discharge billing statement. That is about eight months, and it is a floor ' +
          'rather than a ceiling — the period runs longer in some circumstances.',
          'Ask for the hospital’s Financial Assistance Policy and its plain language summary by ' +
          'name. Both are documents the hospital is required to have, and asking for them by ' +
          'their legal names tends to get a faster and more accurate answer than asking whether ' +
          'they "do charity care".',
        ],
      },
      {
        heading: 'If you qualify, they cannot bill you the list price',
        paragraphs: [
          'A hospital must limit what it charges a person eligible under its policy for ' +
          'emergency or other medically necessary care to no more than the amounts generally ' +
          'billed to individuals who have insurance covering that care — the AGB. For any other ' +
          'care covered by the policy, it must charge less than gross charges.',
          'That is the rule that makes the chargemaster number on your statement negotiable in ' +
          'principle rather than just in practice. Hospital list prices commonly bear little ' +
          'relation to what any insurer actually pays, and the AGB rule is federal law saying so.',
        ],
      },
      {
        heading: 'Before they can come after you',
        paragraphs: [
          'A hospital must make reasonable efforts to determine whether you qualify for ' +
          'assistance before taking extraordinary collection actions — reporting you to a credit ' +
          'agency, selling the debt, suing, garnishing wages, placing a lien. For most such ' +
          'actions it must wait at least 120 days from the first post-discharge billing ' +
          'statement.',
          'If a hospital or its collection agency moves on you inside that window, or without ' +
          'ever telling you assistance exists, say so in writing to the hospital’s billing ' +
          'office and to your state Attorney General. Naming § 501(r)(6) tends to change the ' +
          'conversation, because it is the hospital’s tax exemption rather than your credit ' +
          'score that is on the line.',
        ],
      },
      {
        heading: 'You are "uninsured" for one federal rule, and that is good news',
        paragraphs: [
          'Because sharing is not insurance, federal rules treat you as an uninsured or self-pay ' +
          'patient. CMS says so directly: a person enrolled in a health care sharing ministry ' +
          '"is considered uninsured for purposes of the GFE requirements". That sounds like a ' +
          'loss and in this one instance it is a gain.',
          'It means you are entitled to a Good Faith Estimate — a written estimate of what a ' +
          'scheduled service will cost, before you have it, itemised with the diagnosis and ' +
          'service codes. The timing is set by how far out the care is booked: three to nine ' +
          'business days ahead and the provider owes you the estimate within one business day; ' +
          'ten or more business days ahead and they have three. Asking for one at any time also ' +
          'starts a three-business-day clock, and any question you ask about cost counts as ' +
          'asking. Care booked fewer than three business days out carries no obligation, which ' +
          'means walk-ins and emergencies get nothing.',
          'If the final bill lands $400 or more above the estimate, you can contest it through ' +
          'Patient-Provider Dispute Resolution. The window is 120 calendar days from the first ' +
          'bill, the filing fee is $25 and comes back to you if you win, and — the part that ' +
          'matters most when you are frightened — while the dispute is open the provider may not ' +
          'move the bill to collections or threaten to. One limit worth knowing: an estimate you ' +
          'were given voluntarily, for care booked fewer than three business days out, does not ' +
          'qualify for this process even if the bill exceeds it.',
          'Ask for the estimate in writing and keep it. Without it there is nothing to compare ' +
          'the bill against, and it is also the single most useful document your ministry can ' +
          'have when negotiating the bill down.',
          'Be precise about the limit here, because the same law contains protections you do not ' +
          'get. The No Surprises Act’s balance-billing protections — for out-of-network emergency ' +
          'care, out-of-network providers at an in-network facility, and air ambulance — run to ' +
          'health plans and insurers. A sharing ministry is neither, so those do not cover you. ' +
          'The estimate right does; the balance-billing shield does not.',
        ],
      },
      {
        heading: 'Ask for the itemized statement and check it',
        paragraphs: [
          'Ask for a fully itemized statement with procedure codes, not a summary. Errors and ' +
          'duplicate lines are common, and you cannot dispute what you cannot see. This is also ' +
          'exactly what your ministry needs in order to share a bill, so the same request serves ' +
          'both purposes at once.',
          'Two details make this request work far better. First, ask for the billing forms by ' +
          'name — the UB-04 for a facility, the CMS-1500 for a physician — with the procedure, ' +
          'diagnosis, and revenue codes on them. A "detailed statement" is often a departmental ' +
          'summary that shows you nothing. Second, and this is the part almost nobody knows: ' +
          'billing records are part of your health record under the federal privacy rule, so a ' +
          'request for them carries a 30-day deadline and a cap on what you can be charged — ' +
          'but the cap applies only when the records go to **you**. Ask for them addressed to ' +
          'yourself and forward them on. Asking the hospital to send them straight to your ' +
          'ministry or an advocate strips the fee cap, and the same file can cost many times ' +
          'more.',
          'Hospitals are separately required to publish their standard charges — a comprehensive ' +
          'machine-readable file and a consumer-friendly display of shoppable services — under ' +
          'the federal hospital price transparency rule in force since January 1, 2021. For a ' +
          'planned procedure, that file is a real, if awkward, way to see the number before you ' +
          'commit to it.',
        ],
      },
      {
        heading: 'What this article is not',
        paragraphs: [
          'This is general information about federal requirements on nonprofit hospitals. It is ' +
          'not legal advice, it does not tell you whether a particular hospital is covered or ' +
          'whether you personally qualify, and state law adds protections in many places that ' +
          'are not described here. A lawyer or a nonprofit patient advocate in your state can ' +
          'tell you how these rules apply to your bill.',
        ],
      },
    ],
    steps: [
      {
        title: 'Ask for the Financial Assistance Policy and the plain language summary',
        body:
          'Request both by name from the hospital’s billing or patient financial services office. ' +
          'Note the date you asked.',
        because:
          'These are documents the hospital is required to maintain, and asking by name gets a ' +
          'better answer than asking about "charity care".',
      },
      {
        title: 'Apply now, not after the sharing decision',
        body:
          'Submit the application even if you expect your need to be shared. Withdrawing later ' +
          'costs nothing; missing the window cannot be undone.',
        because:
          'The application period ends no earlier than 240 days after your first post-discharge ' +
          'bill, and it runs independently of anything your ministry is doing.',
      },
      {
        title: 'Ask for a Good Faith Estimate before anything scheduled',
        body:
          'Tell the provider you are self-pay and request a written Good Faith Estimate. Do this ' +
          'for any procedure booked more than a few days out, and keep the document.',
        because:
          'Federal rules treat sharing members as uninsured, which is exactly what entitles you ' +
          'to the estimate — and a bill that lands $400 or more above it can be disputed.',
      },
      {
        title: 'Ask for a fully itemized statement with procedure codes',
        body: 'A summary statement is not enough to check or to submit for sharing.',
        because:
          'Errors and duplicated lines are common, and your ministry needs the itemization ' +
          'anyway.',
      },
      {
        title: 'If you are found eligible, check the amount against the AGB rule',
        body:
          'Ask the hospital in writing how it calculated the amount and which AGB method it uses.',
        because:
          'An eligible person may not be charged more than the amounts generally billed to ' +
          'insured patients for emergency or medically necessary care.',
      },
      {
        title: 'Do not put the bill on a medical credit card',
        body:
          'Not before you have applied for financial assistance, asked for the itemized bill, ' +
          'and heard back on the sharing decision.',
        because:
          'Financing converts a bill you could still dispute, reprice, or have forgiven into ' +
          'ordinary consumer debt at a high rate — and it can cost you assistance you already ' +
          'qualified for.',
      },
      {
        title: 'Write it down if collections start early',
        body:
          'Record the date of the first bill, the date of every contact, and the date any ' +
          'collection action began. Send the record to the hospital and to your state Attorney ' +
          'General.',
        because:
          'The 120-day floor before extraordinary collection actions is a condition on the ' +
          'hospital’s tax exemption, and dates are what make that argument.',
      },
    ],
    sources: [
      {
        label: '26 CFR § 1.501(r)-1 — Definitions, including the application period',
        url: 'https://www.law.cornell.edu/cfr/text/26/1.501(r)-1',
        authority: 'law',
      },
      {
        label: '26 CFR § 1.501(r)-4 — Financial assistance policy and emergency medical care policy',
        url: 'https://www.law.cornell.edu/cfr/text/26/1.501(r)-4',
        authority: 'law',
      },
      {
        label: '26 CFR § 1.501(r)-5 — Limitation on charges and amounts generally billed',
        url: 'https://www.law.cornell.edu/cfr/text/26/1.501(r)-5',
        authority: 'law',
      },
      {
        label: '26 CFR § 1.501(r)-6 — Billing and collection, and extraordinary collection actions',
        url: 'https://www.law.cornell.edu/cfr/text/26/1.501(r)-6',
        authority: 'law',
      },
      {
        label: 'CMS — What is Considered “Health Insurance”? Determining When Uninsured (or Self-Pay) Good Faith Estimate Rules Apply',
        url: 'https://www.cms.gov/files/document/fact-sheet-what-is-considered-health-insurance.pdf',
        authority: 'regulator',
      },
      {
        label: '45 CFR § 149.610 — Good faith estimates for uninsured or self-pay individuals',
        url: 'https://www.law.cornell.edu/cfr/text/45/149.610',
        authority: 'law',
      },
      {
        label: '45 CFR § 149.620 — Patient-provider dispute resolution',
        url: 'https://www.law.cornell.edu/cfr/text/45/149.620',
        authority: 'law',
      },
      {
        label: '45 CFR § 164.524 — Your right of access to medical and billing records',
        url: 'https://www.law.cornell.edu/cfr/text/45/164.524',
        authority: 'law',
      },
      {
        label: 'CFPB — Medical Credit Cards and Financing Plans',
        url: 'https://www.consumerfinance.gov/data-research/research-reports/medical-credit-cards-and-financing-plans/',
        authority: 'regulator',
      },
      {
        label: 'CMS — Hospital Price Transparency',
        url: 'https://www.cms.gov/priorities/key-initiatives/hospital-price-transparency',
        authority: 'regulator',
      },
    ],
    related: ['member/your-rights', 'member/what-to-send', 'member/if-your-need-is-declined'],
    updated: UPDATED,
  },
];
