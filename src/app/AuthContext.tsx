import { createContext, useContext, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type SessionUser, type OrgRecord } from '@/lib/api';

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
