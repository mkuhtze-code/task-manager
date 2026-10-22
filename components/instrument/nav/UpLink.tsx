'use client';

import Link from 'next/link';

export type UpLinkProps = { href: string; label: string };

/** Explicit parent navigation. Label names the destination, never browser history. */
export default function UpLink({ href, label }: UpLinkProps) {
  return (
    <Link href={href} className="ins-nav-up" aria-label={label} data-instrument-nav="up">
      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">
        <path d="M12.5 3.5 6 10l6.5 6.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>{label}</span>
    </Link>
  );
}
