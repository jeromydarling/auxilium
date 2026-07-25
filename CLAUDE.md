# Auxilium — handoff

A Health Sharing Ministry OS. Its job is to make sure nobody gets missed.

Health sharing ministries are communities where households share one another's
medical costs directly. They run on relationships and spreadsheets, and they
fail in a specific way: a family in crisis goes quiet, a case stalls in someone's
inbox, a follow-up that was promised never happens, and nobody notices until the
member leaves. **NRI — Need Response Intelligence — exists to notice.**

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

Click **Explore the demo ministry**. Full Cloudflare walkthrough:
[`docs/cloudflare-setup.md`](docs/cloudflare-setup.md).

| Command | |
|---|---|
| `bun run dev` | Worker + SPA against local D1/R2/KV/Queues |
| `bun run dev:vite` | Vite HMR, proxying `/api` to `:8787` |
| `bun run test` | Vitest — 96 tests over the domain logic |
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

18 tables in `schema/migrations/0001_initial.sql`, each commented with why it
looks the way it does.

---

## NRI — Need Response Intelligence

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

96 tests over the logic that carries the risk: NRI scoring, import parsing and
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
