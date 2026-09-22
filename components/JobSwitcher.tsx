'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Job } from '@/lib/jobTypes';

/**
 * Compact job picker for mobile job detail — switch jobs without
 * returning to the list. World-class mobile pattern: title is the menu.
 */
export default function JobSwitcher(props: {
  current: Job;
  jobs: Job[];
}) {
  const { current, jobs } = props;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const others = jobs.filter((j) => j.id !== current.id);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="job-switcher" ref={wrapRef}>
      <button
        type="button"
        className="job-switcher-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="job-switcher-name">{current.name}</span>
        <svg
          className={open ? 'job-switcher-chev is-open' : 'job-switcher-chev'}
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M6 9l6 6 6-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div className="job-switcher-menu" role="listbox" aria-label="Switch job">
          <div className="job-switcher-current" role="option" aria-selected="true">
            <span className="job-switcher-check" aria-hidden="true">
              ✓
            </span>
            <span className="job-switcher-item-name">{current.name}</span>
            {current.client && (
              <span className="job-switcher-item-meta">{current.client}</span>
            )}
          </div>

          {others.length > 0 && <div className="job-switcher-sep" />}

          {others.slice(0, 12).map((j) => (
            <button
              key={j.id}
              type="button"
              role="option"
              className="job-switcher-item"
              onClick={() => {
                setOpen(false);
                router.push(`/jobs/${j.id}`);
              }}
            >
              <span className="job-switcher-item-name">{j.name}</span>
              {j.client && <span className="job-switcher-item-meta">{j.client}</span>}
            </button>
          ))}

          <div className="job-switcher-sep" />
          <button
            type="button"
            className="job-switcher-item job-switcher-all"
            onClick={() => {
              setOpen(false);
              router.push('/jobs');
            }}
          >
            All jobs
          </button>
        </div>
      )}
    </div>
  );
}
