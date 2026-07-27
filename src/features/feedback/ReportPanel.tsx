import { lazy, Suspense, useState } from 'react';
import { MessageSquareWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Reporting a problem, from wherever you hit it.
 *
 * The design question here is not what the form looks like — it is why anybody
 * would bother. A ministry staff member who hits a bug has a member waiting and
 * a workaround available, and every step between noticing and reporting is a
 * step at which they reasonably stop. So:
 *
 * **It is one control, on every page.** Not a support address on a marketing
 * site, not a page under Settings. The moment somebody is willing to report
 * something is the moment it happened, and by the time they have navigated
 * somewhere to do it they have talked themselves out of it and lost the detail.
 *
 * **It fills in the diagnostics itself.** Nobody knows their app version and
 * nobody should have to reproduce a bug to describe it. The page, the build,
 * the browser, and the last few errors are attached automatically, so the
 * reporter's whole job is one sentence about what they were doing — which is
 * the only part they can supply and we cannot.
 *
 * **It shows exactly what is being sent.** A panel that silently attaches
 * diagnostics is one somebody would be right to hesitate over, in a product
 * that spends the rest of its time arguing for care with other people's
 * records. The list is on screen before the button, and it ends by saying what
 * is *not* going.
 *
 * The form lives in a separate, lazily loaded module. It pulls in the dialog
 * primitive, and this file is imported by the app shell — so a static import
 * would put that primitive in the eager chunk every audience downloads.
 */
const ReportDialog = lazy(() => import('./ReportDialog'));

export function ReportButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <MessageSquareWarning /> Report a problem
      </Button>
      {/* Mounted only while open, so a page that never reports never pays for
          the panel — and so each report starts from an empty form rather than
          the last one's text. No fallback: the chunk is a few kilobytes and
          arrives faster than the dialog animation, so a spinner would flash. */}
      {open && (
        <Suspense fallback={null}>
          <ReportDialog onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
