'use client';

import Link from 'next/link';

type ContextItem = {
  label: string;
  href?: string;
  current?: boolean;
};

export default function ContextLine({
  items,
  className = '',
  label = 'Context',
}: {
  items: ContextItem[];
  className?: string;
  label?: string;
}) {
  const visible = items.filter((item) => item.label.trim().length > 0);
  if (!visible.length) return null;

  return (
    <div className={`context-line ${className}`} aria-label={label}>
      {visible.map((item, index) => (
        <span className="context-line-item" key={`${item.label}-${index}`}>
          {index > 0 ? <span className="context-line-separator" aria-hidden="true">·</span> : null}
          {item.href && !item.current ? (
            <Link href={item.href} className="context-line-link" onClick={(e) => e.stopPropagation()}>
              {item.label}
            </Link>
          ) : (
            <span className={item.current ? 'context-line-current' : undefined}>{item.label}</span>
          )}
        </span>
      ))}
    </div>
  );
}
