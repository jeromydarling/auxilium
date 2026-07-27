# Auxilium — handoff

A Health Sharing Ministry OS. Its job is to make sure nobody gets missed.

Health sharing ministries are communities where households share one another's
medical costs directly. They run on relationships and spreadsheets, and they
fail in a specific way: a family in crisis goes quiet, a case stalls in someone's
inbox, a follow-up that was promised never happens, and nobody notices until the
member leaves. **NRI — Narrative Relational Intelligence — exists to notice.**

---

## Quick start

```bash
bun install
cp .dev.vars.example .dev.vars
bun run db:migrate:local
bun run db:seed:local
bun run build
bun run dev                    # http://localhost:8787
```

The site root is the marketing site; the app is at `/app`. Click **Explore the
demo ministry**. Full Cloudflare walkthrough:
[`docs/cloudflare-setup.md`](docs/cloudflare-setup.md).

| Command | |
|---|---|
| `bun run dev` | Worker + SPA against local D1/R2/KV/Queues |
| `bun run dev:vite` | Vite HMR, proxying `/api` to `:8787` |
| `bun run test` | Vitest — 542 tests over domain logic, knowledge, and content integrity |
| `bun run typecheck` / `lint` / `build` | The pre-merge gate |
| `bun run db:reset:local` | Wipe, migrate, reseed |
| `bun run db:backup:prod` | Dated read-only export of production |
| `bun run db:verify-backup <file>` | Prove an export restores, in a scratch database |

---

## Architecture

One Worker serves everything:

```
Request
  ├── /api/*  → Hono router (workers/index.ts)
  └── /*      → ASSETS binding → the built React SPA (dist/client)

Queue consumers export from the same module, so import commits and NRI
recomputes run with identical bindings. No second deployable.
```

- **Frontend** — React 18 + TypeScript + Vite, Tailwind + shadcn/ui, React
  Router, React Query.
- **Runtime** — Cloudflare Workers.
- **Data** — D1 (source of truth), R2 (files), KV (cache only), Queues (async).

### Layout

```
src/
  app/           shell, router, auth context
  components/ui/ shadcn primitives
  features/nri/  compass drawer, direction chips, explanation panel
  hooks/nri/     the six NRI hooks
  lib/
    nri/         ← the scoring engine. Pure. No Cloudflare, no React.
    import/      ← the import pipeline. Pure. Same rule.
    api.ts       typed client
  routes/        ten pages
workers/
  api/           Hono routes, one file per resource
  lib/           auth, db, storage, audit, and the D1↔engine bridges
  queues/        the two consumers
schema/
  migrations/    numbered SQL
  seed.sql       five demo personas
```

**The most important boundary in this codebase:** everything in `src/lib/nri`
and `src/lib/import` is pure. No database, no network, no clock except what is
passed in. That is what makes the rules exhaustively testable in plain Node and
recomputable from a queue with no request context. Anything that touches D1
lives in `workers/lib/*-service.ts`. Keep it that way.

---

## Domain model

- A **member** is a person.
- A **household** is the sharing unit those people belong to. Eligibility, share
  amounts, and most care conversations happen here, not at the individual.
- A **need** is a request for the community to share a medical cost.
- A **prayer request** is a care item with an owner and a follow-up date.
- A **signal** is one directional NRI reading about one subject.

Conventions that are not negotiable:

- **Money is integer cents.** Everywhere. There is no float currency column and
  there should never be one — a share amount that drifts by a cent is a member
  calling to ask why their statement is wrong.
- **Every tenant-scoped query carries `org_id`.** There is no exception.
- **IDs are prefixed random tokens** (`mem_…`, `need_…`) from `src/lib/ids.ts`.
  The database never generates one.
- **Timestamps are ISO-8601 UTC strings.** They sort lexicographically and
  survive D1's type affinity without surprises.
- **Soft deletes** via `deleted_at`; live queries filter it.

18 tables in `schema/migrations/0001_initial.sql` and 6 more in
`0002_integrity.sql`, each commented with why it looks the way it does.

---

## NRI — Narrative Relational Intelligence

### The compass

Four directions. A member can carry several at once, and that is the point:
"high Onus, low Cura" is a billing problem; "high Onus **and** high Cura" is a
family in crisis, and the difference should be visible at a glance.

| | Meaning | Response |
|---|---|---|
| **Cura** | Care, pastoral attention, prayer. Someone is hurting. | Reach out personally. Do not send a form. |
| **Onus** | Case weight — money, urgency, processing that stalled. | Move the case. Assign an owner, communicate the timeline. |
| **Familia** | Household complexity — dependents, caregiving, transition. | Check the household as a unit. |
| **Fides** | Trust and communication. Are we still in touch? | Re-establish contact before renewal. |

Bands: **clear** 0–24 · **watch** 25–49 · **attend** 50–74 · **urgent** 75–100.

### How a score is produced

**A score is the sum of the weights of every rule that matched. That is the
entire algorithm.**

There is no model, no training data, and no learned coefficient anywhere in the
calculation. The reasons are always shown alongside the number, with their exact
weights, so a staff member who distrusts a score can add it up by hand and either
agree or point at the rule they disagree with. A system that cannot be argued
with does not get trusted with pastoral care.

The full rule set is published to administrators at `/settings/rules`. Not a
debug page — a product feature.

```
facts (plain object)  →  rules  →  signal { direction, score, reason_codes,
                                             source, updated_at, dismissed }
```

Rules read *only* the facts object (`src/lib/nri/types.ts`). Given the same
facts and the same timestamp, the output is byte-identical, forever.

### Where things live

| | |
|---|---|
| `src/lib/nri/directions.ts` | The four directions, bands, tie-breaking |
| `src/lib/nri/rules.ts` | Every rule, with its rationale |
| `src/lib/nri/engine.ts` | Scoring, explanations, compass, triage ranking |
| `src/lib/nri/nudges.ts` | The session engine's derivation |
| `workers/lib/nri-service.ts` | D1 → facts → signals → D1 |

### Two decisions worth knowing about

**Ties break toward Cura.** When scores are equal, the hurting person outranks
the expensive case. That is a moral choice encoded in `DIRECTION_PRIORITY`, not
an accident.

**Equal scores are a total order.** A bad week produces five members at 100, and
a board that ranks by band but not within it tells staff those five are
interchangeable — so they work the top row, which was whatever the database
returned first. After the score and the Cura precedence, `rankForTriage` breaks
on how many distinct reasons matched, then how many directions are live, then who
has gone longest without contact, then subject id. The last is not a judgement
but a guarantee: without it the board reshuffles between two identical requests
and somebody loses their place for no reason. **The row shows the basis** —
"4 reasons · last contact 31 days ago" — because a ranking whose basis is
invisible is indistinguishable from an arbitrary one. `reasonCount` dedupes on
`code`: a `Set` of `ReasonCode` objects never dedupes, and the count would have
doubled for exactly the members this exists to tell apart.

**Household complexity scores on the primary contact only.** Size, dependents,
caregiving, and recent changes are properties of the *household*. Scoring them
on every member put eight rows on the triage board for one family and ranked
nothing. If no primary is marked, it falls back to scoring everyone — a
duplicated signal beats a complex family nobody sees.

### Dismissal

Staff can dismiss a signal. It means "I have seen this and handled it", not
"never show me this member again". A dismissed signal comes back when the facts
get materially worse — a higher band, or a 15-point jump (`shouldResurface`).
Someone who dismissed "member is quiet" should absolutely be shown "member is
quiet **and** now hospitalized".

### The six hooks

| | |
|---|---|
| `useNriCompass` | Current posture, from live pressure then route context |
| `useNriSignals` | One subject's signals, plus dismiss/restore |
| `useNriSessionEngine` | Today's nudges |
| `useNriUserState` | Dismissals, cooldowns, guide progress — in D1, cross-device |
| `useNriAutoOpen` | Lets the compass open itself, rarely. Also `useNriGlow` |
| `useNriGuide` | Contextual orientation for new users |

**On the interruption budget:** auto-open fires at most once per calendar day,
and only behind a high-confidence action nudge. Software that pops open for
routine work gets closed reflexively — and is then closed reflexively on the
morning a member is in an ICU. Spend it carefully.

---

## The import pipeline

Real ministry rosters are messy: BOMs, mixed date formats, embedded newlines,
"Mbr #" as a column name, the same family exported twice.

```
parse → infer columns → map → normalize → validate → dedupe → PREVIEW → commit
```

**Nothing touches the members table until a human commits.** The preview is
persisted to `import_rows`, so the commit works from the exact rows that were
approved — not from a re-parse that might have drifted.

- **Parsing** (`csv.ts`) — a hand-written RFC 4180 parser. Written rather than
  imported because it runs in the Worker where bundle size is real, and because
  messy exports need forgiving behavior most libraries make hard to reach.
