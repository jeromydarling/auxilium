# Cloudflare setup

Everything needed to run Auxilium locally and deploy it, end to end.

The resources below are **already created** in the Cloudflare account this repo
was built against, and their real IDs are already in `wrangler.toml`. If you are
running against that account, skip to [Local development](#local-development).
If you are forking into a different account, start at
[Creating the resources](#creating-the-resources).

---

## What Auxilium uses, and why

| Resource | Binding | What it holds | Why not something else |
|---|---|---|---|
| **D1** | `DB` | Every record: members, households, needs, prayer requests, imports, signals, audit log | The system of record. Relational, transactional, and the only thing NRI scores can be rebuilt from. |
| **R2** | `DOCUMENTS` | Uploaded roster files, member documents, case attachments | Bytes do not belong in a database. Keys are org-prefixed so a tenant's whole object set is one prefix. |
| **KV** | `CACHE` | Dashboard summary cache, login rate-limit counters | Fast, eventually consistent, and *never* the source of truth. Everything in KV can be thrown away without data loss. |
| **KV** | `CONFIG` | Lightweight per-org config read on nearly every request | Read-through cache over D1. |
| **Queues** | `IMPORT_QUEUE`, `SIGNAL_QUEUE` | Import commits, NRI recomputes | Work too big for a request. Both producers degrade to inline execution if the queue is unavailable. |

**The rule that matters:** D1 is the source of truth. KV is a cache. If you ever
find yourself reaching for KV to store something you would be upset to lose, it
belongs in D1.

---

## Prerequisites

- **Bun** — `curl -fsSL https://bun.sh/install | bash`
- **A Cloudflare account.** The free plan runs everything except Queues.
- **Wrangler** — installed as a dev dependency; `npx wrangler` just works.

### Authenticate

```bash
npx wrangler login          # opens a browser
npx wrangler whoami         # confirm
```

For CI, use a scoped API token instead:

```bash
export CLOUDFLARE_API_TOKEN="..."
export CLOUDFLARE_ACCOUNT_ID="..."
```

The token needs: **Workers Scripts** (edit), **D1** (edit), **Workers R2 Storage**
(edit), **Workers KV Storage** (edit), and **Queues** (edit) if you use Queues.

---

## Creating the resources

Scripted:

```bash
bun run cf:setup
```

It creates everything, skips what already exists, and prints the IDs to paste
into `wrangler.toml`. To do it by hand:

### D1

```bash
npx wrangler d1 create auxilium-db-dev
npx wrangler d1 create auxilium-db-prod
```

Each prints a `database_id`. Put the dev one in the top-level and
`[env.preview]` blocks of `wrangler.toml`, and the prod one in
`[env.production]`.

### R2

```bash
npx wrangler r2 bucket create auxilium-documents-dev
npx wrangler r2 bucket create auxilium-documents-prod
```

Buckets bind by name, so there is no ID to copy.

### KV

```bash
npx wrangler kv namespace create AUXILIUM_CACHE_DEV
npx wrangler kv namespace create AUXILIUM_CACHE_PROD
npx wrangler kv namespace create AUXILIUM_CONFIG_DEV
npx wrangler kv namespace create AUXILIUM_CONFIG_PROD
```

Each prints an `id`. `*_DEV` goes in the top-level and `[env.preview]` blocks,
`*_PROD` in `[env.production]`.

### Queues

**Queues require a paid Workers plan.** If you are on the free plan, skip this —
Auxilium is built to run without it. Import commits and signal recomputes both
catch the failure and run inline instead. You will see this in the logs:

```
[imports] queue unavailable, committing inline: ...
```

That is the degradation working, not a bug.

```bash
npx wrangler queues create auxilium-imports
npx wrangler queues create auxilium-signals
npx wrangler queues create auxilium-imports-dlq
npx wrangler queues create auxilium-signals-dlq
```

The two `-dlq` queues catch messages that fail three times. Without them,
`wrangler deploy` will reject the config, since `wrangler.toml` names them as
dead-letter targets.

If `wrangler queues create` is unavailable on your plan, create them in the
dashboard: **Workers & Pages → Queues → Create queue**, using these exact names.

---

## Secrets

Never in the repo, never in `wrangler.toml`.

```bash
npx wrangler secret put JWT_SECRET     --env production
npx wrangler secret put SESSION_SECRET --env production
npx wrangler secret put ANTHROPIC_API_KEY --env production   # optional
```

Repeat with `--env preview` for the preview environment.

Generate strong values:

```bash
openssl rand -base64 32
```

### What each one does, and what happens without it

| Secret | Purpose | Absent |
|---|---|---|
| `SESSION_SECRET` | Salts session token hashing | Development uses a fixed key and logs a loud warning. **Production refuses to issue sessions** — a predictable signing key in production is worse than an outage. |
| `JWT_SECRET` | Signs session cookies | Same posture. |
| `ANTHROPIC_API_KEY` | AI-drafted triage summaries | The panel renders a "not configured" note. **NRI scoring is never AI-dependent** — every score is rule-based and stays fully functional. |

### Local secrets

```bash
cp .dev.vars.example .dev.vars
```

`.dev.vars` is gitignored. The defaults in the example file are fine for local
work.

---

## Local development

```bash
bun install
cp .dev.vars.example .dev.vars

bun run db:migrate:local     # create the tables
bun run db:seed:local        # five demo personas
bun run build                # build the SPA into dist/client
bun run dev                  # wrangler dev on :8787
```

Open <http://localhost:8787> and click **Explore the demo ministry**.

`bun run dev` runs `wrangler dev`, which serves the real Worker against local
emulations of D1, R2, KV, and Queues — nothing touches the network, and the
queue consumers genuinely run. This is the mode to develop in.

For fast UI iteration with HMR, run `bun run dev:vite` in a second terminal
alongside `bun run dev`; Vite proxies `/api` to the Worker on 8787.

### Verify it works

```bash
curl -s localhost:8787/api/health | jq
```

Every check should read `ok` or `bound`:

```json
{
  "status": "ok",
  "checks": {
    "d1": "ok", "kv_cache": "ok", "kv_config": "ok",
    "r2": "ok", "queue_imports": "bound", "queue_signals": "bound"
  }
}
```

Then exercise the real endpoints:

```bash
curl -s -X POST localhost:8787/api/auth/demo -c /tmp/c.txt        # sign in
curl -s localhost:8787/api/members -b /tmp/c.txt | jq '.items[0]'
curl -s 'localhost:8787/api/nri/triage?min_score=50' -b /tmp/c.txt | jq '.items[].member.last_name'
curl -s localhost:8787/api/nri/session -b /tmp/c.txt | jq '.nudges'

# The full import round trip against the deliberately messy demo roster
curl -s -X POST localhost:8787/api/imports -b /tmp/c.txt \
  -F "file=@scripts/demo-roster.csv;type=text/csv" | jq '.summary'
```

The import preview should report `create: 7, update: 1, skip: 1, error: 1` —
one existing member matched by email, one in-file duplicate, one nameless row.

### Resetting local data

```bash
bun run db:reset:local        # wipe, migrate, reseed
```

---

## Database operations

| Command | What it does |
|---|---|
| `bun run db:migrate:local` | Apply migrations to the local emulated D1 |
| `bun run db:migrate:remote` | Apply to the **dev** database on Cloudflare |
| `bun run db:migrate:prod` | Apply to the **production** database |
| `bun run db:seed:local` | Seed demo data locally |
| `bun run db:seed:remote` | Seed demo data into the dev database |
| `bun run db:reset:local` | Drop local state, migrate, reseed |

**Never seed production.** `db:seed:remote` deliberately targets the dev
database only; there is no production seed script, and adding one would be a
mistake.

### Adding a migration

Numbered SQL files in `schema/migrations/`, applied in filename order:

```bash
# schema/migrations/0002_add_something.sql
bun run db:migrate:local     # test locally first, always
bun run db:migrate:remote
bun run db:migrate:prod
```

Wrangler records applied migrations in a `d1_migrations` table, so re-running is
safe and only new files execute.

### Inspecting the database

```bash
npx wrangler d1 execute auxilium-db-dev --local --command "SELECT COUNT(*) FROM members"
npx wrangler d1 execute auxilium-db-dev --remote --command "SELECT COUNT(*) FROM members"
```

---

## Deploying

### Preview

Deployed staging. It points at the **dev** data plane on purpose, so a preview
deploy can never touch real ministry records.

```bash
bun run deploy:preview
```

### Production

```bash
bun run db:migrate:prod      # migrations first, always
bun run deploy:production
```

**Migrations before deploy, without exception.** New code against an old schema
fails on the first request; old code against a new schema is usually fine. Order
matters in one direction only.

### Verify the deploy

Local green is not shipped. Check the real thing:

```bash
curl -s https://auxilium-app.<your-subdomain>.workers.dev/api/health | jq '.status, .env'
```

Expect `"ok"` and `"production"`.

### Rolling back

```bash
npx wrangler deployments list --env production
npx wrangler rollback --env production
```

Rollback reverts the *Worker*, not the database. A migration that dropped a
column is not undone by a rollback — which is why migrations should be additive
wherever possible, and why destructive changes deserve a separate, deliberate
step.

---

## Troubleshooting

**`/api/health` reports `d1: "no tables"`**
Migrations have not run. `bun run db:migrate:local` (or `:remote`).

**`FOREIGN KEY constraint failed` on an import**
A child row is being written before its parent. D1 enforces foreign keys; the
`imports` row must exist before its `import_rows`.

**`SESSION_SECRET is required in production`**
Working as intended. `npx wrangler secret put SESSION_SECRET --env production`.

**Queue messages are not being consumed locally**
`wrangler dev` emulates queues, but delivery takes a few seconds. Watch for
`[queue:signals]` in the log. If Queues are unavailable on your plan entirely,
the inline fallback handles it — look for `queue unavailable, ... inline`.

**`wrangler deploy` rejects the queue config**
The dead-letter queues do not exist. Create `auxilium-imports-dlq` and
`auxilium-signals-dlq`, or remove the `dead_letter_queue` lines from
`wrangler.toml`.

**`Cannot read properties of undefined (reading 'prepare')`**
A binding is missing from the environment block you deployed. Each of
`[env.preview]` and `[env.production]` needs its own complete set — wrangler
does **not** inherit bindings from the top level.

**NRI scores look stale**
Signals are derived data, recomputed on write and cached in KV for 15 minutes.
Force a rebuild from the command center's "Rescore everyone", or:

```bash
curl -s -X POST localhost:8787/api/nri/recompute -b /tmp/c.txt -d '{}' \
  -H 'Content-Type: application/json'
```

**Local state is corrupted**
`rm -rf .wrangler/state` and re-migrate. That directory is entirely
regenerable; nothing valuable lives there.

---

## Resource reference

The IDs currently in `wrangler.toml`:

| Resource | Name | ID |
|---|---|---|
| D1 (dev/preview) | `auxilium-db-dev` | `74302f2c-3196-478c-9695-f971cb86b5f1` |
| D1 (production) | `auxilium-db-prod` | `ea56fb83-a754-45a3-b2a9-ae54914e43b3` |
| R2 (dev/preview) | `auxilium-documents-dev` | *bound by name* |
| R2 (production) | `auxilium-documents-prod` | *bound by name* |
| KV `CACHE` (dev) | `AUXILIUM_CACHE_DEV` | `0496371cc04f4a6d88a5a775adc43a4d` |
| KV `CACHE` (prod) | `AUXILIUM_CACHE_PROD` | `97b32f34cc414900b0243b5c4ffd1415` |
| KV `CONFIG` (dev) | `AUXILIUM_CONFIG_DEV` | `428a86cb58f8456aba0eaf01ce7b7605` |
| KV `CONFIG` (prod) | `AUXILIUM_CONFIG_PROD` | `fbccaa55ec0546db851a26822e5cf637` |
| Queue | `auxilium-imports` | *by name — see Queues above* |
| Queue | `auxilium-signals` | *by name — see Queues above* |

These are resource identifiers, not credentials. They are safe in the repo;
secrets are not, and none are.
