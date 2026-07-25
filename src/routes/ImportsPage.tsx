import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/app/AppShell';
import { api, ApiError } from '@/lib/api';
import { relativeDays } from '@/lib/utils';

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'muted' | 'destructive'> = {
  completed: 'secondary',
  previewing: 'default',
  committing: 'default',
  failed: 'destructive',
  cancelled: 'muted',
  uploaded: 'muted',
  mapping: 'muted',
};

export function ImportsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['imports'],
    queryFn: () => api.imports.list(),
  });

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const result = await api.imports.upload(file);
      queryClient.invalidateQueries({ queryKey: ['imports'] });
      navigate(`/imports/${result.import_id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That file could not be read.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Imports"
        description="Bring a roster in from a spreadsheet. Nothing is written until you approve the preview."
        actions={
          <Button onClick={() => fileInput.current?.click()} disabled={uploading}>
            <Upload /> {uploading ? 'Reading…' : 'Upload a CSV'}
          </Button>
        }
      />

      <input
        ref={fileInput}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload(file);
          e.target.value = '';
        }}
      />

      <div className="p-6">
        {error && (
          <p className="mb-4 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading import history…</p>
        ) : (data?.items.length ?? 0) === 0 ? (
          <div
            className="rounded-lg border border-dashed p-10 text-center"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file) upload(file);
            }}
          >
            <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 font-medium">No imports yet.</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Drop a CSV here, or upload one. Auxilium will guess which column is which, check every
              row, and find duplicates — then show you exactly what it plans to do before doing it.
            </p>
            <Button className="mt-4" onClick={() => fileInput.current?.click()}>
              <Upload /> Choose a file
            </Button>
          </div>
        ) : (
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Rows</TableHead>
                  <TableHead className="text-right">Result</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead>By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.items.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>
                      <Link to={`/imports/${record.id}`} className="font-medium hover:underline">
                        {record.filename}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[record.status] ?? 'muted'} className="capitalize">
                        {record.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular">{record.total_rows}</TableCell>
                    <TableCell className="text-right text-sm tabular">
                      {record.status === 'completed'
                        ? `${record.created_count} new · ${record.updated_count} updated`
                        : record.invalid_rows > 0
                          ? `${record.invalid_rows} need attention`
                          : '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {relativeDays(record.created_at)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {record.created_by_name ?? '—'}
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
