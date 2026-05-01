'use client';

import { ReactNode, InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

interface FieldProps {
  label: string;
  hint?: string;
  optional?: boolean;
  children: ReactNode;
  error?: string;
}

export function Field({ label, hint, optional, children, error }: FieldProps) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-widest mb-2 font-bold text-haze/80">
        {label}{' '}
        {optional && (
          <span className="text-haze/40 normal-case tracking-normal font-medium">
            (optional)
          </span>
        )}
      </label>
      {children}
      {hint && !error && (
        <p className="mt-1.5 text-xs text-haze/50">{hint}</p>
      )}
      {error && (
        <p className="mt-1.5 text-xs text-spotlight">{error}</p>
      )}
    </div>
  );
}

const baseInput =
  'w-full px-4 py-3 bg-stage-900 border border-stage-700 rounded-md placeholder-haze/30 focus:outline-none focus:border-spotlight focus:ring-2 focus:ring-spotlight/20 transition-all';

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = '', ...rest } = props;
  return <input className={`${baseInput} ${className}`} {...rest} />;
}

export function TextArea(
  props: TextareaHTMLAttributes<HTMLTextAreaElement> & {
    showCount?: boolean;
    maxLength?: number;
  },
) {
  const { className = '', showCount, value, maxLength, ...rest } = props;
  return (
    <div className="relative">
      <textarea
        className={`${baseInput} resize-none ${className}`}
        value={value}
        maxLength={maxLength}
        {...rest}
      />
      {showCount && maxLength && (
        <span className="absolute bottom-2 right-3 text-xs text-haze/40 tabular pointer-events-none">
          {(value as string)?.length ?? 0}/{maxLength}
        </span>
      )}
    </div>
  );
}

interface SelectProps {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export function Select({
  value,
  onChange,
  options,
  placeholder,
}: SelectProps) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${baseInput} appearance-none pr-10 cursor-pointer`}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg
        className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-haze/60"
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
      >
        <path
          d="M4 6l4 4 4-4"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

interface ChipGroupProps {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  max?: number;
}

export function ChipGroup({
  options,
  selected,
  onChange,
  max,
}: ChipGroupProps) {
  const toggle = (opt: string) => {
    if (selected.includes(opt)) {
      onChange(selected.filter((s) => s !== opt));
    } else {
      if (max && selected.length >= max) return;
      onChange([...selected, opt]);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = selected.includes(opt);
        const disabled = !active && max != null && selected.length >= max;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            disabled={disabled}
            className={`px-3.5 py-1.5 text-sm font-semibold rounded-full border transition-all ${
              active
                ? 'bg-spotlight text-white border-spotlight shadow-lg shadow-spotlight/20'
                : disabled
                ? 'bg-stage-900 text-haze/30 border-stage-700 cursor-not-allowed'
                : 'bg-stage-900 text-haze border-stage-700 hover:border-spotlight/50'
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

interface ButtonProps {
  type?: 'button' | 'submit';
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  fullWidth?: boolean;
}

export function Button({
  type = 'button',
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  onClick,
  children,
  className = '',
  fullWidth,
}: ButtonProps) {
  const sizeCls = size === 'lg' ? 'px-6 py-3.5 text-base' : 'px-5 py-3 text-sm';
  const variantCls =
    variant === 'primary'
      ? 'bg-spotlight text-white hover:bg-spotlight-dim shadow-lg shadow-spotlight/30 disabled:shadow-none'
      : variant === 'secondary'
      ? 'bg-stage-800 border border-stage-700 hover:border-stage-600'
      : 'text-haze';

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`font-bold rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed ${sizeCls} ${variantCls} ${
        fullWidth ? 'w-full' : ''
      } ${className}`}
    >
      {loading ? (
        <span className="inline-flex items-center gap-2">
          <Spinner /> Loading…
        </span>
      ) : (
        children
      )}
    </button>
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className="animate-spin"
      fill="none"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="3"
        opacity="0.2"
      />
      <path
        d="M12 3 a9 9 0 0 1 9 9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

interface StepIndicatorProps {
  total: number;
  current: number;
  labels?: string[];
}

export function StepIndicator({
  total,
  current,
  labels,
}: StepIndicatorProps) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => {
        const active = i + 1 === current;
        const done = i + 1 < current;
        return (
          <div key={i} className="flex items-center gap-2">
            <div
              className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-all ${
                done
                  ? 'bg-spotlight text-white'
                  : active
                  ? 'bg-spotlight text-white shadow-lg shadow-spotlight/40 scale-110'
                  : 'bg-stage-800 border border-stage-700 text-haze/60'
              }`}
            >
              {done ? '✓' : i + 1}
            </div>
            {labels?.[i] && (
              <span
                className={`text-xs uppercase tracking-widest font-bold ${
                  active ? '' : done ? 'text-haze' : 'text-haze/40'
                }`}
              >
                {labels[i]}
              </span>
            )}
            {i < total - 1 && (
              <div
                className={`w-8 h-px ${done ? 'bg-spotlight' : 'bg-stage-700'}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
