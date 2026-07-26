#!/usr/bin/env bash
#
# Prove an export can actually be restored.
#
# An export that has never been imported is a file somebody is guessing about.
# This imports one into a scratch D1 database, compares the row counts against
# the export itself, prints them side by side, and deletes the scratch database.
#
# Touches nothing in production: the only production operation involved is the
# export, which is a read, and it is not performed here.
#
#   ./scripts/verify-backup.sh ./backup-2026-07-26.sql
#
set -euo pipefail

DUMP="${1:-}"
if [[ -z "$DUMP" || ! -f "$DUMP" ]]; then
  echo "usage: $0 <export.sql>" >&2
  exit 64
fi

# Named with the pid so two people can run this at once without colliding, and
# so a crashed run leaves an obviously-disposable artefact rather than something
# that looks like a real database.
SCRATCH="auxilium-restore-check-$$"

cleanup() {
  echo
  echo "→ removing scratch database $SCRATCH"
  npx wrangler d1 delete "$SCRATCH" --skip-confirmation >/dev/null 2>&1 || true
}
# Runs on success, failure, and interrupt. A scratch database left behind is
# billable, confusing, and eventually gets mistaken for something.
trap cleanup EXIT

# Tables where a silent zero is a real failure rather than an empty ministry.
TABLES=(organizations users members households needs contributions disbursements
        sharing_guidelines cms_pages member_accounts)

echo "→ counting rows in the export"
declare -A EXPECTED
for table in "${TABLES[@]}"; do
  # Count INSERT statements for the table in the dump. Crude, and sufficient:
  # wrangler emits one INSERT per row.
  EXPECTED[$table]=$(grep -c "INSERT INTO \"\?${table}\"\? " "$DUMP" || true)
done

echo "→ creating scratch database $SCRATCH"
npx wrangler d1 create "$SCRATCH" >/dev/null

echo "→ importing $DUMP"
npx wrangler d1 execute "$SCRATCH" --remote --file "$DUMP" >/dev/null

echo
printf '%-24s %10s %10s %s\n' TABLE EXPORT RESTORED ''
FAILED=0

for table in "${TABLES[@]}"; do
  actual=$(npx wrangler d1 execute "$SCRATCH" --remote --json \
             --command "SELECT COUNT(*) AS n FROM ${table}" 2>/dev/null \
           | grep -o '"n":[0-9]*' | head -1 | cut -d: -f2 || echo '?')

  if [[ "$actual" == "${EXPECTED[$table]}" ]]; then
    printf '%-24s %10s %10s %s\n' "$table" "${EXPECTED[$table]}" "$actual" "ok"
  else
    printf '%-24s %10s %10s %s\n' "$table" "${EXPECTED[$table]}" "$actual" "MISMATCH"
    FAILED=1
  fi
done

echo
if [[ "$FAILED" -eq 0 ]]; then
  echo "This export restores cleanly."
else
  # Deliberately loud. A backup that half-restores is worse than a missing one,
  # because it will be trusted.
  echo "THIS EXPORT DOES NOT RESTORE CLEANLY. Do not rely on it." >&2
  exit 1
fi
