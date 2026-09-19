'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiUrl } from '@/lib/authedFetch';

/** Shared authenticated GET for Admin pages. */
export function useAdminFetch<T>(path: string, accessToken: string | undefined) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(apiUrl(path), {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || `Request failed (${res.status})`);
      }
      setData(payload as T);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [path, accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load };
}
