'use client';

import { useAdminSession } from '../AdminContext';
import { useAdminFetch } from '@/lib/admin/useAdminFetch';
import MetricGrid from '@/components/admin/MetricGrid';

type Snapshot = {
  privacyNote: string;
  meetings: {
    total: number;
    thisWeek: number;
    created30d: number;
    manual: number;
    outlook: number;
    observations: number;
    decisions: number;
    actions: number;
    media: number;
    participants: number;
  };
};

export default function AdminMeetingsPage() {
  const { session } = useAdminSession();
  const { data, loading, error } = useAdminFetch<Snapshot>('/api/admin/product-snapshot', session?.access_token);

  if (loading) return null;

  return (
    <div style={{ marginTop: 'var(--space-4)' }}>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 12 }}>
        Meetings and evidence — counts only. Titles, observation text, and participant names are not loaded.
      </p>
      {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}
      {data && (
        <>
          <MetricGrid
            cells={[
              { label: 'Total recorded', value: String(data.meetings.total) },
              { label: 'This week', value: String(data.meetings.thisWeek) },
              { label: 'Created 30d', value: String(data.meetings.created30d) },
              { label: 'Manual', value: String(data.meetings.manual) },
              { label: 'Outlook-synced', value: String(data.meetings.outlook) },
              { label: 'Observations', value: String(data.meetings.observations) },
              { label: 'Decisions', value: String(data.meetings.decisions) },
              { label: 'Actions', value: String(data.meetings.actions) },
              { label: 'Media items', value: String(data.meetings.media) },
              { label: 'Participants', value: String(data.meetings.participants) },
            ]}
          />
          <p style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 16 }}>{data.privacyNote}</p>
        </>
      )}
    </div>
  );
}
