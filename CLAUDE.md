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
| `bun run test` | Vitest — 242 tests over domain logic and content integrity |
| `bun run typecheck` / `lint` / `build` | The pre-merge gate |
| `bun run db:reset:local` | Wipe, migrate, reseed |

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

242 tests over the logic that carries the risk: NRI scoring, integrity and
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

---

## Degradation

Auxilium runs fully with no third-party keys and no paid plan:

| Absent | Behavior |
|---|---|
| `ANTHROPIC_API_KEY` | AI triage notes show "not configured". **Scoring is unaffected** — it is never AI-dependent. |
| Queues (free plan) | Imports commit inline; signals recompute inline. Logged, not silent. |
| KV unavailable | Login rate limiting fails **open**. A broken limiter must never lock a ministry out on the day it matters. |
| `SESSION_SECRET` | Dev uses a fixed key with a loud warning. **Production refuses to issue sessions.** |
| `STRIPE_SECRET_KEY` | Billing is **off, not broken**. Connect and invoicing answer "not configured"; the ledger, share ratio, scoring, and claims are untouched. |
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
85% large group)** — which health care sharing ministries are statutorily
exempt from. That exemption is the entire reason to measure against it: a
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
- **a denial applying a guideline that took effect after the member joined**

`POST /api/claims/:id/deny` requires both a reason code and a guideline
reference. It warns loudly — but does not block — when the citation does not
hold up, because blocking would push staff to pick whatever provision the form
accepts, and a recorded warning keeps the honest record instead.

### Claims that stop moving

`sla_days` (default 17, the turnaround Share Healthcare publicly stated and
missed by months) puts a due date on every claim at submission.

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

**Score spread at the top.** Genuinely urgent members all saturate at 100, so
the board ranks by band but not within it. Either raise the ceiling or normalize
weights so the worst case is distinguishable from the merely urgent.

**Notification delivery.** Signals are computed and displayed but never pushed.
A daily digest of urgent members, with one-click unsubscribe, is the highest-value
addition — most missed follow-ups happen because nobody opened the dashboard.

**The CMS block editor.** Pages, blocks, draft/publish, and a public read
endpoint all exist. The visual builder does not.

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
