import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/app/AppShell';
import { CompassChips } from '@/features/nri/DirectionChip';
import { api } from '@/lib/api';
import { relativeDays } from '@/lib/utils';

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'muted' | 'destructive'> = {
  active: 'secondary',
  pending: 'default',
  lapsed: 'destructive',
  inactive: 'muted',
};

export function MembersPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [cursor, setCursor] = useState<string | undefined>();

  const { data, isLoading } = useQuery({
    queryKey: ['members', search, status, cursor],
    queryFn: () => api.members.list({ q: search || undefined, status, cursor }),
  });

  return (
    <>
      <PageHeader title="Members" description="Everyone the ministry knows about." />

      <div className="p-6">
        <div className="mb-4 flex flex-wrap gap-2">
          <div className="relative min-w-56 flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, or member number"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCursor(undefined);
              }}
              className="pl-8"
            />
          </div>
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setCursor(undefined);
            }}
            className="w-40"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="lapsed">Lapsed</option>
            <option value="inactive">Inactive</option>
          </Select>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading members…</p>
        ) : (data?.items.length ?? 0) === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center">
            <p className="font-medium">No members yet.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Import your roster to bring everyone in at once.
            </p>
            <Button className="mt-4" asChild>
              <Link to="/imports">Import a roster</Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last contact</TableHead>
                    <TableHead>Signals</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.items.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell>
                        <Link to={`/members/${member.id}`} className="font-medium hover:underline">
                          {member.last_name}, {member.first_name}
                        </Link>
                        {member.member_number && (
                          <span className="ml-2 text-xs text-muted-foreground tabular">
                            #{member.member_number}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {member.email ?? member.phone ?? (
                          <span className="text-destructive">No contact details</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[member.status] ?? 'muted'} className="capitalize">
                          {member.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {relativeDays(member.last_contact_at)}
                      </TableCell>
                      <TableCell>
                        <CompassChips compass={member.compass} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {data?.nextCursor && (
              <div className="mt-4 text-center">
                <Button variant="outline" onClick={() => setCursor(data.nextCursor!)}>
                  Load more
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
