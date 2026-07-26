import type { FormField, FormSection } from '@/lib/api';

/**
 * Rendering a ministry's configured section.
 *
 * Shared between the public form and the staff preview so a ministry editing
 * its form sees exactly what an applicant will. Two renderers would drift, and
 * the drift would be discovered by an applicant.
 *
 * The one decision worth naming: an **attestation renders its full statement**,
 * not a label beside a tick box. "I affirm the statement of faith ☐" is not the
 * same document as the statement, and this is the field type most likely to be
 * quoted back at somebody years later.
 */
export function SectionFields({
  section,
  values,
  errors,
  onChange,
  disabled,
}: {
  section: FormSection;
  values: Record<string, string | boolean>;
  errors: Record<string, string>;
  onChange: (fieldKey: string, value: string | boolean) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="space-y-4" disabled={disabled}>
      <legend className="sr-only">{section.title}</legend>
      {section.fields.map((field) => (
        <Field
          key={field.key}
          field={field}
          value={values[field.key]}
          error={errors[`${section.key}.${field.key}`]}
          onChange={(v) => onChange(field.key, v)}
        />
      ))}
    </fieldset>
  );
}

const INPUT =
  'w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60';

function Field({
  field,
  value,
  error,
  onChange,
}: {
  field: FormField;
  value: string | boolean | undefined;
  error?: string;
  onChange: (value: string | boolean) => void;
}) {
  const id = `f-${field.key}`;
  const describedBy = [field.help && `${id}-help`, error && `${id}-error`].filter(Boolean).join(' ');

  if (field.type === 'attestation' || field.type === 'checkbox') {
    return (
      <div>
        <label className="flex cursor-pointer items-start gap-2.5">
          <input
            id={id}
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
            aria-describedby={describedBy || undefined}
            aria-invalid={Boolean(error)}
            className="mt-0.5 h-4 w-4 shrink-0"
          />
          <span className="text-sm">
            {/* The statement itself, in full, when there is one. */}
            {field.statement ?? field.label}
            {field.required && <span className="text-destructive"> *</span>}
          </span>
        </label>
        {field.help && (
          <p id={`${id}-help`} className="ml-6 mt-1 text-xs text-muted-foreground">{field.help}</p>
        )}
        {error && <p id={`${id}-error`} className="ml-6 mt-1 text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {field.label}
        {field.required && <span className="text-destructive"> *</span>}
      </label>

      {field.type === 'select' ? (
        <select
          id={id}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={describedBy || undefined}
          aria-invalid={Boolean(error)}
          className={INPUT}
        >
          <option value="">Choose one…</option>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      ) : field.type === 'textarea' ? (
        <textarea
          id={id}
          rows={4}
          maxLength={field.maxLength}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={describedBy || undefined}
          aria-invalid={Boolean(error)}
          className={INPUT}
        />
      ) : (
        <input
          id={id}
          type={
            field.type === 'email' ? 'email'
            : field.type === 'date' ? 'date'
            : field.type === 'number' ? 'number'
            : field.type === 'phone' ? 'tel'
            : 'text'
          }
          maxLength={field.maxLength}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={describedBy || undefined}
          aria-invalid={Boolean(error)}
          className={INPUT}
        />
      )}

      {field.help && (
        <p id={`${id}-help`} className="text-xs text-muted-foreground">{field.help}</p>
      )}
      {error && <p id={`${id}-error`} className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
