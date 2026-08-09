import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every capability the API offers is reachable from the interface.
 *
 * This exists because a features-page audit found fifteen entries marked
 * `shipped` that a ministry could not get to. None of them were broken: the
 * endpoints worked, the pure logic was tested, and the marketing page described
 * them accurately as things Auxilium does. There was simply no screen. An
 * entire category — moving a ministry off its payment processor, which the
 * comparison page leads with as our advantage over legacy platforms — had no
 * route, no navigation entry, and no method in the API client at all.
 *
 * The failure mode is specific and quiet: nothing errors, no test goes red, and
 * the gap is invisible from either end. Reading the API you see a complete
 * product; reading the UI you see a complete product; only crossing the two
 * shows the hole. So the crossing is what gets asserted.
 *
 * **The rule:** if `src/lib/api.ts` exposes a method, some component must call
 * it — or it must be listed below with a reason. The allowlist is the
 * interesting part, exactly as it is in the tenancy guard: each entry is an
 * argument somebody had to write down and defend, rather than a silence.
 */

const UI_DIRS = ['src/routes', 'src/features', 'src/hooks', 'src/app', 'src/components'];

/**
 * Methods that legitimately have no caller in the interface, and why.
 *
 * Two kinds only. Anything else is a capability nobody can reach.
 */
const JUSTIFIED: Record<string, string> = {
  // Called by the first-run bootstrap flow, which is deliberately not a screen:
  // POST /auth/bootstrap creates the first ministry and then refuses forever,
  // so there is no page to put it on.
  'auth.bootstrap': 'One-time platform bootstrap; deliberately has no UI.',

  // Read by the member portal through its own member.* endpoints. The staff
  // equivalents exist for parity and are exercised by the portal instead.
  'member.changePassword': 'Portal surface; the staff app never changes a member password.',

  // Superseded surfaces kept for API consumers. `claims.validate` is folded
  // into `claims.submit`, which reports the same issues on the way in.
  'claims.validate': 'Folded into submit, which returns the same intake issues.',

  // Listed for completeness in the client; the escalation board and the claim
  // page both read the richer `claims.escalations` instead.
  'claims.repricingSummary': 'Aggregate for reporting; the per-claim view is what staff use.',

  // Reached through the site builder, which loads whole-site state rather than
  // one page at a time.
  'cms.page': 'The builder loads the whole site; a single page fetch is unused.',

  // The migration reconcile and schedule endpoints are driven by the dual-run
  // board's status call, which returns the derived view of both.
  'migration.reconcile': 'Driven server-side; status returns the derived result.',
  'migration.schedule': 'Folded into the dual-run board via status.',

  // Written by the report panel; the ministry-facing list of its own past
  // reports is deliberately not shown — see the note in workers/api/feedback.ts
  // about not implying a response-time promise nobody has made.
  'feedback.mine': 'Deliberately not surfaced; showing status would imply an SLA we have not promised.',

  // Create/edit forms for these are the one genuinely outstanding gap, and the
  // features page says so as `planned`. Listed individually rather than by
  // prefix so that finishing one removes a line here.
  'members.create': 'Full create/edit forms are marked planned on the features page.',
  'members.update': 'Full create/edit forms are marked planned on the features page.',
  'members.suspendPortal': 'Portal suspension has no screen yet; marked planned.',
  'households.create': 'Full create/edit forms are marked planned on the features page.',
  'households.addMember': 'Full create/edit forms are marked planned on the features page.',
  'needs.create': 'Full create/edit forms are marked planned on the features page.',
  'needs.update': 'Full create/edit forms are marked planned on the features page.',
  'needs.get': 'Full create/edit forms are marked planned on the features page.',
  'needs.addUpdate': 'Full create/edit forms are marked planned on the features page.',
  'prayer.create': 'Full create/edit forms are marked planned on the features page.',
  'prayer.update': 'Full create/edit forms are marked planned on the features page.',
  'claims.submit': 'Staff claim intake form is part of the planned create/edit work.',
  'claims.eligibility': 'Pre-submission check belongs with the planned intake form.',
  'knowledge.search': 'The ask panel uses `ask`; a standalone search box is not built.',
  'knowledge.gaps': 'Operator-facing report; no ministry screen by design.',
  'integrity.history': 'Trend over time is marked planned on the features page.',
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(path) && !path.includes('.test.') ? [path] : [];
  });
}

/** `api.<group>.<method>` definitions, read out of the client itself. */
function declaredMethods(): string[] {
  const src = readFileSync('src/lib/api.ts', 'utf8');
  const body = src.slice(src.indexOf('export const api = {'));
  const groups = [...body.matchAll(/\n {2}(\w+): \{([\s\S]*?)\n {2}\},\n/g)];
  return groups.flatMap(([, group, inner]) =>
    [...inner.matchAll(/\n {4}(\w+):/g)].map((m) => `${group}.${m[1]}`),
  );
}

describe('every API capability is reachable from the interface', () => {
  const methods = declaredMethods();
  const called = new Set(
    UI_DIRS.flatMap(sourceFiles).flatMap((f) =>
      [...readFileSync(f, 'utf8').matchAll(/api\.(\w+)\.(\w+)/g)].map((m) => `${m[1]}.${m[2]}`),
    ),
  );

  it('finds the client, so a refactor cannot silently empty this test', () => {
    expect(methods.length).toBeGreaterThan(80);
  });

  it('has a caller, or a written reason, for every method', () => {
    const orphans = methods.filter((m) => !called.has(m) && !(m in JUSTIFIED));
    expect(
      orphans,
      `These endpoints exist and no screen calls them, so no ministry can reach them:\n` +
        orphans.map((o) => `  - ${o}`).join('\n') +
        `\n\nEither wire them up, or add them to JUSTIFIED with the reason.`,
    ).toEqual([]);
  });

  it('keeps the allowlist honest', () => {
    // An entry that has since been wired is an entry that should go, otherwise
    // the list slowly becomes a place where real gaps can hide.
    const stale = Object.keys(JUSTIFIED).filter((m) => called.has(m));
    expect(
      stale,
      `These are now called from the UI and no longer need justifying:\n${stale.join('\n')}`,
    ).toEqual([]);

    // And an entry for a method that no longer exists is a stale argument.
    const phantom = Object.keys(JUSTIFIED).filter((m) => !methods.includes(m));
    expect(phantom, `JUSTIFIED names methods that no longer exist:\n${phantom.join('\n')}`).toEqual([]);
  });
});
