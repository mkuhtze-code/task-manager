'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

/** Temporary restore in progress — loading full Job detail from artifact. */
export default function JobDetailPage() {
  const router = useRouter();
  const params = useParams<{ jobId: string }>();
  const jobId = params?.jobId;

  useEffect(() => {
    // Keep route alive; full page content follows in next commit
    if (!jobId) router.replace('/jobs');
  }, [jobId, router]);

  return (
    <div className="app-shell" style={{ padding: 24 }}>
      <p>Restoring job detail…</p>
      <p className="settings-help">If this persists, pull latest main.</p>
    </div>
  );
}
