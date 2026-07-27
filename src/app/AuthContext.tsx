import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type SessionUser, type OrgRecord } from '@/lib/api';
import { initObservability } from './observability';

/**
 * Session context.
 *
 * One `/api/auth/me` on boot decides what the app renders. React Query owns
 * the caching, so signing in or out is an invalidation rather than a page
 * reload.
 */

interface AuthState {
  user: SessionUser | null;
  org: OrgRecord | null;
  isLoading: boolean;
  refresh: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['auth', 'me'],
    // A 401 here is a normal state (signed out), not an error worth retrying.
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: () => api.auth.me(),
  });

  /**
   * Start error reporting, after the app is on screen.
   *
   * Everything about the placement is deliberate. It is in an effect, so the
   * ~35KB SDK is fetched after first paint rather than blocking it. It is
   * inside `AuthProvider`, which the portal and the public application form
   * never mount, so a member or a stranger never downloads it. And it is
   * conditional on a resolved user, so a signed-out login page does not
   * either. `initObservability` is idempotent and swallows its own failures, so
   * a re-render, a blocked script, or an offline boot all leave the app exactly
   * as it was.
   */
  const config = data?.observability;
  const user = data?.user ?? null;
  useEffect(() => {
    if (!user || !config?.dsn) return;
    void initObservability({
      dsn: config.dsn,
      environment: config.environment,
      release: config.release ?? undefined,
      user: { id: user.id, role: user.role, orgId: user.org_id },
    });
  }, [user, config?.dsn, config?.environment, config?.release]);

  const value: AuthState = {
    user: data?.user ?? null,
    org: data?.org ?? null,
    isLoading,
    refresh: () => queryClient.invalidateQueries({ queryKey: ['auth', 'me'] }),
    signOut: async () => {
      await api.auth.logout();
      // Everything cached belonged to the old session.
      queryClient.clear();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider.');
  return context;
}
