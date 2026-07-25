import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/app/AppShell';
import { api } from '@/lib/api';
import { formatCents } from '@/lib/money';

export function HouseholdsPage() {
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['households', search],
    queryFn: () => api.households.list({ q: search || undefined }),
  });

  return (
    <>
      <PageHeader
        title="Households"
        description="The sharing units — families, not individuals."
      />

      <div className="p-6">
        <div className="relative mb-4 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search households"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading households…</p>
        ) : (data?.items.length ?? 0) === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center">
            <p className="font-medium">No households yet.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Households are created automatically when you import a roster with a household column.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Household</TableHead>
                  <TableHead className="text-right">People</TableHead>
                  <TableHead className="text-right">Dependents</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">Monthly share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.items.map((household) => (
                  <TableRow key={household.id}>
                    <TableCell>
                      <Link to={`/households/${household.id}`} className="font-medium hover:underline">
                        {household.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular">{household.member_count}</TableCell>
                    <TableCell className="text-right tabular">{household.dependent_count}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {[household.city, household.state].filter(Boolean).join(', ') || '—'}
                    </TableCell>
                    <TableCell className="text-right tabular">
                      {household.share_amount_cents > 0
                        ? formatCents(household.share_amount_cents)
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </>
  );
}
