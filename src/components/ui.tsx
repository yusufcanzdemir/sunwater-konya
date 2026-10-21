import { useEffect, useState, type ReactNode } from 'react';
import { parseNumber } from '../state/farm';

export const fmt = (n: number, digits = 0) =>
  n.toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function AssumptionBadge() {
  return (
    <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
      varsayım
    </span>
  );
}

export function Field({
  label,
  error,
  highlight,
  children,
}: {
  label: ReactNode;
  error?: string;
  highlight?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1 text-sm ${highlight ? 'rounded ring-2 ring-amber-400 ring-offset-2' : ''}`}>
      <span className="font-medium text-soil-700">{label}</span>
      {children}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </label>
  );
}

export const inputClass =
  'rounded-md border border-soil-300 bg-white px-2.5 py-1.5 text-soil-900 focus:border-wheat-500 focus:outline-none focus:ring-1 focus:ring-wheat-500';

/** Numeric input that keeps the typed text and only commits valid numbers. */
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  integer,
}: {
  label: ReactNode;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  integer?: boolean;
}) {
  const [text, setText] = useState(String(value).replace('.', ','));
  useEffect(() => {
    // Resync only when the value changes from outside (e.g. "reset to defaults").
    if (parseNumber(text) !== value) setText(String(value).replace('.', ','));
  }, [value]);

  const n = parseNumber(text);
  const invalid =
    n == null || (min != null && n < min) || (max != null && n > max) || (integer === true && !Number.isInteger(n));

  return (
    <Field label={label} error={invalid ? 'Geçersiz değer' : undefined}>
      <input
        className={inputClass}
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const next = parseNumber(e.target.value);
          const ok =
            next != null &&
            (min == null || next >= min) &&
            (max == null || next <= max) &&
            (!integer || Number.isInteger(next));
          if (ok) onChange(next);
        }}
      />
    </Field>
  );
}
