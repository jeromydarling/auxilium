import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider, MutationCache } from '@tanstack/react-query';
import { App } from './App';
import { ToastProvider } from '@/components/ui/toast';
import { ErrorBoundary } from './ErrorBoundary';
import { reportError } from './observability';
import { NETWORK_ERROR_STATUS } from '@/lib/errors';
import '@/styles/globals.css';

const queryClient = new QueryClient({
  /**
   * Every failed mutation is reported, once, from here.
   *
   * At the call site each mutation decides what to *show*; this decides what
   * gets recorded, and putting it in one place is what stops the coverage
   * depending on whether whoever wrote a given form remembered an `onError`.
   * Queries are not included: a failed read is usually a refetch nobody was
   * waiting on, and reporting those buries the writes that actually lost
   * somebody's work.
   */
  mutationCache: new MutationCache({
    onError: (error) => reportError(error, { area: 'mutation' }),
  }),
  defaultOptions: {
    queries: {
      // Ministry data changes on human timescales, not machine ones. Refetching
      // on every window focus is noise that costs D1 reads for nothing.
      refetchOnWindowFocus: false,
      staleTime: 60_000,
      retry: (failureCount, error) => {
        // Offline is the one case where retrying is nearly free and nearly
        // always right — a laptop waking up, a train leaving a tunnel. Anything
        // the server actually answered gets the single retry it had before,
        // because a 403 does not become a 200 by being asked twice.
        const status = (error as { status?: number } | null)?.status;
        return status === NETWORK_ERROR_STATUS ? failureCount < 3 : failureCount < 1;
      },
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* Outside the router on purpose: a router that throws during render
          takes its own children down, and a fallback mounted inside it would
          go with them. */}
      <ErrorBoundary area="root">
        <ToastProvider>
          {/* The app is mounted at /app; the site root is the marketing site,
              server-rendered by the Worker. basename keeps every <Link to="/x">
              working unchanged. */}
          <BrowserRouter basename="/app">
            <App />
          </BrowserRouter>
        </ToastProvider>
      </ErrorBoundary>
    </QueryClientProvider>
  </React.StrictMode>,
);
