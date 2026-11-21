import { rowSlug } from '@discordy/core/domain/rowSlug';
import { forwardRef, useId, type CSSProperties, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string | null; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {children(id)}
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="field-hint">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; leading?: ReactNode }>(function Input(
  { invalid, leading, className, ...rest },
  ref,
) {
  return (
    <span className={`input-shell${invalid ? ' is-invalid' : ''}${className ? ` ${className}` : ''}`}>
      {leading && <span className="input-leading">{leading}</span>}
      <input ref={ref} className="input" dir="auto" aria-invalid={invalid || undefined} {...rest} />
    </span>
  );
});

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={`textarea${className ? ` ${className}` : ''}`} dir="auto" {...rest} />;
});

export function Select({ children, className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className={`select-shell${className ? ` ${className}` : ''}`}>
      <select className="select" {...rest}>
        {children}
      </select>
    </span>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`switch${checked ? ' is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-thumb" />
    </button>
  );
}

export function Slider({
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
  label,
  format,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  label: string;
  format?: (v: number) => string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <span className="slider-shell">
      <input
        className="slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        style={{ '--pct': `${pct}%` } as CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {format && <span className="slider-value tnum">{format(value)}</span>}
    </span>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          title={o.title}
          className={o.value === value ? 'is-on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="checkbox">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="checkbox-box" aria-hidden="true" />
      <span>{label}</span>
    </label>
  );
}

export function SettingRow({ title, description, children, searchKey }: { title: string; description?: ReactNode; children: ReactNode; searchKey?: string }) {
  return (
    <div className="setting-row" data-row={rowSlug(searchKey ?? title)}>
      <div className="setting-copy">
        <p className="setting-title">{title}</p>
        {description && <p className="setting-desc">{description}</p>}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}
