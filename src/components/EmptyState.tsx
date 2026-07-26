import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * What a page says when it has nothing to show.
 *
 * An empty table is the single most common way a new ministry concludes the
 * product is broken. There is no way to tell, from a blank screen, whether
 * nothing has happened yet, nothing was imported, or something failed — and the
 * default assumption is the last one.
 *
 * So every empty state here answers three questions in order: what goes here,
 * why it is worth having, and the one thing to do next. Three rather than one,
 * because "No members yet" alone is barely better than blank.
 *
 * Deliberately not an illustration. Someone looking at this is trying to work
 * out whether their evening is about to be wasted; a friendly graphic is not
 * what they need from the screen.
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  /** Why this matters — skipped when the answer is genuinely just "nothing yet". */
  because,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  body: string;
  because?: string;
  action?: { label: string; to: string };
}) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center">
      {Icon && <Icon className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />}
      <p className="font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{body}</p>
      {because && (
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{because}</p>
      )}
      {action && (
        <Button asChild size="sm" variant="outline" className="mt-4">
          <Link to={action.to}>
            {action.label} <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Link>
        </Button>
      )}
    </div>
  );
}
