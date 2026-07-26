import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { api, type ApplicationIssue, type HouseholdApplicant, type PublicApplicationForm } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SectionFields } from '@/features/applications/FormFields';
import { useBrand } from '@/features/brand/BrandProvider';

/**
 * The public application.
 *
 * Reachable with no account, because the whole point is that somebody who found
 * the ministry can apply. That makes this the second unauthenticated write path
 * in the product, and it is written accordingly:
 *
 *   • A honeypot field, hidden from people and from screen readers, that
 *     anything filling every input it finds will complete.
 *   • The time the form was opened, sent along so a submission faster than the
 *     page can be read is scored — not blocked.
 *   • No CAPTCHA. It taxes every legitimate applicant, fails hardest for people
 *     on poor connections and screen readers, and is defeated cheaply.
 *
 * Nothing here rejects a submission for looking suspicious. The server scores
 * and sorts; a human still reads every one. Somebody filling this in may be
 * doing it on a phone in a hospital car park, and losing that submission to a
 * filter is far worse than a ministry deleting a junk row.
 */
export function ApplyPage() {
  const { slug = '' } = useParams();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['apply', slug],
    queryFn: () => api.public.applicationForm(slug),
    enabled: slug.length > 0,
    retry: false,
  });

  if (isLoading) return <Centered><p className="text-sm text-muted-foreground">Loading…</p></Centered>;
  if (isError || !data) {
    return (
      <Centered>
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold">There is no application form here</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This link may be wrong, or the ministry may not be taking applications online right now.
            Contacting them directly is the fastest way to find out.
          </p>
        </div>
      </Centered>
    );
  }

  return <ApplyForm form={data} slug={slug} />;
}

