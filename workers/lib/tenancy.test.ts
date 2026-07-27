import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Tenant isolation, enforced rather than remembered.
 *
 * "Every tenant-scoped query carries `org_id`. There is no exception." holds
 * today because every author remembered. That is a social contract, not a
 * mechanism — and the failure it prevents is the worst one available here: one
 * ministry reading another's members, which looks completely normal in review
 * and produces no error.
 *
 * So this test reads the source. It is crude on purpose: a query builder that
 * required a tenant argument would be better, but retrofitting it across two
 * hundred call sites is a change big enough that it would not get done, and a
 * test that runs on every commit beats a refactor that never lands.
 *
 * **The allowlist is the interesting part.** Every entry is a query that
 * genuinely has no tenant, and each one has to be justified in a comment. A new
 * unexplained entry is the thing to argue about in review; a new query that is
 * simply missing `org_id` fails without discussion.
 */

/** Files whose queries are legitimately global, with the reason. */
const GLOBAL_BY_DESIGN = new Set([
  // Keyed by Stripe's own globally-unique ids. An org_id predicate would be
  // meaningless — and would break the exactly-once claim, whose whole point is
  // that the event id alone identifies the event.
  'workers/api/stripe-webhook.ts',
  // DNS verification and host → ministry resolution. The hostname *is* the
  // lookup key; that is the feature.
  'workers/lib/domain-service.ts',
]);

/**
 * Substrings that make a query legitimately tenant-free.
 *
 * `organizations` is the tenant table itself. The `?1`-style predicates are how
 * the multi-subquery counts are written. `conditions`/`clauses` are the dynamic
 * builders, every one of which seeds its array with `org_id = ?` — asserted
 * separately below, because that is the part a refactor could break.
 */
const EXEMPT = [
  'org_id', 'orgId', 'member_id', 'account_id', 'user_id',
  'FROM organizations', 'UPDATE organizations', 'INTO organizations',
  'sqlite_master',
  'conditions.join', 'clauses.join', 'sets.join',
];

/**
 * Files with no SQL in them at all, excluded so a stylesheet or an HTML template
 * cannot be reported as a database query.
 */
const NOT_DATA_ACCESS = ['workers/marketing/styles.ts', 'workers/marketing/render.ts'];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') && !path.endsWith('.test.ts') ? [path] : [];
  });
}

/**
 * Every backtick template in a file that is actually SQL.
 *
 * Shape-matched rather than keyword-matched. A bare case-insensitive search for
 * "select" also matches the CSS that styles a `<select>` element, and a test
 * that reports the marketing stylesheet as an unscoped database query is a test
 * people learn to skim.
 */
