import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ExternalLink } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';

/**
 * Your rights.
 *
 * A first-class destination rather than a search result, because the two facts
 * on this page are the most valuable things this product can tell a member and
 * they are worthless if you have to know what to type to find them:
 *
 *   • Appealing works about half the time and almost nobody does it.
 *   • The leverage is against the hospital, not the ministry. Sharing cannot be
 *     compelled; a nonprofit hospital's obligations can.
 *
 * The page renders the two rights articles from the knowledge base rather than
 * restating them, so there is exactly one copy of this material and the tested
 * sourcing rule — every legal claim carries a citation — covers what is shown
 * here too. A second hand-written version of these facts would drift, and the
 * drift would be in the direction of confident and wrong.
 */
const RIGHTS_SLUGS = ['member/your-rights', 'member/medical-bill-rights'];

export function PortalRightsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['member', 'rights'],
    queryFn: async () => Promise.all(RIGHTS_SLUGS.map((slug) => api.knowledge.article(slug))),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Your rights</h1>
        <p className="mt-1 text-muted-foreground">
          What you can rely on, what you cannot, and what to do about a bill either way.
        </p>
      </div>

      {/* Both above the fold, before any article. Someone who reads nothing
          else on this page should still leave with these two. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm font-medium">Appeal. Almost nobody does.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              In the one state that requires ministries to report it, there were 13,741 declines,
              111 appeals, and 54 of those approved. About half of appeals succeeded. Under one
              percent of declines were appealed at all.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm font-medium">Your strongest rights are against the hospital.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Sharing is voluntary and cannot be compelled. A nonprofit hospital&rsquo;s obligations
              can be: financial assistance for roughly 240 days from the first bill, a floor before
              collections, and a cap below the list price.
            </p>
          </CardContent>
        </Card>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {data?.map(({ article }) => (
        <Card key={article.slug}>
          <CardContent className="space-y-3 pt-6">
            <h2 className="text-lg font-semibold">{article.title}</h2>
            <p className="text-sm text-muted-foreground">{article.summary}</p>

            {article.steps && article.steps.length > 0 && (
              <ol className="space-y-2">
                {article.steps.slice(0, 4).map((step, i) => (
                  <li key={step.title} className="text-sm">
                    <span className="font-medium">{i + 1}. {step.title}</span>
                    <span className="text-muted-foreground"> &mdash; {step.body}</span>
                  </li>
                ))}
              </ol>
            )}

            <Link
              to={`/portal/knowledge/${article.slug}`}
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Read all of it <ArrowRight className="h-3.5 w-3.5" />
            </Link>

            {/* Sources on the summary card, not only on the full article. A
                member who never clicks through should still be able to check
                any legal claim they just read. */}
            {article.sources && article.sources.length > 0 && (
              <ul className="space-y-1 border-t pt-3">
                {article.sources.slice(0, 4).map((s) => (
                  <li key={s.url}>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-start gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
                    >
                      {s.label} <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ))}

      <p className="text-sm text-muted-foreground">
        This is general information, not legal advice. Rules differ by state, and a lawyer in your
        state can tell you how they apply to you.
      </p>
    </div>
  );
}
