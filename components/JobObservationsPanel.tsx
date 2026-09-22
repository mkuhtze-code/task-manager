'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import type { Meeting, MeetingObservation } from '@/lib/meetingTypes';
import { fmtCapturedAt } from '@/lib/meetingCapture';

type RolledObservation = MeetingObservation & {
  meeting_title: string;
  meeting_id: string;
  photo_count: number;
  audio_count: number;
};

/**
 * All observations from meetings linked to this job — central job view of
 * meeting evidence without duplicating rows (still owned by each meeting).
 */
export default function JobObservationsPanel(props: {
  jobId: string;
  userId: string;
}) {
  const { jobId, userId } = props;
  const [items, setItems] = useState<RolledObservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data: meetings, error: mErr } = await supabase
      .from('meetings')
      .select('id, text')
      .eq('job_id', jobId)
      .eq('user_id', userId);

    if (mErr) {
      setError(mErr.message);
      setLoading(false);
      return;
    }

    const meetingList = (meetings || []) as Pick<Meeting, 'id' | 'text'>[];
    if (meetingList.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }

    const meetingIds = meetingList.map((m) => m.id);
    const titleById = new Map(meetingList.map((m) => [m.id, m.text || 'Meeting']));

    const { data: observations, error: oErr } = await supabase
      .from('meeting_observations')
      .select('*')
      .eq('user_id', userId)
      .in('meeting_id', meetingIds)
      .order('captured_at', { ascending: false });

    if (oErr) {
      setError(oErr.message);
      setLoading(false);
      return;
    }

    const obs = (observations || []) as MeetingObservation[];
    const obsIds = obs.map((o) => o.id);

    let mediaRows: { observation_id: string | null; media_type: string }[] = [];
    if (obsIds.length > 0) {
      const { data: media } = await supabase
        .from('meeting_media')
        .select('observation_id, media_type')
        .eq('user_id', userId)
        .in('observation_id', obsIds);
      mediaRows = (media || []) as { observation_id: string | null; media_type: string }[];
    }

    const counts = new Map<string, { photo: number; audio: number }>();
    for (const m of mediaRows) {
      if (!m.observation_id) continue;
      const cur = counts.get(m.observation_id) || { photo: 0, audio: 0 };
      if (m.media_type === 'photo') cur.photo += 1;
      if (m.media_type === 'audio') cur.audio += 1;
      counts.set(m.observation_id, cur);
    }

    setItems(
      obs.map((o) => {
        const c = counts.get(o.id) || { photo: 0, audio: 0 };
        return {
          ...o,
          meeting_id: o.meeting_id,
          meeting_title: titleById.get(o.meeting_id) || 'Meeting',
          photo_count: c.photo,
          audio_count: c.audio,
        };
      })
    );
    setLoading(false);
  }, [jobId, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="job-observations-panel" style={{ marginBottom: 16 }}>
      <div className="job-group-label">Observations · {items.length}</div>
      <p style={{ fontSize: 12, color: 'var(--ink-soft)', margin: '0 0 10px', lineHeight: 1.4 }}>
        From all meetings on this job. Each observation still lives on its meeting.
      </p>

      {error && <p className="meeting-capture-error">{error}</p>}
      {loading && <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Loading observations…</p>}

      {!loading && items.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--ink-faint)', margin: 0 }}>
          No observations yet. Capture them in a meeting linked to this job.
        </p>
      )}

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((o) => (
          <li key={o.id}>
            <Link
              href={`/meetings/${o.meeting_id}`}
              style={{
                display: 'block',
                padding: '10px 12px',
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--paper)',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              {o.text?.trim() ? (
                <div style={{ fontSize: 13, lineHeight: 1.4, marginBottom: 4 }}>{o.text.trim()}</div>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 4 }}>
                  {o.photo_count > 0
                    ? `${o.photo_count} photo${o.photo_count === 1 ? '' : 's'}`
                    : o.audio_count > 0
                      ? 'Voice note'
                      : 'Observation'}
                </div>
              )}
              <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>
                {o.meeting_title}
                {' · '}
                {fmtCapturedAt(o.captured_at)}
                {(o.photo_count > 0 || o.audio_count > 0) && (
                  <>
                    {' · '}
                    {[o.photo_count > 0 ? `${o.photo_count} photo` : null, o.audio_count > 0 ? `${o.audio_count} audio` : null]
                      .filter(Boolean)
                      .join(', ')}
                  </>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