- **Inference** (`infer.ts`) — an alias table first, content sniffing as a
  fallback. Adding an alias is a one-line change and should be the first thing
  you try when a ministry's file does not auto-map.
- **Validation** (`validate.ts`) — rejects as little as possible. Only a
  nameless row is an error. Everything else imports with a warning attached,
  because refusing a family over a typo'd zip code is worse than importing them
  and flagging it.
- **Dedupe** (`dedupe.ts`) — email, then phone **plus surname**, then name plus
  date of birth. **Fuzzy name matching is deliberately absent.** Levenshtein on
  "Jon"/"John" would catch some real duplicates and silently merge some real
  siblings, and merging two people who are different people is far worse than
  importing one duplicate a human later notices.
- **Commit** (`workers/lib/import-service.ts`) — each row is marked committed in
  the same batch that writes its member, so a redelivered queue message resumes
  instead of duplicating. A blank cell means "not provided", never "delete what
  you know".

**Adding XLSX:** replace `parseCsv` with a format dispatch yielding the same
`{headers, rows}`. Everything downstream is already format-agnostic.

---

## Testing

542 tests over the logic that carries the risk: NRI scoring, integrity and
share-ratio rules, claims intake and SLA, repricing, import parsing and
matching, and money math. All pure, all in plain Node.

They pin behavior, not implementation:

- scores equal the sum of their stated reasons
- the five demo personas land in the bands staff expect
- rule boundaries (the onboarding grace period, the 14-day stall threshold)
- household complexity does not duplicate across a family
- a deliberately awful CSV parses correctly — BOM, mixed dates, embedded
  newlines, ragged rows, duplicate headers
- phone-plus-surname does not match two siblings on a shared landline

When you add a rule, add a test pinning what you intend. When you change a
weight, expect a persona test to fail — that is the test working.

### Three tests that guard invariants rather than behaviour

Each replaces a rule that was written down and enforced nowhere. All three were
verified by deliberately introducing the violation and watching them fail —
a guard nobody has seen fail is a guard nobody knows works.

- **`workers/lib/tenancy.test.ts`** reads the source and fails on any SQL without
  a tenant predicate. "Every tenant-scoped query carries `org_id`, there is no
  exception" held because every author remembered, which is a social contract,
  not a mechanism. It also asserts every dynamic `conditions` array *starts* with
  the tenant, and that the member API never scopes by `org_id`. The allowlist is
  the interesting part: each entry names why that query has no tenant, so a new
  unexplained entry is the thing to argue about in review.
- **`src/lib/claims/promises.test.ts`** fails on promissory language in anything a
  member reads — the source, an eligibility answer under the most favourable
  inputs available, and a knowledge answer. It is sentence-level and
  negation-aware, because "it cannot tell you whether a need will be shared" is
  the *correct* wording and a guard that flags correct behaviour gets muted.
- **`src/lib/brand/assets.test.ts`** pins that generated SVG parses, escapes, and
  cannot render illegible text.

---

## Degradation

Auxilium runs fully with no third-party keys and no paid plan:

| Absent | Behavior |
|---|---|
| `ANTHROPIC_API_KEY` | AI triage notes show "not configured". **Scoring is unaffected** — it is never AI-dependent. |
| Queues (free plan) | Imports commit inline; signals recompute inline. Logged, not silent. |
| KV unavailable | Login rate limiting fails **open**. A broken limiter must never lock a ministry out on the day it matters. |
| `SESSION_SECRET` | Dev uses a fixed key with a loud warning. **Production refuses to issue sessions** — every login 500s, staff and member alike. `/api/health` reports this and goes `degraded`; it used to say `ok` while nobody could sign in, which sent whoever was debugging to look everywhere else first. |
| `STRIPE_SECRET_KEY` | Billing is **off, not broken**. Connect and invoicing answer "not configured"; the ledger, share ratio, scoring, and claims are untouched. |
| `RESEND_API_KEY` / `ALERT_FROM_EMAIL` / `ALERT_EMAIL` | Alerts are still **raised and stored**; nobody is emailed. `/api/health` says so, because the symptom of a misconfiguration is a quiet inbox — indistinguishable from nothing being wrong. |
| `STRIPE_WEBHOOK_SECRET` | The webhook **refuses every request**. An unsigned webhook that writes to the ledger would let anyone fabricate settled contributions, so refusing is the only safe answer. `/api/health` reports this as `partial`, because a key without a webhook secret takes payments and never records them. |

---

## Claims integrity

V1 answered *who needs help?* This layer answers the question the whole
category is actually being asked by regulators, journalists, and plaintiffs'
attorneys: **where did the money go, and can you prove it?**

Every rule here traces to a documented failure. That provenance is deliberate
and is stored on the rule itself (`INTEGRITY_RULES[].provenance`, published at
`/api/integrity/rules`): when a ministry disputes a finding, the answer should
be a specific thing that happened to a real community, not an abstraction.

### The share ratio

Of every dollar members contributed, how many cents reached their medical
costs? Aliera's answer was ~16. Medical Cost Sharing's was 3.5, while
distributing nothing at all for months. Both sold the same story as ministries
doing this honestly, and from outside, before the lawsuits, they were nearly
indistinguishable.

The ratio is measured against the **ACA medical-loss floor (80% individual,
85% large group)** — which health care sharing ministries are not held to.
Stated precisely, because the loose version is wrong: no provision exempts
HCSMs from 45 CFR Part 158 by name. Part 158 binds *health insurance issuers*,
and an HCSM is not one. (The statutory exemption HCSMs *do* have,
26 U.S.C. § 5000A(d)(2)(B), is from the individual mandate — a different
provision.) Not being held to it is the entire reason to measure against it: a
ministry that clears a bar it is not held to has said something no marketing
page can, and `/api/integrity/public/:slug` publishes exactly that, opt-in,
with no member data in it.

### The ledger

`contributions` (money in) and `disbursements` (money out) on one timeline.
Disbursements carry a `category` that decides which side of the ratio they land
on, and `related_party` is broken out separately because that is where
diversion hides — the API refuses a related-party payment that does not state
the relationship.

**A month with money in and nothing out is the loudest signal this system
produces.** The ledger query stitches periods by union rather than joining, so
that month can never be lost to an inner join.

### Guideline consistency

`sharing_guidelines` are versioned and dated, and each provision declares the
denial reason codes it actually authorizes. That field is load-bearing: the
signature pattern of this category is marketing "covered from day one" and then
denying on precisely that basis.

Four findings fall out of it, and all four are the week-it-happens version of a
deposition exhibit:

- a denial citing no provision at all
- a denial citing a provision that does not exist
- a denial citing a provision that does not authorize the stated reason
- **a denial applying a guideline version the ministry's own policy does not
  make governing**

That last one is not "a newer guideline was applied", and the difference is the
whole rule. Ministries publish at least four different answers to *which
version binds a need*: the one in force at enrolment, at date of service, at
submission, or when the bills were received — all four are in real use, and some
add a grandfathering ratchet on top. Scoring the naive version would raise a
serious finding against a time-of-service ministry every time it followed its
own published policy correctly, and **a rule that fires on correct behaviour is
worse than no rule** — it teaches staff the report is noise, and the real
findings go with it. So the org declares its rule
(`organizations.governing_version_rule`) and the finding is scored against the
date that rule makes controlling. Undeclared falls back to enrolment, the
strictest of the four: a ministry that has not said gets measured against the
reading most protective of the member. A missing anchor date is *not* a finding
— cannot-tell must never become an accusation built from a gap in the data.

`POST /api/claims/:id/deny` requires both a reason code and a guideline
reference. It warns loudly — but does not block — when the citation does not
hold up, because blocking would push staff to pick whatever provision the form
accepts, and a recorded warning keeps the honest record instead.

### Claims that stop moving

`sla_days` puts a due date on every claim at submission. The asymmetry it
corrects is documented: ministries publish hard deadlines *members* must meet
(six months from date of service to submit a bill at several; 120 days at one)
and publish no enforceable deadline of their own. Where that gap has been
closed it has been closed by a regulator afterward — NY DFS imposed fixed
payment deadlines on one ministry as a consent-order remedy. The default (17)
is not inherited from anyone: it is the ministry's own commitment, set per
organization, deliberately tighter than any published turnaround.

Two design decisions worth keeping:

- The clock **pauses** while waiting on the member — but `needs_info` gets its
  own two-week ageing rule, because that status is exactly where claims go to
  die, and excluding it entirely would create an incentive to park them there.
- An **unacknowledged** claim escalates before its deadline. A claim nobody has
  opened is worse than a slow one: the member cannot tell "being worked" from
  "lost", and assumes the former until it is too late.

