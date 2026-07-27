/**
 * What makes a bug report worth sending.
 *
 * Pure, so the same rules run in the browser before somebody presses the button
 * and on the server before anything is written — one definition rather than two
 * that drift, which is the same argument that keeps the application form's
 * validation in `src/lib/applications/validate.ts`.
 *
 * The governing principle is that **almost nothing is rejected**. The failure
 * mode of a reporting channel is not bad reports; it is silence. A ministry
 * that gets told their description is too short does not write a longer one,
 * they close the panel and go back to working around the bug, and we never find
 * out. So the only hard rule is that there has to be *something* to read.
 */

export interface RecordedErrorSummary {
  at: string;
  message: string;
  route: string;
  status?: number;
  requestId?: string | null;
  area?: string;
}

export interface ReportDraft {
  kind: 'bug' | 'idea';
  body: string;
  /** Ids already stripped by the caller: '/app/members/:id'. */
  route?: string;
  requestId?: string | null;
  recentErrors?: RecordedErrorSummary[];
}

export interface ReportIssue {
  path: string;
  message: string;
}

/**
 * The ceiling exists to stop somebody pasting a database into a D1 column, not
 * to ration what they are allowed to say. It is far above any real report, and
 * the form counts down only once it is close.
 */
export const MAX_BODY = 4000;

export function validateReport(draft: ReportDraft | null | undefined): ReportIssue[] {
  if (!draft) return [{ path: 'body', message: 'Tell us what happened and we will look at it.' }];

  const issues: ReportIssue[] = [];

  if (draft.kind !== 'bug' && draft.kind !== 'idea') {
    issues.push({ path: 'kind', message: 'Choose whether this is a problem or an idea.' });
  }

  const body = (draft.body ?? '').trim();
  if (body.length === 0) {
    // The only genuine rejection. Note what it does *not* say: nothing about a
    // minimum length, because "please write at least 20 characters" is how you
    // teach somebody that reporting things here is a chore.
    issues.push({ path: 'body', message: 'Tell us what happened and we will look at it.' });
  } else if (body.length > MAX_BODY) {
    issues.push({
      path: 'body',
      message: `That is longer than we can store. Trim it to about ${MAX_BODY.toLocaleString()} characters — the detail that matters most is what you were doing when it went wrong.`,
    });
  }

  return issues;
}

/**
 * A subject line.
 *
 * The first sentence, capped. Not the first N characters: cutting mid-word
 * produces "Members page will not lo" in an inbox, which reads as a broken
 * system rather than a report about one.
 */
export function summariseReport(body: string, limit = 72): string {
  const text = body.trim().replace(/\s+/g, ' ');
  if (!text) return 'No description';

  const sentence = /^(.+?[.!?])(?:\s|$)/.exec(text)?.[1] ?? text;
  if (sentence.length <= limit) return sentence;

  const clipped = sentence.slice(0, limit);
  const lastSpace = clipped.lastIndexOf(' ');
  return `${(lastSpace > limit * 0.6 ? clipped.slice(0, lastSpace) : clipped).trimEnd()}…`;
}

/**
 * What the form shows somebody before they send.
 *
 * Shown rather than described, and this is the whole reason the panel is worth
 * building rather than an email address on a page. A report that silently
 * attaches diagnostics is a report somebody would be right to be uneasy about;
 * one that lists exactly what is going with it — the page, the build, the last
 * few errors, and nothing else — is one they can send without wondering.
 *
 * It is also the honest answer to "does this include our member data": no, and
 * here is the list.
 */
export function describeAttachments(draft: ReportDraft): string[] {
  const lines: string[] = [];

  if (draft.route) lines.push(`The page you are on (${draft.route})`);
  lines.push('Which version of Auxilium you are running, and your browser');

  const errors = draft.recentErrors ?? [];
  if (errors.length > 0) {
    lines.push(
      errors.length === 1
        ? 'The error that just happened'
        : `The last ${errors.length} errors on this device`,
    );
  }
  if (draft.requestId) lines.push(`A reference for the failed request (${draft.requestId})`);

  // Stated positively and last, because it is the thing somebody is actually
  // wondering about and a reassurance buried in a paragraph does not land.
  lines.push('No member names, records, or anything you have typed into a form');

  return lines;
}
