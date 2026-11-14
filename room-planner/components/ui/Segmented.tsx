import type React from 'react';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SegmentedProps<T extends string> {
  name: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (v: T) => void;
  className?: string;
  style?: React.CSSProperties;
  'aria-label': string;
}

/** A segmented control: a radiogroup of native radios styled by `.seg` / `.seg-opt`. */
export function Segmented<T extends string>(props: SegmentedProps<T>) {
  const { name, value, options, onChange, className, style } = props;
  return (
    <div
      className={className ? `seg ${className}` : 'seg'}
      role="radiogroup"
      aria-label={props['aria-label']}
      style={style}
    >
      {options.map((opt) => (
        <label key={opt.value} className="seg-opt">
          <input
            type="radio"
            name={name}
            value={opt.value}
            checked={opt.value === value}
            disabled={opt.disabled}
            onChange={() => onChange(opt.value)}
          />
          {opt.label}
        </label>
      ))}
    </div>
  );
}
