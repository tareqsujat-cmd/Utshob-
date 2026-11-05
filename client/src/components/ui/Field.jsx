import { useId } from 'react';

// Form inputs with a label, optional hint, and an error message underneath.
// <Input label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} error={errors.email} />

const CONTROL =
  'w-full rounded-lg border bg-card px-3 py-2 text-sm text-ink placeholder:text-muted/70 ' +
  'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15 disabled:bg-paper disabled:text-muted';

function FieldWrapper({ id, label, hint, error, required, children, className = '' }) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
          {label}
          {required && <span className="text-danger"> *</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1 text-xs font-medium text-danger">{error}</p>
      ) : (
        hint && <p className="mt-1 text-xs text-muted">{hint}</p>
      )}
    </div>
  );
}

export function Input({ label, hint, error, className, required, ...props }) {
  const id = useId();
  return (
    <FieldWrapper id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <input id={id} required={required} className={`${CONTROL} ${error ? 'border-danger' : 'border-line'}`} {...props} />
    </FieldWrapper>
  );
}

// options: [{ value, label }]
export function Select({ label, hint, error, className, required, options = [], placeholder, ...props }) {
  const id = useId();
  return (
    <FieldWrapper id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <select id={id} required={required} className={`${CONTROL} ${error ? 'border-danger' : 'border-line'}`} {...props}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldWrapper>
  );
}

export function Textarea({ label, hint, error, className, required, rows = 3, ...props }) {
  const id = useId();
  return (
    <FieldWrapper id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <textarea id={id} rows={rows} required={required} className={`${CONTROL} ${error ? 'border-danger' : 'border-line'}`} {...props} />
    </FieldWrapper>
  );
}

export function Checkbox({ label, hint, className = '', ...props }) {
  const id = useId();
  return (
    <div className={`flex items-start gap-2.5 ${className}`}>
      <input id={id} type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]" {...props} />
      <label htmlFor={id} className="text-sm">
        {label}
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </label>
    </div>
  );
}
