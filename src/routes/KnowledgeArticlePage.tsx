import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, ExternalLink } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

/**
 * One article.
 *
 * Sources render as real links with their authority visible, because the whole
 * discipline of this library is that a claim about what the law requires can be
 * checked by the person relying on it. A citation nobody can follow is
 * decoration.
 */
export function KnowledgeArticlePage() {
  const params = useParams();
  // Slugs contain a slash — "member/your-rights" — so the route captures the
  // rest of the path rather than a single segment.
  const slug = params['*'] ?? '';

  const { data, isLoading, isError } = useQuery({
    queryKey: ['knowledge', 'article', slug],
    queryFn: () => api.knowledge.article(slug),
    enabled: slug.length > 0,
    retry: false,
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  if (isError || !data) {
    return (
      <div className="space-y-4">
        <p className="text-sm">That article does not exist, or is not one you can see.</p>
        <Link to="/knowledge" className="text-sm text-primary hover:underline">
          Back to the knowledge base
        </Link>
      </div>
    );
  }

  const a = data.article;

  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <Link
        to="/knowledge"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Knowledge
      </Link>

      <header>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {a.category}
        </p>
        <h1 className="mt-1 text-2xl font-semibold">{a.title}</h1>
        <p className="mt-2 text-muted-foreground">{a.summary}</p>
      </header>

      {a.body.map((section, i) => (
        <section key={section.heading ?? i} className="space-y-3">
          {section.heading && <h2 className="text-lg font-semibold">{section.heading}</h2>}
          {section.paragraphs.map((p) => (
            <p key={p} className="leading-relaxed">
              {p}
            </p>
          ))}
        </section>
      ))}

      {a.steps && a.steps.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <ol className="space-y-4">
              {a.steps.map((step, i) => (
                <li key={step.title}>
                  <p className="font-medium">
                    {i + 1}. {step.title}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
                  {step.because && (
                    <p className="mt-1 text-sm italic text-muted-foreground">{step.because}</p>
                  )}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {a.appPath && (
        <Link
          to={a.appPath.replace(/^\/app/, '')}
          className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
        >
          Open this in the app <ArrowRight className="h-4 w-4" />
        </Link>
      )}

      {a.sources && a.sources.length > 0 && (
        <>
          <Separator />
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Sources
            </h2>
            <ul className="mt-2 space-y-1.5">
              {a.sources.map((s) => (
                <li key={s.url}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-start gap-1 text-sm text-primary hover:underline"
                  >
                    {s.label} <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  </a>
                  {s.authority && (
                    <span className="ml-2 text-xs text-muted-foreground">({s.authority})</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {a.related && a.related.length > 0 && (
        <>
          <Separator />
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Related
            </h2>
            <ul className="mt-2 space-y-1">
              {a.related.map((slugRef) => (
                <li key={slugRef}>
                  <Link to={`/knowledge/${slugRef}`} className="text-sm text-primary hover:underline">
                    {slugRef.split('/').slice(1).join('/').replace(/-/g, ' ')}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <p className="text-xs text-muted-foreground">Last reviewed {a.updated}.</p>
    </article>
  );
}
