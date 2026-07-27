# Recovery

What to do when data is wrong or gone, and how to know the answer works before
you need it.

This document exists because "D1 has Time Travel, so we're covered" is a
sentence, not a capability. The platform keeps 30 days of history; whether *this
ministry's* data can actually be brought back, by somebody who is not the person
who wrote the schema, at 2am, is a different question. Nobody had answered it.

---

## What is actually at risk

Ranked by how badly it goes and how likely it is.

| | Recovery |
|---|---|
| **A seed re-run against the wrong database.** The one destructive operation in the repo. `schema/seed-reset.sql` deletes by two hard-coded demo org ids, so a real ministry is untouched even if it is run in production — but a typo in those ids would not be. | Time Travel to the minute before. |
| **A soft delete somebody meant, and then didn't.** `deleted_at` rather than `DELETE`, everywhere. | `UPDATE … SET deleted_at = NULL`. No restore needed. |
| **A migration that drops or rebuilds a table.** SQLite cannot alter a CHECK constraint or drop a foreign key in place, so several migrations rebuild tables. A rebuild with a wrong column list loses a column's contents silently. | Time Travel, and read the note below about migrations. |
| **A ministry deleting its own guidelines or pages.** Ordinary product behaviour, not a failure. | Both soft-deleted. A guideline withdrawal is refused outright once anything cites it, and a correction archives the previous text to `guideline_revisions`. |
| **The whole database.** Cloudflare would have to lose it. | Time Travel, then the export below. |

---

## Time Travel

D1 keeps 30 days of write-ahead history. You can restore in place or read a
point in time without restoring.

```bash
# What restore points exist, and the current bookmark.
npx wrangler d1 time-travel info auxilium-db-prod --env production

# Look at a moment without changing anything. Do this first, always.
npx wrangler d1 time-travel restore auxilium-db-prod \
  --timestamp 2026-07-26T05:00:00Z --dry-run
```

**Restoring is destructive in the other direction.** It rolls the database
*back*, so every write after the timestamp is gone — including the writes of
whoever else was working while you were deciding. Before restoring in anger:

1. Export the current state (below). It is the only copy of the interval you are
   about to discard.
2. Work out the timestamp from `audit_log`, not from memory. Almost every
   mutation in Auxilium writes an audit row, and `created_at` on the row *before*
   the bad one is the timestamp you want.
3. Say in `#ops` that you are doing it, because other people's work is in scope.

---

## Export

Read-only, safe to run against production at any time, and the thing to do
*before* a restore rather than after.

```bash
npx wrangler d1 export auxilium-db-prod --env production --output ./backup.sql
```

`bun run db:backup:prod` does the same with a dated filename.

**An export is not a backup until it has been imported somewhere.** A file that
has never been read back is a file you are guessing about. To check one:

```bash
bun run db:verify-backup ./backup-2026-07-26.sql
```

That creates a scratch D1 database, imports the file, counts the rows in the
tables that matter, prints them next to the source counts, and deletes the
scratch database. It touches nothing in production — the export is a read and
the import is into a database created for the purpose.

---

## Recovering one ministry

Time Travel is all-or-nothing across the database, which is the wrong tool when
one ministry's rows are wrong and forty others are fine. Rolling back all of them
to fix one is a much larger outage than the one you started with.

Instead: export, import into a scratch database, and copy the rows out.

```bash
npx wrangler d1 export auxilium-db-prod --env production --output ./before.sql
npx wrangler d1 create auxilium-recovery
npx wrangler d1 execute auxilium-recovery --file ./before.sql

# Read what the ministry's rows looked like, then write them back by hand.
npx wrangler d1 execute auxilium-recovery \
  --command "SELECT * FROM members WHERE org_id = 'org_…' AND deleted_at IS NULL"
```

Tedious on purpose. There is no scripted per-tenant restore and there should not
be one until somebody has needed it twice — a tool that rewrites one ministry's
records is exactly the tool you do not want available on a bad afternoon.

---

## Migrations

`wrangler d1 migrations apply` runs before the deploy in CI, and a migration that
loses data will have committed before any test sees the result.

Two rules, both learned from the table rebuilds in `0007`:

- **A rebuild copies columns by name, explicitly.** `INSERT INTO new SELECT *
  FROM old` silently reorders when the column lists differ, which puts the right
  data in the wrong columns — worse than losing it, because it looks fine.
- **Take an export first when a migration drops or rebuilds anything.** Time
  Travel covers it, but a rebuild is precisely the case where you want the old
  shape readable side by side rather than a rollback.

---

## Known gaps

Written down rather than fixed, so the next person is not surprised by them.

- ~~`sharing_guidelines` has no `deleted_at`.~~ Fixed. Withdrawal is a soft
  delete and is refused the moment anything cites the version; corrections
  archive the previous text to `guideline_revisions` rather than overwriting it.
- **No automated backup schedule.** Time Travel is the backup. There is no
  nightly export to R2, so recovery beyond 30 days is not possible at all.
- **Restore has been rehearsed against a scratch database, never against
  production.** Deliberate — a production restore drill destroys real writes —
  but it means the timings here are unmeasured.
