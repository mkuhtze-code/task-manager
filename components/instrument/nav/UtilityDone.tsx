'use client';

import Link from 'next/link';

export default function UtilityDone({ href = '/', label = 'Done' }: { href?: string; label?: string }) {
  return (
    <Link href={href} className="ins-nav-done" aria-label={label} data-instrument-nav="done">
      {label}
    </Link>
  );
}