### Reference-based repricing

Chargemaster prices bear little relation to cost. Repricing against the
Medicare allowable (120–200%, default 150%) commonly saves 20–50% on facility
claims. Ministries largely lack the infrastructure to do it at all, so they
share inflated numbers and members carry inflated balances.

Every proposal records its basis, so it reads as a negotiation rather than a
refusal to pay. A test caught the one dangerous bug here: with no Medicare rate
on file the arithmetic priced claims to **$0** and reported the full billed
amount as savings. It now declines to reprice instead.

### Eligibility, before the bill

The cruelest failure in this category happens in the right order but too late:
years of contributions, then a procedure, then the discovery that it will not
be shared. `POST /api/claims/eligibility` answers against the guideline version
that actually **binds that member** and the ministry's real denial history.

It is deliberately never promissory. **"Likely" is the strongest word it may
use about a future claim** — softening that would recreate the exact harm the
feature exists to prevent. Every check is written to the audit log, so a member
told "likely shared" and then denied can point at the record.

### Where things live

| | |
|---|---|
| `src/lib/integrity/mlr.ts` | Ratio arithmetic, drift, zero-share runs |
| `src/lib/integrity/rules.ts` | Every rule, with its provenance |
| `src/lib/integrity/engine.ts` | Scoring, per-denial audit, recommended actions |
| `src/lib/claims/intake.ts` | Blocking validation, real NPI check digit |
| `src/lib/claims/sla.ts` | The clock, escalation, member-facing tracker |
| `src/lib/claims/repricing.ts` | Medicare reference pricing |
| `src/lib/claims/eligibility.ts` | Pre-submission prediction |
| `workers/lib/integrity-service.ts` | D1 → facts → report |
| `src/lib/pricing/tiers.ts` | The platform fee schedule |

---

## Pricing

The commercial model lives in code, not in a spreadsheet someone emails around:
**the greater of a $9 monthly minimum or a graduated percentage of settled
member contribution volume** — 1.50% of the first $1.25M a month, 0.75% of the
next $11.25M, 0.50% above $12.5M.

Graduated means marginal, like tax brackets. Crossing a threshold lowers the
rate on the additional volume only, so growing across a boundary can never
increase the bill. A test asserts that directly, by walking the whole curve and
checking it never steps down.

Three decisions worth keeping:

- **Tiers are volume, not headcount.** Billing per member invites an argument
  about whether spouses, dependents, inactive members, and partial-month
  joiners count. Settled dollars are unambiguous and both sides can reconcile
  them against the same ledger.
- **No per-claim fee, ever.** A fee that scales with claims processed creates a
  quiet incentive to process fewer of them. For software whose whole argument is
  that stalled claims strand families, that would be self-defeating.
- **The fee is disclosed as a cost to the share ratio.** A platform fee is money
  that did not reach a medical bill. At the first band it is 1.50% of
  contributions — about 7.5% of the roughly twenty points of room the 80%
  medical-loss floor leaves. Software that asks a ministry to measure where
  every dollar went does not get to be vague about its own.

Every figure on `/pricing` is computed from this module rather than typed, the
same rule the ACA benchmark follows. Change the schedule and the page changes
with it; the content tests fail until the two agree.

### Billing

| | |
|---|---|
| `src/lib/pricing/tiers.ts` | The schedule. Pure. |
| `src/lib/billing/period.ts` | Month boundaries, closability, settlement. Pure. |
| `workers/lib/stripe.ts` | A small hand-written Stripe client + webhook signatures |
| `workers/lib/billing-service.ts` | D1 ↔ Stripe ↔ the schedule |
| `workers/api/billing.ts` | Connect onboarding, periods, estimates |
| `workers/api/stripe-webhook.ts` | The only unauthenticated write path |

**Member contributions never touch an Auxilium account.** They settle into the
ministry's own connected account; Auxilium invoices its platform fee against
that account at month end. Nothing in the schema models Auxilium receiving a
member's contribution, which is what lets the pricing page say sharing funds are
never held as operating money.

**The Stripe client is hand-written**, for the same reason the CSV parser is:
the official SDK is large and ships a Node HTTP client that has to be replaced
to work in a Worker at all, and the surface actually needed here is five
endpoints and a signature check.

Four things about the webhook are load-bearing, and each has a test:

- **Signature before meaning.** The payload is verified before it is parsed for
  anything except JSON validity. Without `STRIPE_WEBHOOK_SECRET` it refuses
  everything rather than trusting unsigned input — an unsigned webhook that
  writes to the ledger lets anyone fabricate settled contributions.
- **The signed payload is `timestamp.body`, with a five-minute tolerance.**
  Signing the body alone would make a captured request valid forever.
- **Every event is claimed exactly once**, by Stripe's own event id under a
  unique constraint. Stripe retries on any non-2xx and can deliver a successful
  event twice; without the claim a redelivered `payment_intent.succeeded` bills
  a ministry for the same money twice. A handler failure *releases* the claim
  and returns 500, because that is the one case where a retry is wanted.
- **Unknown event types return 200.** Erroring on an event we do not handle
  makes Stripe retry it forever and eventually disable the endpoint — taking the
  events we do handle down with it.

**Refunds net against the month the contribution was in**, not the month the
refund happened, and the fee is charged on the net. Charging a percentage of
money that went back to a member would be indefensible.

**The monthly close runs at 06:00 UTC on the 1st**, not midnight. Card
settlement is not instantaneous, and closing a month the second it ends invoices
before the last of its money has landed. `closePeriod` refuses to close a period
that has not ended and is idempotent at two levels — a period past `open` is
returned untouched, and Stripe's idempotency keys are derived from org and
period — so a double-fired cron cannot double-bill.

### Processor migration

The thing that actually blocks a ministry from switching is not features. It is
believing that leaving means asking five thousand households to re-enroll. That
belief is wrong — stored cards and verified bank mandates transfer
processor-to-processor with no member action — and disproving it is worth more
than most features.

| | |
|---|---|
| `src/lib/migration/processors.ts` | Who releases what, and the request letter |
| `src/lib/migration/manifest.ts` | The card-data guard, validation, reconciliation |
| `workers/api/migration.ts` | The wizard endpoints |
| `schema/migrations/0004_processor_migration.sql` | Migration + per-member rows |

**Auxilium is the coordination layer, not the courier.** Payment data goes from
the losing processor to Stripe directly. Routing it through here would put
primary account numbers in this system and drag it into full PCI DSS scope —
which is what fails the security review of the large, risk-averse ministry this
feature exists to win. Every user-facing benefit survives without it.

`containsCardData` is the enforcement, and it is the most important function in
the module. Any run of 13–19 digits that passes a **Luhn check** fails the
upload before a byte is stored. Luhn matters: without it every long member ID
and phone number trips the alarm, the alarm gets ignored, and it stops
protecting anything. A refused upload is written to the audit log — somebody
nearly sent us card numbers, and that is worth a record precisely *because* we
refused it.

Three other decisions worth keeping:

- **Matching is member number, then email, then it stops.** No fuzzy matching,
  same as the roster importer and for a worse reason: a wrong match here does
  not create a duplicate somebody notices later, it debits a family that never
  agreed to it. An unmatched row is a short list for staff.
- **Billing anchors are preserved, and day 31 clamps rather than rolls.** A
  member billed on the 31st is billed on the 28th in February, not skipped.
- **The dual-run board counts successful charges, not imports.** The trigger for
  retiring the old processor is a number reaching zero, not a date in a plan.

The guide at `/guides/moving-members-to-a-new-processor` names the failure mode
that actually costs ministries members: a blanket "everyone please re-enter your
payment information" email. The churn ministries fear when switching is almost
entirely self-inflicted, and it comes from over-communicating a change that did
not require member involvement.

**`formatRate` rounds in basis-point space** before formatting. Two decimals of
a percentage *is* one basis point, and `(82.5/100).toFixed(2)` renders "0.82"
rather than "0.83" because 0.825 has no exact binary representation. Each of
those digits is a rate a ministry could hold us to, so the whole published rate
card is pinned in a test.

### One calibration rule worth knowing

Rate-based rules have a **minimum sample floor** (`MIN_RATE_SAMPLE = 5`). "1 of
1 denials" is a 100% rate carrying almost no information, and without the floor
a small ministry with a single lapse scored identically to Aliera. A score that
cannot tell those two apart is one nobody will trust a second time.

The demo shows the intended spread: Shelter Valley sits at **50/100 (concern)**
with an 89% ratio and three real operational lapses; Redemption sits at
**0/100 (critical)** at 16%.

### Onus, sharpened

