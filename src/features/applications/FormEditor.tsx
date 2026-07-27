import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Plus, Trash2 } from 'lucide-react';
import { api, type FormField, type FormSection } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SectionFields } from './FormFields';
import { useToast } from '@/components/ui/toast';
import { useDraft, useUnsavedWarning } from '@/hooks/useDraft';
import { DraftRecovery } from '@/components/ui/draft-recovery';

/**
 * Editing the application form.
 *
 * Only the configurable half is editable. The spine — names, contact, household
 * composition, requested start date — is not shown here at all, because
 * approving an application creates real members and a form that might not
 * collect a surname cannot do that. Showing it as locked fields would invite
 * the question; not showing it answers it.
 *
 * **Saving and publishing are separate**, and the version only bumps on
 * publish. A ministry rewriting its attestations over an afternoon should not
 * produce six versions, and the version number is what every submission records
 * to prove which questions it answered.
 *
 * The preview uses the same renderer as the public page, so what a ministry
 * sees while editing is what an applicant gets. Two renderers would drift, and
 * the drift would be discovered by an applicant.
 */
export function FormEditor({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data } = useQuery({ queryKey: ['applications', 'form'], queryFn: () => api.applications.form() });

  const [intro, setIntro] = useState('');
  const [sections, setSections] = useState<FormSection[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!data) return;
    setIntro(data.form.intro ?? '');
    setSections(data.form.sections);
  }, [data]);

  /**
   * The unsaved-work net, same as the site builder.
   *
   * This editor earns it for a reason of its own: a ministry rewriting its
   * application is deciding what it asks every household that ever joins, and
   * that is an afternoon's work with a lot of typing in it. Versioned by the
   * form's own version number rather than a record id — there is one form per
   * ministry, and the version is what a draft was started against.
   */
  const value = useMemo(() => ({ intro, sections }), [intro, sections]);
  const serverValue = useMemo(
    () => ({ intro: data?.form.intro ?? '', sections: data?.form.sections ?? [] }),
    [data],
  );
  const dirty = useMemo(
    () => Boolean(data) && JSON.stringify(value) !== JSON.stringify(serverValue),
    [data, value, serverValue],
  );

  const recovery = useDraft({
    scope: 'apply-form',
    id: data ? 'current' : null,
    value,
    serverValue,
    serverUpdatedAt: data ? String(data.form.version) : null,
    dirty,
  });
  useUnsavedWarning(dirty);

  async function save(publish: boolean) {
    setError(null);
    try {
      const result = await api.applications.saveForm({ intro, sections, publish });
      queryClient.invalidateQueries({ queryKey: ['applications', 'form'] });
      // Only after the save has landed — clearing first would throw away the
      // one surviving copy if the request failed.
      recovery.clear();
      setStatus(publish ? `Published as version ${result.version}.` : 'Saved as a draft.');
      setTimeout(() => setStatus(null), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not save.');
      toast.error(e, { onRetry: () => save(publish) });
    }
  }

  const publicUrl = data ? `${window.location.origin}/app${data.public_path}` : '';

  return (
    <div className="space-y-4">
      <DraftRecovery
        verdict={recovery.verdict}
        onRecover={() => {
          const restored = recovery.recover();
          if (restored) {
            setIntro(restored.intro);
            setSections(restored.sections);
          }
        }}
        onDiscard={recovery.discard}
      />
      <Card>
        <CardHeader className="pb-2"><CardTitle>Your application form</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Everyone who applies is asked for names, contact details, who is joining with them, and
            when they want to start &mdash; that part is fixed, because accepting an application
            creates those people. Everything below is yours to change.
          </p>

          {data?.form.published ? (
            <div className="space-y-2">
              <p className="text-sm">
                Live at version {data.form.version}. Put this link on your own website:
              </p>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={publicUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label="Public application link"
                  className="w-full rounded-md border bg-muted px-2 py-1.5 font-mono text-xs"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await navigator.clipboard.writeText(publicUrl);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm">
              Not published yet, so the public link returns nothing. Nobody can apply until you
              publish &mdash; a half-edited form on a public URL is worse than no form.
            </p>
          )}

          <div className="space-y-1.5">
            <label htmlFor="intro" className="text-sm font-medium">Opening paragraph</label>
            <textarea
              id="intro"
              rows={3}
              value={intro}
              onChange={(e) => setIntro(e.target.value)}
              disabled={!canEdit}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            />
          </div>
        </CardContent>
      </Card>

      {sections.map((section, si) => (
        <Card key={section.key}>
          <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
            <input
              value={section.title}
              onChange={(e) => setSections(sections.map((s, i) => i === si ? { ...s, title: e.target.value } : s))}
              disabled={!canEdit}
              aria-label={`Title of the ${section.key} section`}
              className="w-full bg-transparent text-base font-semibold outline-none disabled:opacity-60"
            />
            {canEdit && (
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove the ${section.title} section`}
                onClick={() => setSections(sections.filter((_, i) => i !== si))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </CardHeader>

          <CardContent className="space-y-4">
            <input
              value={section.description ?? ''}
              placeholder="A line of explanation (optional)"
              onChange={(e) => setSections(sections.map((s, i) => i === si ? { ...s, description: e.target.value } : s))}
              disabled={!canEdit}
              className="w-full rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            />

            {section.fields.map((field, fi) => (
              <FieldEditor
                key={field.key}
                field={field}
                canEdit={canEdit}
                onChange={(next) =>
                  setSections(sections.map((s, i) =>
                    i === si ? { ...s, fields: s.fields.map((f, j) => (j === fi ? next : f)) } : s,
                  ))
                }
                onRemove={() =>
                  setSections(sections.map((s, i) =>
                    i === si ? { ...s, fields: s.fields.filter((_, j) => j !== fi) } : s,
                  ))
                }
              />
            ))}

            {canEdit && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setSections(sections.map((s, i) =>
                    i === si
                      ? {
                          ...s,
                          fields: [
                            ...s.fields,
                            // Keys are generated, never typed. A ministry
                            // reusing a key would silently overwrite an answer,
                            // and there is no reason to make them think about it.
                            { key: `field_${Date.now()}`, label: 'New question', type: 'text' as const },
                          ],
                        }
                      : s,
                  ))
                }
              >
                <Plus className="mr-1.5 h-4 w-4" /> Add a question
              </Button>
            )}

            <div className="rounded-lg border border-dashed p-3">
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                What an applicant sees
              </p>
              <SectionFields
                section={section}
                values={{}}
                errors={{}}
                onChange={() => {}}
                disabled
              />
            </div>
          </CardContent>
        </Card>
      ))}

      {canEdit && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={() =>
              setSections([
                ...sections,
                { key: `section_${Date.now()}`, title: 'New section', fields: [] },
              ])
            }
          >
            <Plus className="mr-1.5 h-4 w-4" /> Add a section
          </Button>
          <Button variant="outline" onClick={() => save(false)}>Save draft</Button>
          <Button onClick={() => save(true)}>
            {data?.form.published ? 'Publish changes' : 'Publish'}
          </Button>
          {status && <span className="text-sm text-muted-foreground">{status}</span>}
          {error && <span className="text-sm text-destructive">{error}</span>}
        </div>
      )}
    </div>
  );
}

const TYPES: { value: FormField['type']; label: string }[] = [
  { value: 'text', label: 'Short answer' },
  { value: 'textarea', label: 'Long answer' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'date', label: 'Date' },
  { value: 'number', label: 'Number' },
  { value: 'select', label: 'Choose one' },
  { value: 'checkbox', label: 'Yes / no' },
  { value: 'attestation', label: 'Something to agree to' },
];

function FieldEditor({
  field, canEdit, onChange, onRemove,
}: {
  field: FormField;
  canEdit: boolean;
  onChange: (next: FormField) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex gap-2">
        <input
          value={field.label}
          onChange={(e) => onChange({ ...field, label: e.target.value })}
          disabled={!canEdit}
          aria-label="Question"
          className="w-full rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
        />
        <select
          value={field.type}
          onChange={(e) => onChange({ ...field, type: e.target.value as FormField['type'] })}
          disabled={!canEdit}
          aria-label="Answer type"
          className="rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
        >
          {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        {canEdit && (
          <Button variant="ghost" size="icon" aria-label="Remove this question" onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      {field.type === 'attestation' && (
        <div className="space-y-1">
          <textarea
            rows={3}
            value={field.statement ?? ''}
            placeholder="The exact words the applicant is agreeing to"
            onChange={(e) => onChange({ ...field, statement: e.target.value })}
            disabled={!canEdit}
            className="w-full rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
          />
          <p className="text-xs text-muted-foreground">
            Shown in full, not as a label. This is the sentence somebody may be shown again years
            later, so write it as the document it is.
          </p>
        </div>
      )}

      {field.type === 'select' && (
        <textarea
          rows={3}
          value={(field.options ?? []).map((o) => o.label).join('\n')}
          placeholder="One option per line"
          onChange={(e) =>
            onChange({
              ...field,
              options: e.target.value.split('\n').filter(Boolean).map((label) => ({
                // Derived from the label so a ministry never has to think about
                // values — but stable enough that reordering does not rewrite
                // answers already stored.
                value: label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
                label,
              })),
            })
          }
          disabled={!canEdit}
          aria-label="Options, one per line"
          className="w-full rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
        />
      )}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={Boolean(field.required)}
          onChange={(e) => onChange({ ...field, required: e.target.checked })}
          disabled={!canEdit}
        />
        Required
      </label>
    </div>
  );
}
