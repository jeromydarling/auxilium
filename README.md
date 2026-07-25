# Auxilium

A Health Sharing Ministry OS. Its job is to make sure nobody gets missed.

Health sharing ministries are communities where households share one another's
medical costs directly. They run on relationships and spreadsheets, and they
fail in a specific way: a family in crisis goes quiet, a case stalls in someone's
inbox, a promised follow-up never happens, and nobody notices until the member
leaves.

**NRI — Need Response Intelligence — exists to notice.** It scores every member
on four directions, and it can always say exactly why.

| | |
|---|---|
| **Cura** | Care and pastoral attention. Someone is hurting. |
| **Onus** | Case weight — money, urgency, processing that stalled. |
| **Familia** | Household complexity — dependents, caregiving, transition. |
| **Fides** | Trust and communication. Are we still in touch? |

A score is the sum of the weights of every rule that matched — nothing more.
No model, no training data, no learned coefficients. The reasons are shown
alongside the number with their exact weights, and the full rule set is
published to administrators in the app. A system that cannot be argued with
does not get trusted with pastoral care.

## Run it

```bash
bun install
cp .dev.vars.example .dev.vars
bun run db:migrate:local
bun run db:seed:local
bun run build
bun run dev                    # http://localhost:8787
```

Click **Explore the demo ministry** — five personas, one per thing NRI is
supposed to catch.

## What's here

- **Member and household management** — households are the sharing unit
- **Import engine** — messy CSV rosters, with column inference, validation,
  three-path deduplication, and a preview that writes nothing until approved
- **Sharing needs** — case management with stall detection
- **Prayer board** — care requests ordered by urgency and overdue follow-up,
  never by date alone
- **NRI command center** — a worklist, most pressing first, every row
  expandable into the reasons behind its score
- **White-label CMS shell** — ministry-branded member portals

React + TypeScript + Vite on Cloudflare Workers, with D1, R2, KV, and Queues.

## Documentation

- [`CLAUDE.md`](CLAUDE.md) — architecture, domain model, the NRI model, and
  what to build next
- [`docs/cloudflare-setup.md`](docs/cloudflare-setup.md) — resources, secrets,
  migrations, deployment, troubleshooting
