import { useState } from 'react';
import { Check, Copy, UserPlus } from 'lucide-react';
import { api, type PortalInvite } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Giving a member access to their own portal.
 *
 * Auxilium mints the link; the ministry sends it. That division is deliberate
 * and it is the difference between an invitation that gets opened and one that
 * gets deleted. A household that has never heard of us will open a message from
 * the ministry it belongs to; a message from an unfamiliar vendor about their
 * medical bills reads as a phishing attempt, and treating it that way would be
 * the correct instinct.
 *
 * Which is also why the link is shown on screen rather than only emailed: staff
 * need to be able to read it to someone on the phone who cannot find it.
 */
export function PortalAccess({ memberId, email }: { memberId: string; email: string | null }) {
  const [invite, setInvite] = useState<PortalInvite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      setInvite(await api.members.invitePortal(memberId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Member portal</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!invite && (
          <>
            <p className="text-sm text-muted-foreground">
              Send this member a link to set up their own account, where they can see every bill
              they have submitted, what stage it is at, and what to do if one is declined.
            </p>
            {!email && (
              <p className="text-sm text-destructive">
                This member has no email address on file. Add one first.
              </p>
            )}
            <Button size="sm" onClick={send} disabled={busy || !email}>
              <UserPlus className="mr-1.5 h-4 w-4" />
              {busy ? 'Creating…' : 'Create an invitation'}
            </Button>
          </>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {invite && (
          <>
            <p className="text-sm">
              Send this link to <span className="font-medium">{invite.email}</span>. It works once,
              and expires on {new Date(invite.expires_at).toLocaleDateString()}.
            </p>

            <div className="flex gap-2">
              <input
                readOnly
                value={invite.invite_url}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="Invitation link"
                className="w-full rounded-md border bg-muted px-2 py-1.5 font-mono text-xs"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  await navigator.clipboard.writeText(invite.invite_url);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>

            {/* Creating a new invitation voids this one, so somebody who
                generates a second link "just in case" needs to know the first
                one they already pasted into an email has stopped working. */}
            <p className="text-xs text-muted-foreground">
              Auxilium does not send this &mdash; email it from the ministry&rsquo;s own address, or
              read it out over the phone. Creating another invitation for this member cancels this
              link.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
