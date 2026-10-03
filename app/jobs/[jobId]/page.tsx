'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Temporary stub — full Job detail page restore in progress. */
export default function JobDetailPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/jobs');
  }, [router]);
  return (
    <div className="app-shell" style={{ padding: 24 }}>
      <p>Loading job…</p>
    </div>
  );
}