function queriesIn(src: string): string[] {
  // All three quote styles, not just backticks.
  //
  // This matched only backtick templates until a single-quoted
  // `UPDATE feedback SET emailed_at = ? WHERE id = ?` walked straight past it.
  // Short statements in this codebase are written in single quotes precisely
  // because they fit on one line, so the queries the guard could not see were
  // disproportionately the simple ones — and a simple `UPDATE ... WHERE id = ?`
  // with no tenant predicate is exactly the shape this exists to catch.
  //
  // A guard with a blind spot is worse than no guard, because the passing run
  // is read as proof.
  return [
    ...src.matchAll(/`([^`]*)`/g),
    ...src.matchAll(/'([^'\\\n]*)'/g),
    ...src.matchAll(/"([^"\\\n]*)"/g),
  ]
    // Normalized, because these statements are wrapped for readability and a
    // fragment match against raw source would depend on where the newlines fell.
    .map((m) => m[1].replace(/\s+/g, ' ').trim())
    .filter(
      (q) =>
        /\bSELECT\b[\s\S]*\bFROM\b/i.test(q) ||
        /\bUPDATE\b[\s\S]*\bSET\b/i.test(q) ||
        /\bDELETE\s+FROM\b/i.test(q) ||
        /\bINSERT\s+INTO\b/i.test(q),
    );
}

/**
 * Individual queries that are safe without a tenant predicate, and why.
 *
 * Each one is keyed by a distinctive fragment. They fall into two kinds:
 *
 * **Writes by a primary key that was just read under a tenant scope.** The row
 * was located by `member_id` or `org_id` a few lines above; re-stating the
 * predicate on the write would be belt-and-braces, not a fix, because a wrong id
 * here could only come from a wrong read. Kept in this list rather than made
 * exempt by pattern, because "id came from a scoped read" is an argument about
 * the surrounding code that no regex can check — so it gets a human's name on it
 * in review instead.
 *
 * **Rows keyed by an external system's globally unique id.** Stripe's event and
 * payment-intent ids. Adding `org_id` would not make these safer and would break
 * the exactly-once claim, whose entire premise is that the event id alone is
 * enough to identify the event.
 */
const JUSTIFIED = [
  // Stripe refunds: located by the payment intent Stripe itself issued, and the
  // org is derived *from* that row rather than known before it.
  'FROM contributions WHERE stripe_payment_intent_id',
  'UPDATE contributions SET refunded_cents',
  // The exactly-once claim table. Keyed by Stripe's event id by design — an
  // org_id predicate here would break the premise that the event id alone
  // identifies the event.
  'INSERT INTO billing_events',
  'UPDATE billing_events SET processed_at',
  // Session and invite rows, keyed by a secret only the holder has.
  'UPDATE member_accounts SET last_seen_at',
  'UPDATE member_invites SET used_at',
  // Alerts are keyed by dedupe_key, which embeds the organization and is
  // globally unique by construction. It has to work that way: a platform-level
  // alert — the reconciler cannot reach Stripe at all — has no organization,
  // so an org_id predicate would be wrong rather than merely redundant.
  'FROM alerts WHERE dedupe_key',
  'UPDATE alerts SET last_seen_at',
  'UPDATE alerts SET resolved_at',

  // ── Surfaced when this guard was widened past backtick templates ──────────
  //
  // Every one below was audited by hand at that point, and each is the first
  // kind above: the row was located by a query carrying `org_id` or
  // `member_id` a few lines earlier, and the id being written is that read's
  // own result. A wrong id here could only come from a wrong read.
  //
  // They are listed individually rather than pattern-exempted so that adding a
  // nineteenth is a line somebody has to write and defend in review.

  // The signed-in account acting on itself. `id` is the session's own user,
  // never a value from the request.
  'UPDATE users SET last_seen_at',
  'SELECT password_hash, password_salt FROM users WHERE id = ?',
  'UPDATE users SET password_hash',
  'SELECT password_hash, password_salt FROM member_accounts WHERE id = ?',
  'UPDATE member_accounts SET password_hash',

  // Portal account writes, after `SELECT ... JOIN members ... WHERE m.org_id = ?`
  // established that the account belongs to this ministry.
  'UPDATE member_accounts SET email',
  "UPDATE member_accounts SET status = 'suspended'",

  // Read against a claim already fetched WHERE id = ? AND org_id = ? (staff) or
  // scoped to the member's own claims (portal). The need id is that row's.
  'SELECT joined_at FROM members WHERE id = ?',
  "SELECT paid_at FROM disbursements WHERE need_id = ?",

  // Marking our own just-inserted row as emailed. The id was generated in the
  // same handler and has not been anywhere.
  'UPDATE alerts SET emailed_at',
  'UPDATE feedback SET emailed_at',

  // Import rows, marked committed inside the batch that writes their member.
  // Located by a read scoped to the import, which is scoped to the org.
  'UPDATE import_rows SET committed',

  // Sessions, keyed by a hash of a secret only the holder has — the same
  // argument as the member invite rows above. An org predicate would add
  // nothing: possession of the token *is* the authorization, and sign-out must
  // work before any org is known.
  'DELETE FROM sessions WHERE token_hash',
  'DELETE FROM member_sessions WHERE token_hash',

  // Deliberately cross-tenant. This counts recent applications from one source
  // address to rate-limit the public form, and an address is not a tenant —
  // scoping it per org would let the same sender hit every ministry in turn,
  // which is the abuse it exists to slow.
  'FROM member_applications WHERE source_ip_hash',
];

describe('tenant isolation', () => {
  const files = sourceFiles('workers')
    .filter((f) => !GLOBAL_BY_DESIGN.has(f))
    .filter((f) => !NOT_DATA_ACCESS.includes(f));

  it('finds queries to check, so a refactor cannot silently empty this test', () => {
    // A regex that stops matching would make this suite pass by testing nothing,
    // which is worse than no test at all.
    const total = files.reduce((n, f) => n + queriesIn(readFileSync(f, 'utf8')).length, 0);
    expect(total).toBeGreaterThan(60);
  });

  it('scopes every query by a tenant or a subject', () => {
    const unscoped: string[] = [];

    for (const file of files) {
      for (const query of queriesIn(readFileSync(file, 'utf8'))) {
        if (EXEMPT.some((token) => query.includes(token))) continue;
        if (JUSTIFIED.some((token) => query.includes(token))) continue;
        unscoped.push(`${file}: ${query.replace(/\s+/g, ' ').trim().slice(0, 120)}`);
      }
    }

    expect(unscoped, `unscoped queries:\n${unscoped.join('\n')}`).toEqual([]);
  });

  it('seeds every dynamic condition builder with a tenant predicate', () => {
    // The exemption above lets `${conditions.join(' AND ')}` through. That is
    // only safe while the first element of every such array is the tenant, so
    // that is asserted here rather than assumed.
    const bad: string[] = [];

    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      for (const match of src.matchAll(/const (conditions|clauses)[^=]*=\s*\[([^\]]*)\]/g)) {
        const first = match[2].split(',')[0] ?? '';
        if (!/org_id|member_id/.test(first)) {
          bad.push(`${file}: ${match[1]} starts with ${first.trim() || '(empty)'}`);
        }
      }
    }

    expect(bad, `condition builders without a tenant first:\n${bad.join('\n')}`).toEqual([]);
  });

  it('keeps the member side scoped by member, never by org', () => {
    // Staff scope by org because a staff member may legitimately see anyone in
    // their ministry. A member may see exactly one person's medical
    // circumstances, so an org-scoped read on the member API would hand every
    // member the whole roster — and would look entirely normal in review.
    const src = readFileSync('workers/api/member-auth.ts', 'utf8');

    for (const query of queriesIn(src)) {
      if (!/\bFROM\s+(needs|members|member_health_disclosures|appeals)\b/i.test(query)) continue;
      expect(query, `member-side read not scoped by member_id: ${query.slice(0, 120)}`)
        .toMatch(/member_id/);
    }
  });
});