function ApplyForm({ form, slug }: { form: PublicApplicationForm; slug: string }) {
  // For many applicants this page is the first thing they see of the ministry.
  useBrand(form.brand);

  // Captured on mount, not on submit. The gap between the two is the signal.
  const startedAt = useRef(new Date().toISOString());
  const [honeypot, setHoneypot] = useState('');

  const [spine, setSpine] = useState({
    first_name: '', last_name: '', email: '', phone: '', date_of_birth: '',
    address_line1: '', address_line2: '', city: '', state: '', postal_code: '',
    requested_start_date: '',
  });
  const [household, setHousehold] = useState<HouseholdApplicant[]>([]);
  const [answers, setAnswers] = useState<Record<string, Record<string, string | boolean>>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [reference, setReference] = useState<string | null>(null);

  useEffect(() => {
    if (reference) window.scrollTo({ top: 0 });
  }, [reference]);

  if (reference) {
    return (
      <Centered>
        <Card className="max-w-lg">
          <CardContent className="space-y-3 pt-6">
            <h1 className="text-xl font-semibold">Your application is in</h1>
            <p className="text-sm">
              {form.org_name} has it, and a person will read it. They will come back to you either
              way &mdash; if you have not heard anything in a couple of weeks, it is entirely
              reasonable to chase them.
            </p>
            <p className="text-sm text-muted-foreground">
              Your reference is <span className="font-mono">{reference}</span>. Worth keeping.
            </p>
            <p className="text-sm text-muted-foreground">{form.health_note}</p>
          </CardContent>
        </Card>
      </Centered>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const result = await api.public.apply(slug, {
        spine: { ...spine, household },
        answers,
        honeypot,
        started_at: startedAt.current,
      });
      setReference(result.reference);
    } catch (err) {
      const issues = (err as { payload?: { issues?: ApplicationIssue[] } })?.payload?.issues;
      if (issues?.length) {
        setErrors(Object.fromEntries(issues.map((i) => [i.path, i.message])));
        // Take them to the first thing that needs fixing rather than leaving
        // them to hunt for it.
        document.getElementById(`err-${issues[0].path}`)?.scrollIntoView({ block: 'center' });
      } else {
        setErrors({ _form: err instanceof Error ? err.message : 'That did not send. Please try again.' });
      }
    } finally {
      setBusy(false);
    }
  }

  const field = (key: keyof typeof spine, label: string, type = 'text', required = false) => (
    <div className="space-y-1.5">
      <label htmlFor={key} className="text-sm font-medium">
        {label}{required && <span className="text-destructive"> *</span>}
      </label>
      <input
        id={key}
        type={type}
        value={spine[key]}
        onChange={(e) => setSpine({ ...spine, [key]: e.target.value })}
        aria-invalid={Boolean(errors[`spine.${key}`])}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
      {errors[`spine.${key}`] && (
        <p id={`err-spine.${key}`} className="text-sm text-destructive">{errors[`spine.${key}`]}</p>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Apply to {form.org_name}</h1>
      {form.intro && <p className="mt-2 text-muted-foreground">{form.intro}</p>}

      <form className="mt-8 space-y-8" onSubmit={submit}>
        {/* Not shown, and not announced. A person never encounters this; a
            script that fills every input it finds will. */}
        <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
          <label htmlFor="website">Leave this blank</label>
          <input
            id="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </div>

        <section className="space-y-4">
          <h2 className="font-semibold">About you</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {field('first_name', 'First name', 'text', true)}
            {field('last_name', 'Last name', 'text', true)}
            {field('email', 'Email', 'email', true)}
            {field('phone', 'Phone', 'tel')}
            {field('date_of_birth', 'Date of birth', 'date')}
            {field('requested_start_date', 'When would you like to start?', 'date')}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="font-semibold">Where you live</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {field('address_line1', 'Address')}
            {field('address_line2', 'Address line 2')}
            {field('city', 'City')}
            {field('state', 'State')}
            {field('postal_code', 'ZIP')}
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="font-semibold">Everyone else joining with you</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Leave this empty if it is just you. You do not need their contact details &mdash; only
              yours.
            </p>
          </div>

          {household.map((person, i) => (
            <div key={i} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <input
                aria-label={`First name of person ${i + 1}`}
                placeholder="First name"
                value={person.first_name}
                onChange={(e) => setHousehold(household.map((p, j) => j === i ? { ...p, first_name: e.target.value } : p))}
                className="rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                aria-label={`Last name of person ${i + 1}`}
                placeholder="Last name"
                value={person.last_name}
                onChange={(e) => setHousehold(household.map((p, j) => j === i ? { ...p, last_name: e.target.value } : p))}
                className="rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                aria-label={`Relationship of person ${i + 1} to you`}
                placeholder="Spouse, son, …"
                value={person.relationship ?? ''}
                onChange={(e) => setHousehold(household.map((p, j) => j === i ? { ...p, relationship: e.target.value } : p))}
                className="rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove person ${i + 1}`}
                onClick={() => setHousehold(household.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <input
                aria-label={`Date of birth of person ${i + 1}`}
                type="date"
                value={person.date_of_birth ?? ''}
                onChange={(e) => setHousehold(household.map((p, j) => j === i ? { ...p, date_of_birth: e.target.value } : p))}
                className="rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring sm:col-span-2"
              />
              {[`spine.household.${i}.first_name`, `spine.household.${i}.last_name`, `spine.household.${i}.date_of_birth`]
                .filter((k) => errors[k])
                .map((k) => (
                  <p key={k} id={`err-${k}`} className="text-sm text-destructive sm:col-span-4">{errors[k]}</p>
                ))}
            </div>
          ))}

          {errors['spine.household'] && (
            <p id="err-spine.household" className="text-sm text-destructive">{errors['spine.household']}</p>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setHousehold([...household, { first_name: '', last_name: '' }])}
          >
            <Plus className="mr-1.5 h-4 w-4" /> Add someone
          </Button>
        </section>

        {form.sections.map((section) => (
          <section key={section.key} className="space-y-4">
            <div>
              <h2 className="font-semibold">{section.title}</h2>
              {section.description && (
                <p className="mt-1 text-sm text-muted-foreground">{section.description}</p>
              )}
            </div>
            <SectionFields
              section={section}
              values={answers[section.key] ?? {}}
              errors={errors}
              onChange={(fieldKey, value) =>
                setAnswers({ ...answers, [section.key]: { ...answers[section.key], [fieldKey]: value } })
              }
            />
            {section.fields.map((f) =>
              errors[`${section.key}.${f.key}`] ? (
                <span key={f.key} id={`err-${section.key}.${f.key}`} className="sr-only" />
              ) : null,
            )}
          </section>
        ))}

        <p className="text-sm text-muted-foreground">{form.health_note}</p>

        {errors._form && <p className="text-sm text-destructive">{errors._form}</p>}

        <Button type="submit" disabled={busy}>
          {busy ? 'Sending…' : 'Send my application'}
        </Button>
      </form>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center px-4">{children}</div>;
}
