import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Check, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/app/AppShell';
import { api, ApiError, type PreviewRow } from '@/lib/api';
import { CANONICAL_FIELDS, FIELD_BY_KEY, type CanonicalField } from '@/lib/import/fields';
import { cn } from '@/lib/utils';

/**
 * The import preview — the screen that makes importing safe.
 *
 * Two panels: the column mapping (what Auxilium thinks each spreadsheet column
 * is, with its confidence and how it guessed), and the row preview (exactly
 * what will happen to every row, and why). The commit button stays disabled
 * until the required fields are mapped.
 *
 * The guiding principle throughout: a wrong guess should cost one dropdown
 * change, never a corrupted roster.
 */
export function ImportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['imports', id],
    enabled: Boolean(id),
    queryFn: () => api.imports.get(id!),
  });

  useEffect(() => {
    if (data?.mapping) setMapping(data.mapping);
  }, [data?.mapping]);

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading the preview…</div>;
  }
  if (!data) {
    return <div className="p-6 text-sm text-muted-foreground">That import was not found.</div>;
  }

  const { import: record, rows, summary } = data;
  const isCommitted = record.status === 'completed';
  const headers = record.detected_headers ?? [];

  const mappedFields = new Set(Object.values(mapping).filter(Boolean) as string[]);
  const missingRequired = (['first_name', 'last_name'] as CanonicalField[]).filter(
    (f) => !mappedFields.has(f),
  );

  const applyMapping = async (header: string, field: string) => {
    const next = { ...mapping, [header]: field === '' ? null : field };
    setMapping(next);
    setError(null);
    try {
      await api.imports.remap(id!, next);
      queryClient.invalidateQueries({ queryKey: ['imports', id] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That mapping could not be applied.');
    }
  };

  const commit = async () => {
    setCommitting(true);
    setError(null);
    try {
      await api.imports.commit(id!);
      queryClient.invalidateQueries({ queryKey: ['imports'] });
      queryClient.invalidateQueries({ queryKey: ['members'] });
      queryClient.invalidateQueries({ queryKey: ['nri'] });
      navigate('/members');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The import could not be committed.');
    } finally {
      setCommitting(false);
    }
  };

  return (
    <>
      <PageHeader
        title={record.filename}
        description={
          isCommitted
            ? `Committed — ${record.created_count} members created, ${record.updated_count} updated.`
            : `${summary.total} rows read. Nothing has been written yet.`
        }
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link to="/imports"><ArrowLeft /> All imports</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={`/api/imports/${id}/source`}><Download /> Original file</a>
            </Button>
            {!isCommitted && (
              <Button
                size="sm"
                onClick={commit}
                disabled={committing || missingRequired.length > 0 || summary.create + summary.update === 0}
              >
                <Check />
                {committing
                  ? 'Importing…'
                  : `Import ${summary.create + summary.update} ${
                      summary.create + summary.update === 1 ? 'member' : 'members'
                    }`}
              </Button>
            )}
          </>
        }
      />

      <div className="space-y-6 p-6">
        {error && (
          <p className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {missingRequired.length > 0 && !isCommitted && (
          <p className="flex items-start gap-2 rounded border border-onus/40 bg-onus/10 px-3 py-2 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-onus" />
            <span>
              Map a column to{' '}
              <strong>{missingRequired.map((f) => FIELD_BY_KEY[f].label).join(' and ')}</strong>{' '}
              before importing. A roster without names is not a roster.
            </span>
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-4">
          <SummaryTile label="Will be created" value={summary.create} tone="good" />
          <SummaryTile label="Will be updated" value={summary.update} tone="neutral" />
          <SummaryTile label="Skipped as duplicates" value={summary.skip} tone="neutral" />
          <SummaryTile label="Cannot be imported" value={summary.error} tone={summary.error > 0 ? 'bad' : 'neutral'} />
        </div>

        <Tabs defaultValue="rows">
          <TabsList>
            <TabsTrigger value="rows">Rows ({rows.length})</TabsTrigger>
            <TabsTrigger value="mapping">Columns ({headers.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="mapping">
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Column in your file</TableHead>
                    <TableHead>Example values</TableHead>
                    <TableHead className="w-56">Maps to</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {headers.map((header) => {
                    const samples = rows
                      .slice(0, 3)
                      .map((r) => r.raw[header])
                      .filter(Boolean);
                    return (
                      <TableRow key={header}>
                        <TableCell className="font-medium">{header}</TableCell>
                        <TableCell className="max-w-md truncate text-sm text-muted-foreground">
                          {samples.join(' · ') || <span className="italic">empty</span>}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={mapping[header] ?? ''}
                            disabled={isCommitted}
                            onChange={(e) => applyMapping(header, e.target.value)}
                          >
                            <option value="">Do not import</option>
                            {CANONICAL_FIELDS.map((field) => (
                              <option key={field} value={field}>
                                {FIELD_BY_KEY[field].label}
                                {FIELD_BY_KEY[field].required ? ' (required)' : ''}
                              </option>
                            ))}
                          </Select>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="rows">
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14">Row</TableHead>
                    <TableHead className="w-24">Action</TableHead>
                    <TableHead>Member</TableHead>
                    <TableHead>Household</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <PreviewRowView key={row.row_number} row={row} />
                  ))}
                </TableBody>
              </Table>
            </div>
            {rows.length >= 500 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Showing the first 500 rows. All {summary.total} will be imported.
              </p>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

function PreviewRowView({ row }: { row: PreviewRow }) {
  const normalized = row.normalized as Record<string, string | null> | null;
  const name = normalized
    ? [normalized.first_name, normalized.last_name].filter(Boolean).join(' ')
    : '';

  const ACTION_VARIANT = {
    create: 'secondary', update: 'default', skip: 'muted', error: 'destructive',
  } as const;

  return (
    <TableRow className={cn(row.action === 'error' && 'bg-destructive/5')}>
      <TableCell className="text-xs text-muted-foreground tabular">{row.row_number}</TableCell>
      <TableCell>
        <Badge variant={ACTION_VARIANT[row.action]} className="capitalize">
          {row.action}
        </Badge>
      </TableCell>
      <TableCell>
        <span className="font-medium">{name || <span className="italic text-muted-foreground">no name</span>}</span>
        {normalized?.email && (
          <span className="ml-2 text-xs text-muted-foreground">{normalized.email}</span>
        )}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {normalized?.household_name ?? '—'}
      </TableCell>
      <TableCell>
        {row.issues.length === 0 ? (
          <span className="text-xs text-muted-foreground">Clean</span>
        ) : (
          <ul className="space-y-0.5">
            {row.issues.map((issue, index) => (
              <li
                key={`${issue.code}-${index}`}
                className={cn(
                  'text-xs',
                  issue.severity === 'error' ? 'text-destructive' : 'text-muted-foreground',
                )}
              >
                {issue.message}
              </li>
            ))}
          </ul>
        )}
      </TableCell>
    </TableRow>
  );
}

function SummaryTile({
  label, value, tone,
}: {
  label: string;
  value: number;
  tone: 'good' | 'neutral' | 'bad';
}) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-4',
        tone === 'bad' && value > 0 && 'border-destructive/40',
      )}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 text-2xl font-semibold tabular',
          tone === 'bad' && value > 0 && 'text-destructive',
        )}
      >
        {value}
      </p>
    </div>
  );
}