NRI's Onus direction was "how heavy is this case". It is now "is this case
being handled properly", which is what actually predicts a member being
financially stranded: SLA breach, unacknowledged claim, denial without a
guideline, incomplete intake, stalled secondary-payer coordination, overdue
appeal.


---

## The knowledge base

Two libraries, one index. Staff need to know how to operate the software and
how to make a decision that holds up. Members need to know what is happening to
their bill, what they may ask for, and what to do when the answer is no. The
second group is the one this has to serve well: they are reading because
something went wrong, and the alternative to a good answer is a phone call they
may not make.

| | |
|---|---|
| `src/lib/knowledge/staff.ts` | Operating the product, and deciding defensibly |
| `src/lib/knowledge/member.ts` | Process, rights, and what to do when declined |
| `src/lib/knowledge/search.ts` | Term scoring, field weights, the audience rule |
| `src/lib/knowledge/answer.ts` | Library + the asker's own record → an answer |
| `workers/api/knowledge.ts` | Browse, search, ask, gaps, ministry articles |
| `src/features/nri/AskPanel.tsx` | Ask, inside the compass drawer |

**Retrieval is term scoring, not embeddings**, for the same three reasons the
NRI rules are not a model: it is explainable (a wrong answer can be shown its
matched terms and fixed with a one-line synonym), deterministic (the same
question returns the same articles in eighteen months), and it needs no key and
no network — the knowledge base has to work on the day the ministry most needs
it, not the day the vendor is up. **There is no generation step anywhere.**

**An answer combines the library with the asker's own record.** Either alone is
close to useless: "claims are usually reviewed within 17 days" does not help
someone on day 40, and "your claim is on day 40" does not say what to do. The
render order is the argument — account facts, then the answer, then steps, then
limits, then sources. Limits sit *above* sources because a caveat under a
citation reads as boilerplate, and this caveat is what stops someone acting on
false reassurance.

**No outcome is ever promised.** "Likely" is the strongest available word about
a future decision — the same discipline the eligibility check follows, and for
the same reason. A member told "you're covered" and then declined has been
harmed twice.

**Audience isolation is deliberately one-way** (`readableBy`). A member must
never reach staff operations material; staff read member articles freely,
because someone on the phone with a frightened member needs to see exactly what
that member has been told. Hiding it would mean the people answering the
questions cannot read the answers. A live check caught this the wrong way
round.

**Every legal claim carries a source, and a test enforces it.** Member articles
matching a legal-assertion pattern must have at least one source with a real
URL. The rule is narrow on purpose: a guard that flags every use of "state" or
"require" gets muted, and then it guards nothing.

### The two things members most need and least know

Both came out of research, and both are worth more than most features:

- **Appealing works about half the time and almost nobody does it.** Colorado's
  2024 filings — the only compelled per-ministry data in the country — record
  13,741 denials, 111 appeals, and 54 of those approved. Under one percent
  appealed; roughly half of the appeals succeeded.
- **The leverage is against the hospital, not the ministry.** Sharing cannot be
  compelled; a nonprofit hospital's obligations can. Members get a ~240-day
  financial-assistance window, a 120-day floor before extraordinary collection
  actions, and a cap at amounts generally billed rather than list price. And
  because sharing is not insurance, CMS treats members as **uninsured** for the
  No Surprises Act — which *grants* them a Good Faith Estimate and the
  $400/120-day dispute process, while *withholding* balance-billing protection.
  That asymmetry is stated explicitly rather than smoothed over.

### Ministry articles

`kb_articles` layers a ministry's own answers over the platform library, and a
matching slug wins. If a ministry has written its own answer about its own
waiting period, that answer is the correct one.

### Unanswered questions are the product

Every question is recorded with the confidence of its answer. `/knowledge/gaps`
lists the ones that matched nothing — each is either an article worth writing or
a wording members use that the articles do not. "This did not help" is
volunteered, never inferred: asking again is not evidence the answer was wrong,
and treating it as such would fill the report with noise.

---

## Onboarding a ministry

A new organization used to land in an empty shell: no guidelines, no roster, a
turnaround commitment it never chose, and a board with nothing on it. Every one
of those is a real gap — a ministry recording declines against no published
guidelines is generating findings against itself on day one.

| | |
|---|---|
| `src/lib/onboarding/steps.ts` | The steps and what breaks without each. Pure. |
| `workers/lib/onboarding-service.ts` | D1 → facts → the checklist |
| `src/features/onboarding/SetupChecklist.tsx` | On the dashboard, above everything |
| `src/features/onboarding/CommitmentSettings.tsx` | SLA days, appeal days, governing rule |
| `src/components/EmptyState.tsx` | What a page says when it has nothing |

**It is a checklist, not a wizard, and it blocks nothing.** A ministry will not
have its guidelines ready the afternoon it signs up. Software that gates on
setup gets abandoned at step three; a list that says what is missing and lets
you work meanwhile gets finished over a fortnight.

**Status is derived, not recorded.** "Has this ministry published guidelines" is
answered by looking for guidelines. A recorded flag drifts the moment a step is
undone, and a tick next to something no longer true is worse than no checklist.
Exactly two things are stored in `organizations.onboarding_state`, because
neither can be observed: whether a default was actively **chosen** — `sla_days`
holds a value from the moment the row exists, so its presence proves nothing —
and whether the list has been dismissed.

**Dismissing is not completing.** The checklist hides, and the gaps are still
reported to anything that asks.

**Every step names the specific consequence**, and a test enforces that none of
them says "recommended". "Publish your guidelines — recommended" is ignorable;
"every decline you record will be flagged as citing no published provision" is a
reason. A product whose whole argument is that a system nobody can argue with
does not get trusted cannot ship a checklist that will not explain itself.

### Empty states

Every empty state answers three questions in order: what goes here, why it is
worth having, and the one thing to do next. Three rather than one, because "No
members yet" is barely better than blank — an empty table is the most common way
a new ministry concludes the product is broken, since nothing distinguishes
"nothing has happened" from "something failed".

They also distinguish **an empty filter from an empty ministry**. "No cases
match that filter" is a confusing thing to read when the reason is that no case
has ever been submitted, and only one of those is a setup problem. The dashboard
does the same: "good day to do the slow work" is false reassurance when the
board is empty because nobody has been imported.

**There is still no self-serve signup.** `POST /api/auth/bootstrap` creates the
first ministry and then refuses forever, so a second one cannot be created
through the product at all. That guard is deliberate for a pre-launch instance,
but open registration is a product decision nobody has made yet.

---

## The brand system

A ministry picks a colour and a typeface once and every surface follows: the
staff app, the member portal, the public application form, and — once the site
builder lands — its own site. One source of truth, because the version where a
ministry restyles five things separately is the version where four stay wrong.

| | |
|---|---|
| `src/lib/brand/tokens.ts` | Colour maths, the derived palette, CSS emission. Pure. |
| `src/features/brand/BrandStudio.tsx` | The studio, in Settings → Brand |
| `src/features/brand/BrandProvider.tsx` | `useBrand` — applies a palette to a page |

**The hard part is not storing a hex code.** It is that a ministry can pick a
colour that makes its own product unreadable, and will — pale yellow, or a
mid-grey that fails against both white and black. So `resolveBrand` does not
apply colours; it takes an intent and *derives* a palette that is guaranteed
legible. Refusing to render unreadable text is not a limitation on somebody's
brand; it is the difference between a design system and a colour picker.

**Every adjustment is explained, never silent.** A ministry that picks pale
yellow is told, in plain words, that links use a deeper version and buttons keep
what they chose, with the exact hex change. Quietly overriding somebody's brand
feels broken; explaining it feels careful.

**Only the ministry's own choices produce an adjustment.** Our internal
derivations being clamped — muted text darkened to clear AA — are not reported.
A list of "changes" full of things nobody asked for is a list nobody reads,
which buries the one entry that matters.

**Secondary text is held to the same bar as body text.** "Less important" is not
"optional to read", and this is where accessibility quietly fails in most
products.

Three things the tests pin, all of which were real bugs first:

- **Contrast is checked on the *rounded* colour.** Checking in float space and
  rounding afterwards let a value that passed at 3.0001 round down to 2.99 —
  passing the test and failing the user.
- **`ensureContrast` returns black or white if the walk exhausts**, rather than
  the last step short of it. A function that promises legibility must not return
  "very nearly legible".
- **The walk is in small steps**, so a bright teal becomes a deeper teal rather
  than navy. The result is the closest legible version of what they chose.

**The preview is the real thing.** The same `resolveBrand` runs in the studio on
every keystroke and on the server. A preview computed differently from
production is a lie that gets discovered by a member. And it previews a member
surface — a bill, a due date, a button — rather than swatches, because a row of
colour chips tells a ministry nothing about whether their brand works.

### The generated assets

