import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, ScrollText } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { relativeDays } from '@/lib/utils';

/**
 * Adding and removing staff, and reading the audit log.
 *
 * Both were the same shape of gap: a working endpoint with nothing rendering
 * it. The team table listed people and offered no way to add one, and the audit
 * log — which every mutation in the product writes to — could be queried by the
 * API and read by nobody. A ministry told that Auxilium answers "why did this
 * happen, months later" had no screen on which to ask.
 */

const ROLES = [
  { value: 'staff', label: 'Staff', detail: 'Day-to-day work. Cannot change settings or billing.' },
  { value: 'admin', label: 'Admin', detail: 'Everything except transferring ownership.' },
  { value: 'owner', label: 'Owner', detail: 'Full control, including billing.' },
];

export function TeamSettings({ canAdminister }: { canAdminister: boolean }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ['admin', 'users'], queryFn: () => api.admin.users() });
  const [adding, setAdding] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });

  async function remove(id: string, name: string) {
    try {
      await api.admin.removeUser(id);
      await refresh();
      // A soft delete, so the reverse exists and this gets an undo bar rather
      // than a dialog. Removing the wrong colleague is an ordinary mis-click,
      // and their sessions are dropped immediately — which is the part that
      // makes it feel irreversible even though it is not.
      toast.undo(`${name} was removed.`, async () => {
        await api.admin.restoreUser(id);
        await refresh();
      });
    } catch (error) {
      toast.error(error);
    }
  }

  return (
    <div className="space-y-4">
      {canAdminister && (
        <div className="flex justify-end">
          {!adding && <Button size="sm" onClick={() => setAdding(true)}><Plus /> Add someone</Button>}
        </div>
      )}

      {adding && <AddUser onDone={() => { setAdding(false); refresh(); }} />}

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Last seen</TableHead>
              {canAdminister && <TableHead className="w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.items.map((member) => (
              <TableRow key={member.id}>
                <TableCell className="font-medium">{member.name}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{member.email}</TableCell>
                <TableCell><Badge variant="muted" className="capitalize">{member.role}</Badge></TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {relativeDays(member.last_seen_at)}
                </TableCell>
                {canAdminister && (
                  <TableCell>
                    {/* The owner has no remove button at all rather than one
                        that errors. The API refuses it; offering the control
                        anyway teaches people that buttons here sometimes do
                        nothing. */}
                    {member.role !== 'owner' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => remove(member.id, member.name)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function AddUser({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('staff');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const ready = name.trim() && email.includes('@') && password.length >= 10;

  async function submit() {
    if (!ready) return;
    setBusy(true);
    try {
      await api.admin.createUser({ name: name.trim(), email: email.trim(), role, password });
      toast.success(`${name.trim()} can sign in now.`, 'Send them the password yourself — we do not email it.');
      onDone();
    } catch (error) {
      toast.error(error, { onRetry: submit });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="u-name">Name</Label>
          <Input id="u-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="u-email">Email</Label>
          <Input id="u-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="u-role">Role</Label>
          <select
            id="u-role"
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <p className="text-xs text-muted-foreground">{ROLES.find((r) => r.value === role)?.detail}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="u-pass">Temporary password</Label>
          <Input id="u-pass" value={password} onChange={(e) => setPassword(e.target.value)} />
          <p className="text-xs text-muted-foreground">
            At least 10 characters. You pass it to them — Auxilium does not send it, for the same
            reason it does not email portal invitations.
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={busy || !ready} onClick={submit}>
          {busy ? 'Adding…' : 'Add them'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone} disabled={busy}>Cancel</Button>
      </div>
    </div>
  );
}

/**
 * The audit log.
 *
 * Every mutation in the product writes a row here. Until now none of them could
 * be read without database access — which made "an audit log with real entries
 * in it" a claim about the schema rather than a capability anybody had.
 */
export function AuditLog() {
  const [action, setAction] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'audit', action],
    queryFn: () => api.admin.audit(action ? { action } : {}),
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-64 space-y-1.5">
          <Label htmlFor="a-filter">Filter by action</Label>
          <Input
            id="a-filter"
            placeholder="claim.denied"
            value={action}
            onChange={(e) => setAction(e.target.value)}
          />
        </div>
        <p className="pb-2 text-sm text-muted-foreground">
          {isLoading ? 'Loading…' : `${items.length} entries`}
        </p>
      </div>

      {items.length === 0 && !isLoading ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <ScrollText className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
          <p className="text-sm font-medium">Nothing matches that</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Every change made in Auxilium is recorded here — who did it, to what, and when.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Who</TableHead>
                <TableHead>Did what</TableHead>
                <TableHead>To</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {entry.created_at.slice(0, 16).replace('T', ' ')}
                  </TableCell>
                  <TableCell className="text-sm">
                    {entry.actor_name ?? <span className="text-muted-foreground">{entry.actor_kind}</span>}
                  </TableCell>
                  <TableCell><span className="font-mono text-xs">{entry.action}</span></TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {entry.subject_type
                      ? `${entry.subject_type} ${entry.subject_id?.slice(0, 12) ?? ''}`
                      : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
