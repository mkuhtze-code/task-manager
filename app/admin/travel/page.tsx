'use client';

import { useAdminSession } from '../AdminContext';
import { useAdminFetch } from '@/lib/admin/useAdminFetch';
import SimpleMetricGrid from '@/components/admin/SimpleMetricGrid';

type Snapshot = {
  privacyNote: string;
  travel: {
    tripsTotal: number;
    trips30d: number;
    tripsActive: number;
    tripDays: number;
    activitiesTotal: number;
    activitiesDone: number;
    accommodationsTotal: number;
  };
};

export default function AdminTravelPage() {
  const { session } = useAdminSession();
  const { data, loading, error } = useAdminFetch<Snapshot>('/api/admin/product-snapshot', session?.access_token);

  if (loading) return null;

  return (
    <div style={{ marginTop: 'var(--space-4)' }}>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 12 }}>
        Travel surface — trip and activity counts. No destinations, names, or notes.
      </p>
      {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}
      {data && (
        <>
          <SimpleMetricGrid
            cells={[
              { label: 'Trips', value: String(data.travel.tripsTotal) },
              { label: 'Active now', value: String(data.travel.tripsActive) },
              { label: 'Created 30d', value: String(data.travel.trips30d) },
              { label: 'Trip days', value: String(data.travel.tripDays) },
              { label: 'Activities', value: String(data.travel.activitiesTotal) },
              { label: 'Activities done', value: String(data.travel.activitiesDone) },
              { label: 'Accommodations', value: String(data.travel.accommodationsTotal) },
            ]}
          />
          <p style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 16 }}>{data.privacyNote}</p>
        </>
      )}
    </div>
  );
}