`src/lib/brand/assets.ts`, shown under the studio preview. A ministry that has
picked a colour and a typeface has already specified everything an identity
needs; what it does not have is the six files somebody will ask it for in the
first fortnight. Generated from the same `ResolvedBrand`, so they cannot end up
disagreeing with the site — which is the whole argument for generating them
rather than accepting an upload.

**A monogram, never a symbol.** A generated cross, heart, or clasped hands is a
claim about what a ministry *is* that we are not in a position to make, and the
generic ones look worse than initials at every size. The initials skip the words
the whole category shares, so "The Good Shepherd" reads GS rather than TG.

**Everything is SVG**, which is sharp at 16px and at print size and costs
nothing to store. The one place that is not enough is a link preview — Facebook,
LinkedIn, and most email clients will not render one — and that is stated next
to those two downloads rather than in documentation, because a ministry that
uploads an SVG and gets a blank preview will not connect it to a footnote.

---

## The ministry site

Every ministry gets a public website at `/{slug}`, server-rendered from this
same Worker in the ministry's own brand. It is not a general website builder:
ministries do not need another Squarespace, and one built here would lose to
Squarespace. What they need is the six or seven pages this category actually
requires, written well, wired to the product so they cannot go stale.

| | |
|---|---|
| `src/lib/cms/blocks.ts` | Block shapes, the template, reserved slugs, live resolution, review. Pure. |
| `workers/lib/site-service.ts` | D1 → pages + brand + live context |
| `workers/marketing/ministry.ts` | The public renderer |
| `workers/api/cms.ts` | The editor's API |
| `src/features/cms/SiteBuilder.tsx` | The builder, at `/site` |
| `schema/migrations/0011_site.sql` | `nav`, `position`, `site_published_at`, `custom_domain` |

**Templates first, blocks second.** A ministry starts from four pages that are
already right and edits sentences, rather than from an empty canvas. Given a
blank page most ministries produce something worse than the template. The one
page that earns its place on argument alone is *what is and is not shared* —
vagueness there is the single biggest source of the decline nobody saw coming.

**Three blocks are live.** `share_ratio`, `guidelines`, and `apply` hold no copy;
they render from the ledger, the guideline table, and the published application
form. A ministry that hand-types its share ratio has a wrong number on its
website within a quarter, and the wrong number is the one a journalist
screenshots. Live blocks cannot drift because there is nothing to drift from.

**Publishing the ratio is the ministry's decision, and one decision.**
`organizations.brand.publish_share_ratio` gates both the site block and
`/api/integrity/public/:slug`. It used to gate only the API, so a ministry that
had not opted in got the figure published on its own website anyway by keeping a
block the template put there — a product arguing for consent-based disclosure
cannot have one surface asking and the other assuming. The flag has **three**
states and the third is load-bearing: `true`, an explicit `false`, and absent
meaning nobody has been asked. That is what makes "have they decided?" derivable
without storing anything, and it is a step on the setup checklist.

**The published ratio is the integrity report's own number**, from
`gatherIntegrityFacts` — not a second query that means roughly the same thing.
Two numbers for one fact is what this product spends the rest of its time
arguing against, and a ministry whose website and dashboard disagree about where
the money went has been handed the exact problem it bought the software to
avoid.

