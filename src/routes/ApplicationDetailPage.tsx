import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Reviewing one application.
 *
 * Opening this page is what stops the "nobody has looked at this" clock, which
 * is why the read is a side effect rather than something staff have to click.
 *
 * Answers are rendered against the form version the applicant actually
 * answered. If the ministry has since edited its form, that is said out loud —
 * rendering today's questions beside last month's answers mislabels them, and
 * the mislabelling is invisible.
 */
export function ApplicationDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['applications', id],
    queryFn: () => api.applications.get(id),
    enabled: id.length > 0,
    retry: false,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['applications'] });
    queryClient.invalidateQueries({ queryKey: ['admin', 'onboarding'] });
  };

  const accept = useMutation({
    mutationFn: () => api.applications.accept(id, note || undefined),
    onSuccess: (result) => {
      refresh();
      // Straight to the family that now exists. The point of accepting is that
      // they are in the roster, and showing that immediately is the proof.
      navigate(`/households/${result.household_id}`);
    },
    onError: (e: Error) => setError(e.message),
  });

  const setStatus = useMutation({
    mutationFn: (status: string) => api.applications.setStatus(id, { status, note: note || undefined }),
    onSuccess: () => { refresh(); setError(null); },
    onError: (e: Error) => setError(e.message),
  });

  if (isLoading) return <div className="p-6"><p className="text-sm text-muted-foreground">Loading…</p></div>;
  if (isError || !data) {
    return (
      <div className="space-y-3 p-6">
        <p className="text-sm">That application was not found.</p>
        <Link to="/applications" className="text-sm text-primary hover:underline">Back to applications</Link>
      </div>
    );
  }

  const { application: a, form, stale_form } = data;
  const decided = Boolean(a.decided_at);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <Link
        to="/applications"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Applications
      </Link>

      <div>
        <h1 className="text-2xl font-semibold">{a.first_name} {a.last_name}</h1>
        <p className="mt-1 text-muted-foreground">
          Applied {new Date(a.submitted_at).toLocaleDateString()} · {a.status.replace('_', ' ')}
        </p>
      </div>

      {a.spam_reasons.length > 0 && (
        <Card className="border-destructive/40">
          <CardContent className="pt-6">
            <p className="flex items-center gap-2 text-sm font-medium">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Automated checks flagged this
            </p>
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
              {a.spam_reasons.map((r) => <li key={r}>{r}</li>)}
            </ul>
            <p className="mt-2 text-sm text-muted-foreground">
              Nothing has been decided. If this is a real family, treat it as one.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle>Contact</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          <Row label="Email" value={a.email} />
          <Row label="Phone" value={a.phone} />
          <Row label="Date of birth" value={a.date_of_birth} />
          <Row
            label="Address"
            value={[a.address_line1, a.address_line2, a.city, a.state, a.postal_code]
              .filter(Boolean).join(', ') || null}
          />
          <Row label="Requested start" value={a.requested_start_date} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Household ({a.household.length + 1})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>
            <span className="font-medium">{a.first_name} {a.last_name}</span>
            <span className="text-muted-foreground"> — applicant, will be the primary contact</span>
          </p>
          {a.household.map((p, i) => (
            <p key={i}>
              <span className="font-medium">{p.first_name} {p.last_name}</span>
              <span className="text-muted-foreground">
                {p.relationship ? ` — ${p.relationship}` : ''}
                {p.date_of_birth ? ` · ${p.date_of_birth}` : ''}
              </span>
            </p>
          ))}
        </CardContent>
      </Card>

      {stale_form && (
        <p className="text-sm text-muted-foreground">
          This was answered against version {a.form_version} of your form; you have since published
          a newer one. The questions below are the ones they were actually asked.
        </p>
      )}

      {form.sections.map((section) => {
        const values = a.answers[section.key];
        if (!values) return null;
        return (
          <Card key={section.key}>
            <CardHeader className="pb-2"><CardTitle>{section.title}</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {section.fields.map((f) => {
                const v = values[f.key];
                if (v === undefined) return null;
                return (
                  <div key={f.key}>
                    {/* An attestation shows the statement, not the label. What
                        somebody affirmed is the sentence, and a reviewer
                        reading "Agreed: yes" learns nothing about what to. */}
                    <p className="text-muted-foreground">{f.statement ?? f.label}</p>
                    <p className="font-medium">
                      {typeof v === 'boolean' ? (v ? 'Agreed' : 'Not agreed') : String(v) || '—'}
                    </p>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}

      <Card>
        <CardHeader className="pb-2"><CardTitle>Decide</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {decided ? (
            <>
              <p className="text-sm">
                Decided {new Date(a.decided_at!).toLocaleDateString()}
                {a.decision_note && ` — ${a.decision_note}`}
              </p>
              {a.created_household_id && (
                <Link
                  to={`/households/${a.created_household_id}`}
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  Open the household this created <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <label htmlFor="note" className="text-sm font-medium">
                  A note the applicant can be told
                </label>
                <textarea
                  id="note"
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                <p className="text-xs text-muted-foreground">
                  Required to decline. A decline nobody can explain leaves the applicant with
                  nothing to act on and the ministry with nothing to defend.
                </p>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => accept.mutate()} disabled={accept.isPending}>
                  {accept.isPending ? 'Accepting…' : 'Accept and create the household'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setStatus.mutate('needs_info')}
                  disabled={setStatus.isPending}
                >
                  Ask for more
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setStatus.mutate('declined')}
                  disabled={setStatus.isPending}
                >
                  Decline
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                Accepting creates a household with everyone listed above, sets the applicant as the
                primary contact, and joins them on their requested start date.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <p className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value || '—'}</span>
    </p>
  );
}
