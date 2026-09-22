'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { Meeting, MeetingMedia, MeetingObservation } from '@/lib/meetingTypes';
import { fmtCapturedAt } from '@/lib/meetingCapture';
import { PhotoImage, AudioNote } from '@/components/MediaRender';

type RolledObservation = MeetingObservation & {
  meeting_title: string;
  meeting_id: string;
  media: MeetingMedia[];
};

/**
 * Observations from all meetings on this job, viewed in-place on the Job
 * (no navigation away). Meeting attribution stays as metadata on each item.
 */
export default function JobObservationsPanel(props: {
  jobId: string;
  userId: string;
  /** When true, start collapsed (mobile library). */
  defaultCollapsed?: boolean;
}) {
  const { jobId, userId, defaultCollapsed = false } = props;
  const [items, setItems] = useState<RolledObservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

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

    const mediaByObs = new Map<string, MeetingMedia[]>();
    if (obsIds.length > 0) {
      const { data: media } = await supabase
        .from('meeting_media')
        .select('*')
        .eq('user_id', userId)
        .in('observation_id', obsIds)
        .order('captured_at', { ascending: true });

      for (const row of (media || []) as MeetingMedia[]) {
        if (!row.observation_id) continue;
        const list = mediaByObs.get(row.observation_id) || [];
        list.push(row);
        mediaByObs.set(row.observation_id, list);
      }
    }

    setItems(
      obs.map((o) => ({
        ...o,
        meeting_id: o.meeting_id,
        meeting_title: titleById.get(o.meeting_id) || 'Meeting',
        media: mediaByObs.get(o.id) || [],
      }))
    );
    setLoading(false);
  }, [jobId, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  function previewLabel(o: RolledObservation): string {
    if (o.text?.trim()) return o.text.trim();
    const photos = o.media.filter((m) => m.media_type === 'photo').length;
    const audios = o.media.filter((m) => m.media_type === 'audio').length;
    if (photos > 0) return `${photos} photo${photos === 1 ? '' : 's'}`;
    if (audios > 0) return 'Voice note';
    return 'Observation';
  }

  return (
    <section className="job-observations-panel" style={{ marginBottom: 12 }}>
      <button
        type="button"
        className="job-group-label"
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          width: '100%',
          textAlign: 'left',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
      >
        <span>Observations · {loading ? '…' : items.length}</span>
        <span style={{ fontSize: 12, color: 'var(--ink-faint)' }}>{collapsed ? 'Show' : 'Hide'}</span>
      </button>

      {!collapsed && (
        <>
          {error && <p className="meeting-capture-error">{error}</p>}
          {loading && (
            <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 8 }}>Loading…</p>
          )}

          {!loading && items.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--ink-faint)', margin: '8px 0 0' }}>
              Nothing captured in meetings on this job yet.
            </p>
          )}

          <ul
            style={{
              listStyle: 'none',
              margin: '8px 0 0',
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {items.map((o) => {
              const isOpen = openId === o.id;
              const photos = o.media.filter((m) => m.media_type === 'photo');
              const audios = o.media.filter((m) => m.media_type === 'audio');
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(isOpen ? null : o.id)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '10px 12px',
                      border: '1px solid var(--line)',
                      borderRadius: 'var(--radius-sm)',
                      background: isOpen ? 'var(--paper-2, rgba(0,0,0,0.03))' : 'var(--paper)',
                      cursor: 'pointer',
                      color: 'inherit',
                      font: 'inherit',
                    }}
                    aria-expanded={isOpen}
                  >
                    <div style={{ fontSize: 13, lineHeight: 1.4, marginBottom: 4 }}>
                      {previewLabel(o)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>
                      {o.meeting_title} · {fmtCapturedAt(o.captured_at)}
                      {photos.length > 0 || audios.length > 0
                        ? ` · ${[
                            photos.length ? `${photos.length} photo` : null,
                            audios.length ? `${audios.length} audio` : null,
                          ]
                            .filter(Boolean)
                            .join(', ')}`
                        : ''}
                    </div>
                  </button>

                  {isOpen && (
                    <div
                      style={{
                        border: '1px solid var(--line)',
                        borderTop: 'none',
                        borderRadius: '0 0 var(--radius-sm) var(--radius-sm)',
                        padding: '10px 12px 12px',
                        background: 'var(--paper)',
                      }}
                    >
                      {o.text?.trim() && (
                        <p style={{ fontSize: 14, lineHeight: 1.45, margin: '0 0 10px' }}>
                          {o.text.trim()}
                        </p>
                      )}

                      {photos.length > 0 && (
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                            gap: 8,
                            marginBottom: audios.length > 0 ? 10 : 0,
                          }}
                        >
                          {photos.map((m) => (
                            <figure key={m.id} style={{ margin: 0, position: 'relative' }}>
                              <div
                                style={{
                                  borderRadius: 8,
                                  overflow: 'hidden',
                                  aspectRatio: '1',
                                  background: 'var(--line)',
                                }}
                              >
                                <PhotoImage
                                  uri={m.local_uri}
                                  storagePath={m.storage_path}
                                  alt={`Photo from ${o.meeting_title}`}
                                  className="job-obs-photo"
                                  eager
                                />
                              </div>
                              <figcaption
                                style={{
                                  fontSize: 10,
                                  color: 'var(--ink-faint)',
                                  marginTop: 4,
                                  lineHeight: 1.3,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                                title={o.meeting_title}
                              >
                                {o.meeting_title}
                              </figcaption>
                            </figure>
                          ))}
                        </div>
                      )}

                      {audios.map((m) => (
                        <div key={m.id} style={{ marginTop: 8 }}>
                          <AudioNote
                            uri={m.local_uri}
                            storagePath={m.storage_path}
                            className="media-audio"
                          />
                          <div style={{ fontSize: 10, color: 'var(--ink-faint)', marginTop: 2 }}>
                            {o.meeting_title}
                          </div>
                        </div>
                      ))}

                      <p style={{ fontSize: 11, color: 'var(--ink-faint)', margin: '10px 0 0' }}>
                        From meeting · {o.meeting_title}
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
