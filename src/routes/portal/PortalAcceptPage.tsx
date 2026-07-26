import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useMemberAuth } from '@/app/MemberAuthContext';

/**
 * Claiming an invitation.
 *
 * The invite is read before it is redeemed so the page can show the name and
 * the address it was sent to. That is not decoration: invitation links get
 * forwarded, and someone who opens one meant for a family member needs to be
 * able to see instantly that it is not theirs, before they set a password on
 * somebody else's medical record.
 *
 * The only password rule is length. Composition rules — a number, a symbol, a
 * capital — reliably produce "Password1!" and a sticky note, and this is a
 * portal people sign into a few times a year.
 */
export function PortalAcceptPage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const { refresh } = useMemberAuth();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['member', 'invite', token],
    queryFn: () => api.member.invite(token),
    enabled: token.length > 0,
    retry: false,
  });

  if (isLoading) return <Centered><p className="text-sm text-muted-foreground">Checking your invitation…</p></Centered>;

  if (isError || !data) {
    return (
      <Centered>
        <Card className="w-full max-w-sm">
          <CardHeader><CardTitle>This invitation is no longer valid</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Invitations expire, and each one can only be used once. If yours has lapsed or has
              already been claimed, your ministry can send a new one.
            </p>
            <Button variant="outline" className="w-full" onClick={() => navigate('/portal/login')}>
              Go to sign in
            </Button>
          </CardContent>
        </Card>
      </Centered>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError('Those two passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.member.acceptInvite(token, password);
      // The server signs you in as part of redeeming, so there is no reason to
      // make someone type the password they just chose.
      await refresh();
      navigate('/portal', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Centered>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Welcome, {data.name.split(' ')[0]}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {data.org_name} has invited you to your member account. Choose a password to finish
            setting it up.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            This invitation was sent to <span className="font-medium text-foreground">{data.email}</span>.
            If that is not you, do not continue &mdash; tell whoever forwarded it.
          </p>

          <form className="mt-4 space-y-4" onSubmit={submit}>
            <div className="space-y-1.5">
              <label htmlFor="pw" className="text-sm font-medium">Choose a password</label>
              <input
                id="pw"
                type="password"
                autoComplete="new-password"
                required
                minLength={10}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="text-xs text-muted-foreground">
                At least 10 characters. A few words you will remember beats something short and
                clever.
              </p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="pw2" className="text-sm font-medium">Type it again</label>
              <input
                id="pw2"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? 'Setting up…' : 'Set my password'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">{children}</div>
  );
}