**A live block with no data behind it is dropped, not rendered empty.** A "Share
ratio" heading over a dash reads to a visitor as a ministry with something to
hide. The editor runs the same resolution, so a ministry sees the section
missing — with the specific thing to go and do — while it can still be fixed.
`reviewSite` names the gap in terms of the action ("record a month of
contributions"), because "no data" is not actionable — and it distinguishes an
empty ledger from an undeclared choice, because telling a ministry with eighteen
months recorded to "record a month of contributions" is the kind of wrong advice
that makes somebody stop reading warnings.

**The demonstration ministries are labelled, unindexed, and still public.** They
stay reachable so a prospect can be sent a link, but one of them deliberately
reproduces documented misconduct at a 16% share ratio, so every page carries an
unremovable banner in high contrast *outside* the ministry's brand — a notice
styled like the site it warns about reads as part of the site — plus `noindex`,
and they are excluded from the sitemap. A fabricated ministry in a search result
carries none of the banner into the snippet.

**The guidelines block reads the ministry's declared governing rule.**
Ministries publish four different answers to *which version binds a member* and
all four are in real use, so the sentence on a public page is rendered from
`organizations.governing_version_rule` rather than assumed. Undeclared says
nothing at all: scoring falls back to the strictest reading, but stating that
reading publicly would put words in a ministry's mouth.

**Publishing is a decision about the site, not about a page.** A ministry
building its first site has pages in every state for a fortnight. When
publishing a page was the same act as launching, the public address started
answering the moment somebody clicked publish on a draft — with one page and no
navigation. Nobody decided to launch; the schema did. Everything in
`reviewSite` is a warning except one: a site with no `home` page publishes a
front door that 404s, and that blocks.

**The preview is the published page**, from the same `resolveSite` under the
same `brandCss`. A test pins the corollary that caught the one real bug here: a
block with an action *label* and no *href* drew a button in the preview and
nothing at all on the published page.

**The stylesheet is deliberately not the marketing site's.** Reusing Auxilium's
design system would make every ministry's site look like an Auxilium page with a
different accent, which is the opposite of a white label. And the rule about
JavaScript is stricter here than on the marketing site: there is none. Exactly
one `h1` per page — the first block's heading — because a page whose every
section is an `h1` is the most common way a block editor produces something a
screen reader cannot be navigated by.

### Custom domains

`/{slug}` is the default and needs no DNS, no certificate, and no explanation.
A custom domain is the upgrade.

| | |
|---|---|
| `src/lib/cms/domains.ts` | Normalizing, validating, the DNS instructions. Pure. |
| `workers/lib/domain-service.ts` | DNS-over-HTTPS verification, host → ministry |
| `src/features/cms/DomainSettings.tsx` | The setup panel |
| `schema/migrations/0012_custom_domains.sql` | Token, verified-at, checked-at |

**Routing reads `custom_domain_verified_at`, never `custom_domain`.** A row is a
claim; serving on the strength of a claim would let anybody who can type into
the box have their content served under a hostname they do not control. Nothing
happens until a TXT record only the owner could publish has been seen.

**The host check sits ahead of the API and the marketing router**, because on a
custom domain the precedence inverts: `/` is the ministry's home page and
`/pricing` is the ministry's page called pricing. Falling through would serve
Auxilium's marketing site under somebody else's brand and, at `/sitemap.xml`,
hand out a list of every other ministry using the product.

**The app and the API are not served there.** `/app/*` redirects to the platform
host and `/api/*` answers 404 naming it — a redirect would silently drop the
body of a POST. Sessions are cookies scoped to the platform host, and serving
the app on a second hostname would give a member two origins and a session on
only one, which presents as being randomly logged out.

**Verification asks two resolvers from two providers**, and either seeing the
record is proof — the record is public by construction. A ministry that has just
changed nameservers is often visible to one cache and not the other for an hour,
and a check that fails in that window sends somebody back to "fix" a record that
was already correct. A resolver failure is logged even though the API cannot
distinguish it, because otherwise an outage in verification presents as every
ministry suddenly being bad at DNS.

**Verification never reverses.** `COALESCE` keeps the first success: a later
check that cannot see the record must not take a live website down over a
transient lookup.

**Both addresses keep working, and only one is canonical.** Removing `/{slug}`
the moment a TXT record appears would break it while the routing record is still
propagating. So both answer, both declare the ministry's own domain as canonical,
and the sitemap lists that one.

**The instructions name the TXT record first and say why.** A ministry that adds
the routing record first points its *live* website at a Worker not yet serving
it, taking their existing site down while they wait. That is the most damaging
mistake available here and it is entirely avoidable by ordering two paragraphs.

**Reserved slugs are checked twice**, at rename and at request. The two guards
protect against different things: the rename guard stops a ministry taking
`/security` today, and the request guard stops a ministry that took a slug
before the marketing site had a page there from shadowing it tomorrow.
`renderMinistry` runs only after the content registry misses, so Auxilium's own
pages always win a collision.

**The disclaimer is in the renderer, not the template.** "Not insurance,
sharing is not guaranteed, you remain personally responsible" appears in the
footer of every page and a ministry cannot edit it out — not as a legal shield
for Auxilium, but because a visitor who misses it is the person this whole
product exists to stop being blindsided.

**Ministry pages are in Auxilium's own sitemap.** They share the origin, so a
separate sitemap nothing links to would leave a ministry with a website that
does not work as a website. Both halves of the filter matter: a published page
on an unlaunched site must not appear, and neither must a draft on a launched
one.

---

## Membership applications

A ministry's front door. Before this, people arrived only by import or by being
typed in — so every ministry ran a form somewhere else and retyped the results.

| | |
|---|---|
| `src/lib/applications/schema.ts` | The spine, the field types, the default form |
| `src/lib/applications/validate.ts` | Per-field validation and answer pruning |
| `src/lib/applications/spam.ts` | Scoring. Never rejection. |
| `workers/api/applications.ts` | The public endpoint and the staff routes |
| `workers/lib/application-service.ts` | Accepting: form → household → members |
| `src/routes/ApplyPage.tsx` | The public form, no session required |
| `src/features/applications/FormEditor.tsx` | The configurable half, in Settings |

**A fixed spine plus configurable sections.** The spine is whatever creating a
household requires — names, contact, who else is joining, requested start date
— and it is not editable, because approval writes it to real records and a form
that might not collect a surname cannot create a member. The sections are
everything ministries genuinely differ on, and they differ enormously: faith-
gated ministries want a statement of faith and church attendance, one wants a
pastor's signature; others explicitly welcome all faiths and ask only ethical
attestations. Tobacco is disqualifying at three large ministries and a monthly
surcharge at four others. A single fixed form cannot serve both ends of that,
and a builder with no spine cannot create a household.

**The default form deliberately has no statement of faith**, and a test enforces
it. Roughly half the category does not gate on one; a default that assumes
otherwise ships every non-faith-gated ministry a form misrepresenting them until
somebody notices. Adding a section is a change; removing a wrong one is an
apology.

**A submitted application is immutable.** What somebody disclosed at application
is the exact evidence a decline three years later gets argued against.
Corrections supersede via `supersedes_id`; the original is kept.

**It records the guideline version in force at submission.** Under the enrolment
rule that is the document binding the member, and without the anchor a decline
years later cannot say which one they actually agreed to.

**Accepting creates the household and everyone on it**, in one batch. The
applicant becomes the primary contact — household complexity scores on the
primary only, and a household with nobody marked puts a family of eight on the
board as eight rows. `classifyRelationship` maps what people type ("my boy",
"step-daughter") onto the enum the schema stores, and **age overrides wording**,
because `is_dependent` feeds Familia and a typo should not hide a child.
`joined_at` honours the requested start date, since that decides which guideline
version binds them.

### The second unauthenticated write path

The first is the Stripe webhook, defended by a signature. There is no equivalent
here — the point is that a stranger who found the ministry can apply. Instead:

- Nothing is reachable until a ministry **publishes**. An unpublished form and a
  nonexistent ministry return the same 404, so the endpoint cannot be used to
  enumerate which ministries use Auxilium.
- Answers are **pruned to what the form asked**. Otherwise anyone could write
  arbitrary keys into a ministry's records through a field never rendered, and a
  reviewer would have no idea it was there.
- The source address is stored **hashed** — enough to count, not enough to keep
  an address against a medical-adjacent record.
- **Spam is scored, never enforced.** A high score sorts an application into a
  low-confidence tab a human still reads. Nothing is ever dropped: a silent drop
  tells an applicant their form was sent when it does not exist, and the cost of
  a false positive is a family's membership. No CAPTCHA — it taxes every
  legitimate applicant, fails hardest for people on poor connections and screen
  readers, and is defeated cheaply.

### Health disclosure, the second stage

`src/lib/applications/health.ts`, `/app/portal/health`. Deliberately not on the
public form: pre-existing questions are the most sensitive thing a ministry
collects and the exact material a decline gets argued over, and collecting them
from an anonymous stranger over an unauthenticated POST is avoidable. A member
answers signed in, about themselves, and it is audited. A test asserts the
public form contains none of these question keys, so the boundary cannot erode
quietly.

**Per person, never per household.** A pre-existing condition belongs to one
member; recording it against a household would let a spouse's diagnosis limit a
child's need, which is not how any published guideline works.

**The lookback window is in the question.** Twenty-four months at some
ministries, thirty-six at others, sixty for cancer at one. "Have you had any of
the following" means something different at each, so the window is rendered into
the question rather than left as a footnote — and every stored disclosure keeps
the window it was answered under, because a "no" to a two-year question is not a
"no" to a three-year one.

**A yes always asks what.** A bare yes is not something a ministry can act on
and not something a member can be held to. A no is never questioned — pressing
somebody to justify one turns this into an interrogation, and the honest answer
to most of these is no.

**Corrections supersede; nothing is erased.** `supersedes_id` points *backwards*
at the row replaced and `superseded_at` retires it. Two columns rather than one,
and the direction is load-bearing: a single forward-pointing column makes the
old row reference a row not yet inserted, and reversing the write order trips
the one-live-row index instead because both are briefly live. Found by running
it.

**The default asks no condition checklist.** Regulators have published what
ministries treat as pre-existing — asthma, diabetes, sleep apnea, autism — and a
default that ticks those off invites a ministry to adopt someone else's
exclusions without deciding they are its own. A test enforces it.

**A partly-disclosed household is not disclosed.** Treating "most of them" as
done is how a need gets declined over a person nobody asked about, discovered at
the worst possible moment.

**Nothing here declines anybody.** Validation stops an incomplete form; there is
no path from an answer to a rejection. Same discipline as the eligibility check:
a person refused by a form has been refused by something that cannot be argued
with.

The board sorts **oldest first**, and flags an application nobody has opened —
the same reason claims do. An applicant cannot tell "being considered" from
"lost", and assumes the first until it is too late to assume anything.

---

## The member portal

`/app/portal`. A member is not staff with fewer permissions — they are a
different audience, in a different table, behind a different cookie.

| | |
|---|---|
| `workers/api/member-auth.ts` | Login, invite redemption, password, their own claims |
| `src/app/MemberAuthContext.tsx` | The portal session, separate from staff |
| `src/app/PortalShell.tsx` | Four destinations, and no more |
| `src/routes/portal/` | Bills, one bill, rights, accept-invite, login |
| `src/features/members/PortalAccess.tsx` | The staff side: minting an invite |

**Isolation is structural, not a role check.** Staff sessions live in
`sessions` keyed to `users`; member sessions live in `member_sessions` keyed to
`member_accounts`, under a different cookie. A member session cannot satisfy
`requireUser` because the lookup goes to a different table entirely — not
because a query remembered to compare a role. A role column is something a
query can forget to filter on; a different table is not. The same split is
mirrored in the router: `/portal/*` never mounts the staff `AuthProvider`, and
the staff tree never mounts `MemberAuthProvider`.

**Every member query scopes by `member_id`, never `org_id`.** Staff scope by
org because a staff member may legitimately see anyone in their ministry. A
member may see exactly one person's medical circumstances. An org-scoped query
on the member side would hand every member the whole roster's claims and would
look completely normal in review.

**Members set their own password.** Staff mint a single-use invite; Auxilium
does not send it. The ministry emails it from its own address, because a
household that has never heard of us will open a message from the ministry it
belongs to and treat one from an unknown vendor about their medical bills as
phishing — which is the correct instinct. The link is shown on screen so staff
can read it to someone on the phone. Re-inviting voids the previous link, and
suspending drops every live session rather than only blocking the next login.

**Every sign-in failure returns the same sentence.** Wrong password, unknown
email, suspended, invited-but-never-activated. Distinguishing them would turn
the login form into a way to ask whether a given person belongs to a health
sharing ministry.

### What the portal shows

Four destinations: **your bills**, **your health**, **your rights**, **answers**. "Your
rights" is top-level rather than a knowledge-base search result, because the
two facts worth most to a member — that appealing works about half the time and
almost nobody does it, and that the leverage is against the hospital rather
than the ministry — are worthless if you have to know what to type to find them.

A declined need shows the reason, the guideline provision cited, and **the
absence of one just as plainly**. Hiding "no provision was recorded" from the
member would be indefensible in a product that scores the ministry on exactly
that fact.

`member_message` on every claim comes straight from the SLA engine, so the
wording a member reads derives from the same computation the staff escalation
board runs on. There is no separate member-facing story that can drift from the
operational one.

**A declined tracker stops at the decision.** It used to mark *review* as
failed and leave "Being paid" and "Paid" sitting below as upcoming steps —
telling somebody whose need had just been refused that money was still on its
way. That is the precise false hope this product exists to prevent. Found by
opening the page, not by reading the code.

### The demo

`schema/seed-portal.sql`, run by `db:seed:local` / `db:seed:remote`. Password
`auxilium-member-2026`, and the accounts are picked for the situations they are
in: an ordinary active mix, a large claim in review, two declines (one
pre-existing, one fixable documentation), a need being paid, and one member
invited but never activated so the acceptance flow has something to redeem.

**Teardown lives in `schema/seed-reset.sql` and runs first.** Each seed file
used to clean up after itself, which worked only because the local workflow
wipes the database before seeding — the deletes never had anything to delete.
Seeding a database that already has rows, which is what seeding any deployed
environment is, hit a foreign key immediately: `seed.sql` deletes `needs` while
the integrity seed's disbursements and appeals still point at them, and now
`member_accounts` points at `members` too. One leaf-first teardown fixes the
ordering once rather than in three files that each know a piece of it. Every
statement is scoped to the two demo organizations by id, which is the property
that makes it safe to point at a deployed database at all.

Seeding a deployed environment is a manual `workflow_dispatch` only. Production
additionally requires typing a confirmation phrase — a push cannot set it and a
checkbox is one mis-click. The old guard refused production outright, which
protected against accident at the cost of making the demo unreachable on the
live site; the phrase keeps the first property without the second. The same
step also had the dev database name hardcoded regardless of target, and ran
only the first of the seed files.

---

## The marketing site

Auxilium's public site is **server-rendered from the Worker**, not the SPA.
`src/content/` holds a typed registry of pages; `workers/marketing/` renders it
to HTML.

That is deliberate. These pages exist to be read by search crawlers and by
assistants summarizing this category, and both do markedly better with real
HTML than with an app that paints itself after a bundle loads.

### The rule about JavaScript

This used to ship literally zero. It now ships about a kilobyte, inline, for two
things HTML cannot do: a mobile drawer with correct focus and Escape handling,
and scroll-reveal animation.

The rule that replaced "no JavaScript" is stricter and more useful: **the page
is complete without it.** Reveal animations are armed by a `.js` class the
script adds to `<html>`, so if the script is blocked, fails, or has not parsed
yet, every element renders exactly as authored — visible. There is a 2-second
failsafe that reveals everything regardless, because an animation that does not
play is a rounding error and content stuck at `opacity: 0` is the whole site.
Nothing is hydrated, nothing is fetched, and no content exists only in
JavaScript.

The feature filter on `/features` is **CSS-only** — radio inputs plus `:has()`.
Every card stays in the DOM whatever is selected, so a crawler reads the full
feature set rather than whichever slice was default.

### Files

| | |
|---|---|
| `workers/marketing/brand.ts` | The compass logo, palette, type, motion keyframes |
| `workers/marketing/styles.ts` | Component CSS, split from the tokens |
| `workers/marketing/mockups.ts` | Product replicas in a chromeless browser frame |
| `workers/marketing/render.ts` | Blocks → HTML, the shell, and the inline script |
| `src/content/features.ts` | Every feature, categorised and tagged |

**The mockups are HTML, not screenshots and not React.** They are replicas of
the real screens built from the same tokens. That buys four things worth more
here than pixel fidelity: they are real text a crawler and an assistant can
read, they reflow on a phone where a dashboard screenshot is unreadable, they
follow the visitor's light/dark preference, and they cost a few kilobytes
instead of a few hundred. They also cannot go stale against a redesign the way
a PNG does. The data in them is the demo ministry's, so what a visitor sees is
what they get when they click through.

### Routing

| Path | Served by |
|---|---|
| `/`, `/claims-integrity`, `/guides/*`, `/compare/*` | Worker, from the registry |
| `/robots.txt`, `/sitemap.xml`, `/llms.txt` | Worker, generated from the registry |
| `/api/*` | Hono |
| `/app/*` | The React SPA, via the ASSETS binding |

`run_worker_first = true` in `wrangler.toml` is load-bearing: without it the
assets binding answers `/` with the SPA's `index.html` before the Worker ever
sees the request. Unknown public paths return a **real 404**, not the SPA shell
— a soft 404 is both an SEO problem and a confusing experience.

The SPA is mounted with `basename="/app"`, so every `<Link to="/members">` in
the app keeps working unchanged.

**The SPA is split by audience, not by route.** A member opening their bill on a
phone was downloading the roster importer, the integrity centre, the site builder
and the brand studio — a few hundred kilobytes of software they have no
permission to reach. Same for a stranger filling in an application. The shared
chunk is now 96KB gzipped rather than 142KB, and each audience loads only its own
pages on top. Split at the audience boundary because that is where the boundary
already is: `/portal/*` and the staff tree mount different auth providers. The
knowledge base is lazy too, even though both audiences reach it, because Rollup
hoists a shared module rather than duplicating it — importing it eagerly to
"avoid duplication" would only guarantee that a stranger downloads every staff
operations article. The Suspense fallback is a worded loading state rather than
blank, because a blank screen mid-navigation on a bad connection is
indistinguishable from the app being broken.

### Adding a page

Add it to `src/content/pages.ts`, `pages-more.ts`, `guides.ts`, or
`comparisons.ts`, then export it through `registry.ts`. The sitemap,
`llms.txt`, and the guides index all derive from that registry, so they cannot
go stale and a page cannot ship orphaned.

Nineteen pages currently: home, features, pricing, who-its-for, security,
about, FAQ, claims integrity, NRI, how it works, the guides index, five guides,
and three comparisons.

### What the tests enforce

`src/content/content.test.ts` guards the things that rot silently:

- slug uniqueness, and every internal link resolving to a real page
- application CTAs pointing at `/app/*` rather than a bare path that would 404
- every guide carrying a category, nesting under `/guides/`, and clearing a
  minimum depth
- every home-page statistic carrying a source URL
- every comparison conceding at least one row to the alternative — a table we
  win outright is marketing, not a comparison
- **no ministry is named anywhere on the site**
- **prose matching the engine.** If a page says "80.0%", it is compared against
  `ACA_MLR_INDIVIDUAL_BPS`. Change the benchmark in the scoring code and the
  content tests fail until the copy is updated to match.
- no claim of preventing fraud or guaranteeing compliance
- **every feature carrying a `shipped` or `planned` status**, and at least one
  still marked planned — if that ever reaches zero it is far likelier that
  somebody relabelled the roadmap than that everything shipped at once
- every photograph carrying real alt text and a `/img/` path
- no mockup referencing a kind the renderer cannot draw
- **no invented price.** Pricing is a business decision; a currency figure in
  the content would be a fabrication presented as fact, so a tier may describe
  what it includes but may not state an amount until real numbers exist.

### Two editorial rules

**Comparisons target software, never ministries.** Large ministries are the
buyers here. Auxilium competes with the spreadsheet a ministry uses today, a
generic CRM someone adapted, and legacy administration platforms — so those are
what the comparison pages address, including where they win. Attack pages about
prospective customers would be both unfair and strategically self-defeating.

**Documented failures are described as patterns, with sources, never as
accusations.** The internal code comments cite specific cases as engineering
provenance; the public site cites the same public record without pointing at
any organization a reader might be evaluating.


---

## Recovery and abuse limits

[`docs/recovery.md`](docs/recovery.md) is the runbook: what is at risk, how to
use D1 Time Travel without discarding somebody else's afternoon, how to recover
one ministry without rolling back forty, and the gaps that are known rather than
fixed. Restore has been rehearsed against a scratch database and deliberately
never against production.

**Reconciliation closes the gap the webhook cannot, and repairs it.** Every
guard on the Stripe path — signature before meaning, the exactly-once claim,
release-on-failure — is about an event arriving *twice*. None is about it never
arriving, and a disabled endpoint or a deploy that 500'd through Stripe's retry
schedule both end as money that settled against a ledger that never heard about
it, which looks exactly like a quiet month.

An earlier version reported and refused to write, on the grounds that a
reconciler inserting contributions is a second, unaudited path into the ledger a
ministry is asked to stand behind. That objection was right about *silent*
repair and wrong about this one: what it writes comes only from Stripe — the
authoritative record of what settled — through `recordSettledContribution`, the
same function the webhook calls, with the same idempotency check and a full
audit row. Not a second path; the same path, polled instead of pushed.

**The asymmetry is the design.** Missing from the ledger is *inserted*: Stripe
says money settled and we have no row, so Stripe is right, and this is exactly
what an undelivered webhook produces. Missing from Stripe is **never touched** —
a contribution the ledger holds and Stripe does not is very often a cheque, cash,
or a bank transfer recorded by hand, and deleting it would destroy a real record
on the strength of a card processor not having heard of it. That case alerts and
waits for a person.

So a gap caused by our own delivery failure heals within a day and nobody is
told. `processor_fee_cents` is recorded as 0 on a repaired row rather than
guessed — a fabricated fee would understate what reached medical costs, which is
the one number this product must never quietly get wrong, and the webhook
arriving late is a no-op rather than a duplicate.

Three limits on the abusable surfaces, all failing **open** so an infrastructure
blip is never what stops a family joining:

- **256KB request bodies**, checked on `Content-Length` before anything is
  parsed. A 50MB POST to the public form otherwise costs real CPU before the
  first line of validation.
- **Twelve applications per address per hour.** Not a spam filter and nothing is
  dropped — a church office helping four households from one connection, or
  somebody retrying on a bad phone signal, must not be refused. The 429 names the
  phone as an alternative.
- **Negative caching on both hostname and slug lookups.** The `Host` header is
  chosen by the caller and the custom-domain check runs ahead of everything, so
  without caching *misses* a stranger turns one random hostname per request into
  one database read on every path. Caching only hits would have left it wide
  open, because the attack consists entirely of misses. Invalidated on publish,
  rename, domain verify, claim, and release.

### Alerts

Before this, the monthly close counted its failures and wrote them to
`console.log` — and worse, `closeAllDuePeriods` swallowed the exception entirely,
so a failed close never entered the results array and the "N failed" in that log
line was **always zero**. The summary read reassuringly no matter what happened.
A ministry's invoice could fail on the 1st and nobody, us included, would know.

| | |
|---|---|
| `workers/lib/alerts.ts` | Raise, dedupe, resolve, and who hears about it |
| `workers/lib/email.ts` | A hand-written Resend client. Degrades to logging. |
| `src/features/alerts/AlertBanner.tsx` | The in-app surface, above the checklist |
| `schema/migrations/0013_alerts_and_guideline_revisions.sql` | The table |

**Stored before sent.** An unconfigured or broken mail provider produces an
undelivered alert, never a lost one — the same rule the login limiter follows.
`/api/health` reports the mail configuration, because the symptom of getting it
wrong is an inbox that stays quiet, which is what a healthy system looks like.

**Deduped by condition, not occurrence.** A month that will not reconcile is
still broken an hour later; re-raising bumps a counter and sends nothing. The
bump is an `UPDATE … WHERE dedupe_key = ? AND resolved_at IS NULL` whose row
count decides whether to insert, rather than select-then-insert, so two
overlapping cron firings cannot both insert and trip the one-live-alert index.

**Resolved silently.** A "this is fixed now" message about something nobody was
told about is pure noise.

**Two audiences, and the split is not cosmetic.** A ledger that disagrees with
Stripe is usually *our* delivery failure, so it goes to `ALERT_EMAIL` and never
to the ministry — handing them a list of charge ids is alarming and unactionable
in equal measure. Ministry alerts go to owners and admins only, carry no
structured detail, and appear in-app above the setup checklist: a checklist is
about what somebody has not got round to, an alert is about something broken.
`ministryAlerts` cannot return an operator row, so the boundary does not depend
on a filter at the call site.

**Acknowledging is not resolving.** "I have seen this" leaves the row visible and
the condition true. One button that did both is how a dashboard shows green over
a live fault.

### Correcting a published guideline

`sharing_guidelines` was insert-only, with a unique index on `(org_id, version)`
and no update or delete path anywhere — so a ministry that published a version
with a mistyped effective date could not fix it at all, and its only escape was
publishing a near-duplicate that muddles which document binds which members.

Three things get called "changing the guidelines" and they have opposite
consequences. `src/lib/integrity/guidelines.ts` holds the rule:

- **A correction** — the record never matched the real published document. The
  erroneous text should never have governed anything, so declines scored against
  it are re-audited. Applied in place, which is what keeps the foreign key from
  `member_applications` and the unique index intact, with the previous row
  archived to `guideline_revisions` first. A reason is required: a correction
  with no stated reason is indistinguishable from a quiet rewrite.
- **A new version** — the rules genuinely changed. Both documents are real and
  each governed a period; re-scoring old declines against the new one would be
  falsifying the ministry's own history in the record a regulator would ask for.
- **A withdrawal** — published by mistake. Soft-deleted, and refused the moment
  anything depends on it. The refusal names the counts and says *correct it
  instead*, because a ministry told only "you cannot delete this" will publish a
  near-duplicate to get around it.

**The re-audit is a cache bust, not a rewrite.** Findings are recomputed from the
current text rather than stored, so invalidating `integrity:{org}` *is* the
re-score. A stored second opinion could immediately disagree with the live one
and there would be no way to tell which was right.

**Counting what depends on a version is asymmetric, and deliberately
over-counts.** Applications carry `guideline_version_id`, a real foreign key.
Declines do not — `denial_guideline_ref` is a *provision code*, and which version
governed a given decline is a computation over the org's governing rule and that
decline's anchor date. So the count matches every decline citing a code this
version contains, which over-counts when a code spans versions. The only thing
that number can block is a withdrawal, and refusing to remove a document that
might be cited beats removing one that is.

---

## Deploying

**GitHub Actions on push to `main` is the only deploy path.** It builds with
`--env production`, so the live Worker is `auxilium-app` bound to the
production D1/R2/KV. Production is `https://auxilium-app.jer-f84.workers.dev`.

Cloudflare Workers Builds was previously also connected to this repository and
deployed on every push. It has been disconnected, because two systems deploying
the same repo to the same Worker name is a race with a silent loser.

**The top-level config is deliberately not named `auxilium-app`.** It is
`auxilium-dev`. While the two shared a name, a bare `wrangler deploy` — which
is what a Cloudflare-side build runs — republished *production* bound to the
**dev** database, and nothing about the result looked wrong. Different names,
and that class of accident is no longer expressible.

Two consequences worth holding onto:

- **`wrangler deploy` builds its own assets.** `[build] command` in
  `wrangler.toml` exists because a deploy no longer always starts from
  `package.json`, where the scripts chain `bun run build &&`. A bare
  `wrangler deploy` without it ships a Worker whose `[assets]` directory is
  missing — the marketing pages still render, because the Worker generates
  those itself, so it looks like a working site while every `/app/*` route and
  every bundle 404s.

- **Queues are per-environment.** A Cloudflare queue has exactly one consumer.
  Sharing one set across environments meant whichever Worker deployed last
  owned the consumer slot while the others stayed producers — so a production
  import could be consumed by the dev-bound Worker and committed to the dev
  database, hanging forever and landing the rows in the wrong place with no
  error raised. Production uses `auxilium-imports-prod` / `auxilium-signals-prod`.
  `workers/index.ts` strips the environment suffix before dispatching, and
  deliberately does not match `-dlq`.

The CI pipeline gates on typecheck, lint, tests, and build, applies migrations
before deploying, and then fetches `/api/health` on the URL the deploy actually
printed. That last step used to derive a hostname, fail to find one, and exit 0
with a warning — reporting green without checking anything. If it cannot
determine where it deployed, it now fails.

A leftover `auxilium` Worker from the Workers Builds era may still exist in the
account, publicly serving an old copy of the site against the **dev** database.
It is not deployed by anything in this repository. Delete it in the Cloudflare
dashboard — two live copies of the marketing site is also duplicate content for
search.

---

## Recommended next work

Roughly in order of value.

**Fill in the write paths.** Members, needs, and prayer requests are fully
readable and the API supports every mutation, but the UI has create/edit forms
only for contact logging and follow-ups. The API contracts are settled; this is
form work.

**XLSX import.** One function, per the seam described above. The most commonly
requested thing that does not exist.

**Household-subject signals.** The schema already supports
`subject_type='household'`. Scoring the household directly is cleaner than the
current primary-contact proxy, and would let the board show a household as a
single row with its members underneath.

**Notification delivery.** Signals are computed and displayed but never pushed.
A daily digest of urgent members, with one-click unsubscribe, is the highest-value
addition — most missed follow-ups happen because nobody opened the dashboard.

**Cloudflare for SaaS hostnames.** Domain verification and host-based routing
are done; what is not is provisioning the TLS certificate. Until a custom
hostname is attached in Cloudflare, a verified domain pointed here gets a
certificate error rather than the ministry's site. That is an account-level
setup step, not code.

**PNG export for the generated assets.** The link preview and email header are
SVG, which Facebook, LinkedIn, and most email clients will not render. The
caveat is stated at the download; rasterizing needs a renderer the Worker does
not have.

**Team invites.** `admin/users` creates users with a password; a tokened invite
where the invitee sets their own is the right pattern.

**Trend over time.** `member_signals.updated_at` is a point-in-time value.
Historical scores would answer "is this ministry getting better at follow-up",
which is the question a director actually has.

---

## Working in this codebase

- **Read `src/lib/nri/rules.ts` first.** It is the product's opinion about what
  matters, written to be read.
- **Keep `src/lib/**` pure.** No Cloudflare imports, no React, no `Date.now()`
  inside a rule. If you need the clock, take it as an argument.
- **A rule you cannot explain in one breath does not belong in v1.**
- **Every score must remain explainable.** If AI is ever added, it advises a
  human — it does not silently move a number.
- **Voice:** warm, plain, direct. Error messages say what to do next. No
  corporate mush, no fear-based copy. This is software people open on the worst
  day of a family's year.
