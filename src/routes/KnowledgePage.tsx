import { Link } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useNriKnowledgeIndex } from '@/hooks/nri/useNriAsk';
import { AskPanel } from '@/features/nri/AskPanel';

/**
 * The knowledge base, browsable.
 *
 * Search answers the question you know how to ask. This page is for the other
 * case — you know something exists and cannot name it, or you are new and do
 * not yet know what there is to know. Both need to be possible, so both are.
 *
 * What is listed here comes from the server, which decides the audience from
 * the session. A member is never shown staff operations material; that is
 * enforced on the `audience` field rather than by which page you happen to
 * land on, so there is no URL that leaks it.
 */
export function KnowledgePage() {
  const { categories, isLoading, audience } = useNriKnowledgeIndex();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <BookOpen className="h-6 w-6" /> Knowledge
        </h1>
        <p className="mt-1 text-muted-foreground">
          {audience === 'member'
            ? 'How sharing works, what happens to your bills, and what you can do when the answer is no.'
            : 'How to run every part of this software, and how to make a decision that holds up afterwards.'}
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <AskPanel />
        </CardContent>
      </Card>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading the library…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {categories.map((group) => (
            <Card key={group.category}>
              <CardHeader>
                <CardTitle className="text-base">{group.category}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {group.articles.map((a) => (
                    <li key={a.slug}>
                      <Link
                        to={`/knowledge/${a.slug}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {a.title}
                      </Link>
                      <p className="mt-0.5 text-sm text-muted-foreground">{a.summary}</p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
