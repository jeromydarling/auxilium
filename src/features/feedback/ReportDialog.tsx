import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Lightbulb, Bug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { recentErrors } from '@/app/observability';
import { redactPath } from '@/app/sentry-client';
import { describeAttachments, validateReport, MAX_BODY, type ReportDraft } from '@/lib/feedback/report';

/**
 * The report form itself, in its own module so it can be loaded on demand.
 *
 * Split from the button because this file imports the dialog primitive, and a
 * static import from the app shell put that primitive in the eager shared
 * chunk — which every member opening a bill and every stranger filling in an
 * application then downloads, for a control only staff can see. Measured: the
 * shared chunk went from 98.7KB to 115KB gzipped. Same argument as the audience
 * split itself, one level down.
 */
export default function ReportDialog({ onClose }: { onClose: () => void }) {

  const toast = useToast();
  const { pathname } = useLocation();
  const [kind, setKind] = useState<'bug' | 'idea'>('bug');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  /**
   * Captured when the panel opens, not when it is sent.
   *
   * Two reasons, and the second is the one that bites: the errors are what was
   * on screen at the moment somebody decided to report, and typing a paragraph
   * takes long enough that a background refetch can push them out of a
   * twenty-entry buffer. Reading them at submit time would attach an empty
   * list to precisely the reports that matter.
   */
  const draft = useMemo<ReportDraft>(() => {
    const errors = recentErrors();
    return {
      kind,
      body,
      // Redacted here rather than on the server, so a member id never leaves
      // the browser at all.
      route: redactPath(pathname),
      requestId: [...errors].reverse().find((e) => e.requestId)?.requestId ?? null,
      recentErrors: errors.map((e) => ({
        at: e.at,
        message: e.message,
        route: redactPath(e.route.split('?')[0]),
        status: e.status,
        requestId: e.requestId,
        area: e.area,
      })),
    };
    // `body` is deliberately excluded: it changes on every keystroke, and
    // rebuilding the error snapshot as somebody types is the bug described
    // above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, pathname]);

  const attachments = useMemo(() => describeAttachments({ ...draft, body }), [draft, body]);
  const issues = validateReport({ ...draft, body });
  const remaining = MAX_BODY - body.trim().length;

  async function send() {
    setBusy(true);
    try {
      await api.feedback.create({ ...draft, body });
      // Confirmed on the row being written, not on the email going. Whether our
      // mail is configured is not the reporter's problem, and telling them it
      // half-worked would be both alarming and useless.
      //
      // The second line is conditional because it was not, and said "the errors
      // that came with it" on reports where there were none. A confirmation
      // that overstates what it captured is a small lie that costs trust in
      // exactly the feature that depends on it — somebody who later learns we
      // had nothing stops believing the rest of the panel too.
      toast.success(
        'Thank you — that is with us.',
        draft.recentErrors && draft.recentErrors.length > 0
          ? 'We have the page you were on and the errors that came with it.'
          : 'We have the page you were on and which version you are running.',
      );
      onClose();
    } catch (error) {
      // Stays open. Closing the panel on a failed send would discard what they
      // typed, which for a bug report about a broken product is the cruellest
      // possible outcome.
      toast.error(error, { onRetry: send });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Tell us what happened</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2">
          {([
            { value: 'bug', label: 'Something is broken', icon: Bug },
            { value: 'idea', label: 'I have an idea', icon: Lightbulb },
          ] as const).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setKind(option.value)}
              className={cn(
                'flex flex-1 items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors',
                kind === option.value
                  ? 'border-primary bg-primary/10 font-medium text-primary'
                  : 'text-muted-foreground hover:bg-accent',
              )}
              aria-pressed={kind === option.value}
            >
              <option.icon className="h-4 w-4" />
              {option.label}
            </button>
          ))}
        </div>

        <div>
          <Textarea
            autoFocus
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={
              kind === 'bug'
                ? 'What were you doing, and what happened instead? Even one line helps.'
                : 'What would make this easier?'
            }
          />
          {/* Only once it is close. A counter that is always on screen reads as
              a limit somebody is expected to stay under, and this one is far
              above any real report. */}
          {remaining < 400 && (
            <p className={cn('mt-1 text-xs', remaining < 0 ? 'text-destructive' : 'text-muted-foreground')}>
              {remaining < 0
                ? `${(-remaining).toLocaleString()} characters over`
                : `${remaining.toLocaleString()} characters left`}
            </p>
          )}
        </div>

        <div className="rounded-md border bg-muted/40 p-3">
          <p className="text-xs font-medium">Sent with your message</p>
          <ul className="mt-1.5 space-y-0.5">
            {attachments.map((line, i) => (
              <li
                key={line}
                className={cn(
                  'text-xs text-muted-foreground',
                  // The last line is the one saying what is *not* sent. It is
                  // the thing somebody is actually wondering about, so it does
                  // not get to look like the rest of the list.
                  i === attachments.length - 1 && 'mt-1.5 font-medium text-foreground',
                )}
              >
                {line}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={send} disabled={busy || issues.length > 0}>
            {busy ? 'Sending…' : 'Send'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
