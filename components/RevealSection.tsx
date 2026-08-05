'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Wraps a <section> and adds an `is-visible` class the first time it
 * scrolls into view. CSS in welcome.css does the actual animating —
 * this component's only job is the visibility trigger.
 *
 * Uses IntersectionObserver directly rather than CSS animation-timeline,
 * since scroll-driven CSS animations aren't reliably supported across
 * browsers yet. This works everywhere.
 */
export default function RevealSection({
  children,
  className = '',
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -10% 0px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={ref as React.RefObject<HTMLElement>}
      id={id}
      className={`${className}${visible ? ' is-visible' : ''}`}
    >
      {children}
    </section>
  );
}
