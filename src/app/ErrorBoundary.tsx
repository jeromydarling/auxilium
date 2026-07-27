import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { reportError } from './observability';

/**
 * What the app shows when its own code throws.
 *
 * Without one of these, a render error unmounts the whole React tree and leaves
 * a white page. Not an error page — a *blank* one, with no message, no
 * navigation, and no indication that anything is wrong beyond the absence of
 * everything. Somebody who hits that has no way to tell it apart from the
 * product being gone, and their only remaining move is to close the tab.
 *
 * Three things it must do, in order of how much they matter:
 *
 * **Leave a way out.** The escape routes are the point. "Try again" re-mounts
 * the subtree, which fixes the large class of errors caused by one bad response
 * rather than bad code. "Go to the dashboard" is there because the failing route
 * may be unreachable in a way re-mounting cannot fix, and being stuck on a
 * broken page with no navigation is the corner this exists to keep people out
 * of.
 *
 * **Report itself.** A render crash never reaches the API, so nothing else in
 * the system will ever hear about it. This is the only place that sees it.
 *
 * **Not become the second failure.** Everything here is static markup and one
 * `reportError` inside a try. It deliberately does not use the toast layer, the
 * router, or any query — a fallback that depends on the app it is catching for
 * is a fallback that white-screens on exactly the errors that matter most.
 */

interface Props {
  children: ReactNode;
  /** Names the area, so a report says where rather than only what. */
  area: string;
}

interface State {
  error: Error | null;
  /** Changing this remounts the subtree, which is what "Try again" does. */
  attempt: number;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, attempt: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Guarded: if reporting itself throws — no network, a blocked script — the
    // fallback must still render. An error page that errors is a white page.
    try {
      reportError(error, {
        area: this.props.area,
        componentStack: info.componentStack ?? undefined,
      });
    } catch {
      console.error('[boundary]', error);
    }
  }

  render() {
    const { error, attempt } = this.state;
    if (!error) {
      return <div key={attempt} className="contents">{this.props.children}</div>;
    }

    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="max-w-md rounded-lg border p-6">
          <AlertTriangle className="mb-3 h-5 w-5 text-destructive" aria-hidden />
          <h1 className="text-lg font-semibold tracking-tight">This page stopped working.</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Nothing you did caused this, and nothing you have already saved is affected. We have
            been told about it automatically.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Trying again reloads just this page and usually clears it.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => this.setState({ error: null, attempt: attempt + 1 })}>
              Try again
            </Button>
            {/* A plain anchor, not a router link. The router is part of what may
                have failed, and a navigation control that depends on it is not a
                way out. */}
            <Button variant="ghost" asChild>
              <a href="/app">Go to the dashboard</a>
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
