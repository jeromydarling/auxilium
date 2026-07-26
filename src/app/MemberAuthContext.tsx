import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, type MemberIdentity, type MemberOrg } from '@/lib/api';

/**
 * The member portal's session.
 *
 * Deliberately a separate context from staff `AuthContext` rather than one
 * context with a `kind` field. The two resolve against different cookies and
 * different tables on the server, and keeping that separation visible in the
 * client means no component can be written that renders "the user" without
 * having decided which audience it is for. The staff shell and the portal shell
 * never appear in the same tree.
 */

interface MemberAuthValue {
  member: MemberIdentity | null;
  org: MemberOrg | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const MemberAuthContext = createContext<MemberAuthValue | null>(null);

export function MemberAuthProvider({ children }: { children: React.ReactNode }) {
  const [member, setMember] = useState<MemberIdentity | null>(null);
  const [org, setOrg] = useState<MemberOrg | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { member: m, org: o } = await api.member.me();
      setMember(m);
      setOrg(o);
    } catch {
      // A 401 here is the ordinary case — nobody is signed in yet. It is not an
      // error worth surfacing, and showing one on the login screen would be
      // alarming to someone who has simply arrived.
      setMember(null);
      setOrg(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signIn = useCallback(async (email: string, password: string) => {
    await api.member.login(email, password);
    await refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    await api.member.logout();
    setMember(null);
    setOrg(null);
  }, []);

  const value = useMemo(
    () => ({ member, org, loading, signIn, signOut, refresh }),
    [member, org, loading, signIn, signOut, refresh],
  );

  return <MemberAuthContext.Provider value={value}>{children}</MemberAuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useMemberAuth(): MemberAuthValue {
  const value = useContext(MemberAuthContext);
  if (!value) throw new Error('useMemberAuth must be used inside MemberAuthProvider');
  return value;
}
