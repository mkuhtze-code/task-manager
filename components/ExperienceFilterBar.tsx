'use client';

type ExperienceFilterOption<Key extends string> = {
  key: Key;
  label: string;
  count?: number;
};

type ExperienceFilterBarProps<Key extends string> = {
  ariaLabel: string;
  value: Key;
  onChange: (value: Key) => void;
  options: readonly ExperienceFilterOption<Key>[];
  className?: string;
};

/** One mobile filter control for every workspace; only its options differ. */
export function ExperienceFilterBar<Key extends string>({
  ariaLabel,
  value,
  onChange,
  options,
  className,
}: ExperienceFilterBarProps<Key>) {
  const classes = ['experience-filter-bar', className].filter(Boolean).join(' ');

  return (
    <div className={classes} role="tablist" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          role="tab"
          aria-selected={value === option.key}
          className={value === option.key ? 'segmented-btn active' : 'segmented-btn'}
          onClick={() => onChange(option.key)}
        >
          {option.label}
          {option.count !== undefined ? (
            <span className="experience-filter-bar__count">{option.count}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
