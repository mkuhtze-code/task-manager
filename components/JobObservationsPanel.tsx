'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import type {
  Meeting,
  MeetingMedia,
  MeetingObservation,
} from '@/lib/meetingTypes';
import { fmtCapturedAt } from '@/lib/meetingCapture';
import { PhotoImage, AudioNote } from '@/components/MediaRender';

type RolledObservation = MeetingObservation & {
  meeting_title: string;
  meeting_id: string;
  media: MeetingMedia[];
};

/**
 * Observations from all meetings on this job.
 *
 * Observations remain meeting evidence, but are surfaced here because
 * the Job is the convergence point for related work.
 *
 * Each observation uses native <details>/<summary> interaction so the
 * desktop surface does not depend on a parent click handler or fragile
 * pointer interaction.
 */
export default function JobObservationsPanel(props: {
  jobId: string;
  userId: string;
  /** When true, start collapsed. */
  defaultCollapsed?: boolean;
}) {
  const {
    jobId,
    userId,
    defaultCollapsed = false,
  } = props;

  const [items, setItems] = useState<RolledObservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const {
      data: meetings,
      error: mErr,
    } = await supabase
      .from('meetings')
      .select('id, text')
      .eq('job_id', jobId)
      .eq('user_id', userId);

    if (mErr) {
      setError(mErr.message);
      setLoading(false);
      return;
    }

    const meetingList =
      (meetings || []) as Pick<Meeting, 'id' | 'text'>[];

    if (meetingList.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }

    const meetingIds = meetingList.map((m) => m.id);

    const titleById = new Map(
      meetingList.map((m) => [
        m.id,
        m.text || 'Meeting',
      ])
    );

    const {
      data: observations,
      error: oErr,
    } = await supabase
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

    const obs =
      (observations || []) as MeetingObservation[];

    const obsIds = obs.map((o) => o.id);

    const mediaByObs = new Map<
      string,
      MeetingMedia[]
    >();

    if (obsIds.length > 0) {
      const { data: media } = await supabase
        .from('meeting_media')
        .select('*')
        .eq('user_id', userId)
        .in('observation_id', obsIds)
        .order('captured_at', { ascending: true });

      for (const row of (media || []) as MeetingMedia[]) {
        if (!row.observation_id) continue;

        const list =
          mediaByObs.get(row.observation_id) || [];

        list.push(row);
        mediaByObs.set(
          row.observation_id,
          list
        );
      }
    }

    setItems(
      obs.map((o) => ({
        ...o,
        meeting_id: o.meeting_id,
        meeting_title:
          titleById.get(o.meeting_id) ||
          'Meeting',
        media:
          mediaByObs.get(o.id) || [],
      }))
    );

    setLoading(false);
  }, [jobId, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  function previewLabel(
    observation: RolledObservation
  ): string {
    if (observation.text?.trim()) {
      return observation.text.trim();
    }

    const photos =
      observation.media.filter(
        (m) => m.media_type === 'photo'
      ).length;

    const audios =
      observation.media.filter(
        (m) => m.media_type === 'audio'
      ).length;

    if (photos > 0) {
      return `${photos} photo${
        photos === 1 ? '' : 's'
      }`;
    }

    if (audios > 0) {
      return 'Voice note';
    }

    return 'Observation';
  }

  return (
    <section
      className="job-observations-panel"
      style={{ marginBottom: 12 }}
    >
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
        onClick={() =>
          setCollapsed((current) => !current)
        }
        aria-expanded={!collapsed}
      >
        <span>
          Observations ·{' '}
          {loading ? '…' : items.length}
        </span>

        <span
          style={{
            fontSize: 12,
            color: 'var(--ink-faint)',
          }}
        >
          {collapsed ? 'Show' : 'Hide'}
        </span>
      </button>

      {!collapsed && (
        <>
          {error && (
            <p className="meeting-capture-error">
              {error}
            </p>
          )}

          {loading && (
            <p
              style={{
                fontSize: 13,
                color: 'var(--ink-soft)',
                marginTop: 8,
              }}
            >
              Loading…
            </p>
          )}

          {!loading && items.length === 0 && (
            <p
              style={{
                fontSize: 13,
                color: 'var(--ink-faint)',
                margin: '8px 0 0',
              }}
            >
              Nothing captured in meetings on
              this job yet.
            </p>
          )}

          {!loading && items.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                marginTop: 8,
              }}
            >
              {items.map((observation) => {
                const photos =
                  observation.media.filter(
                    (m) =>
                      m.media_type === 'photo'
                  );

                const audios =
                  observation.media.filter(
                    (m) =>
                      m.media_type === 'audio'
                  );

                return (
                  <details
                    key={observation.id}
                    className="job-observation-item"
                    style={{
                      border:
                        '1px solid var(--line)',
                      borderRadius:
                        'var(--radius-sm)',
                      background:
                        'var(--paper)',
                      overflow: 'hidden',
                    }}
                  >
                    <summary
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent:
                          'space-between',
                        gap: 12,
                        padding:
                          '10px 12px',
                        cursor: 'pointer',
                        listStyle: 'none',
                        userSelect: 'none',
                      }}
                    >
                      <span
                        style={{
                          minWidth: 0,
                          flex: 1,
                        }}
                      >
                        <span
                          style={{
                            display: 'block',
                            fontSize: 13,
                            lineHeight: 1.4,
                            overflow: 'hidden',
                            textOverflow:
                              'ellipsis',
                            whiteSpace:
                              'nowrap',
                          }}
                        >
                          {previewLabel(
                            observation
                          )}
                        </span>

                        <span
                          style={{
                            display: 'block',
                            marginTop: 3,
                            fontSize: 11,
                            color:
                              'var(--ink-faint)',
                          }}
                        >
                          {observation.meeting_title}
                          {' · '}
                          {fmtCapturedAt(
                            observation.captured_at
                          )}

                          {photos.length > 0 ||
                          audios.length > 0
                            ? ` · ${[
                                photos.length
                                  ? `${photos.length} photo${
                                      photos.length ===
                                      1
                                        ? ''
                                        : 's'
                                    }`
                                  : null,
                                audios.length
                                  ? `${audios.length} audio`
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(
                                  ', '
                                )}`
                            : ''}
                        </span>
                      </span>

                      <span
                        aria-hidden="true"
                        style={{
                          flexShrink: 0,
                          color:
                            'var(--ink-faint)',
                          fontSize: 14,
                        }}
                      >
                        +
                      </span>
                    </summary>

                    <div
                      style={{
                        borderTop:
                          '1px solid var(--line)',
                        padding:
                          '12px',
                      }}
                    >
                      {observation.text?.trim() && (
                        <p
                          style={{
                            fontSize: 14,
                            lineHeight: 1.5,
                            margin:
                              '0 0 12px',
                            color:
                              'var(--ink)',
                          }}
                        >
                          {observation.text.trim()}
                        </p>
                      )}

                      {photos.length > 0 && (
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns:
                              'repeat(auto-fill, minmax(120px, 1fr))',
                            gap: 8,
                            marginBottom:
                              audios.length > 0
                                ? 12
                                : 0,
                          }}
                        >
                          {photos.map((media) => (
                            <figure
                              key={media.id}
                              style={{
                                margin: 0,
                              }}
                            >
                              <div
                                style={{
                                  borderRadius: 8,
                                  overflow:
                                    'hidden',
                                  aspectRatio: '1',
                                  background:
                                    'var(--line)',
                                }}
                              >
                                <PhotoImage
                                  uri={
                                    media.local_uri
                                  }
                                  storagePath={
                                    media.storage_path
                                  }
                                  alt={`Photo from ${observation.meeting_title}`}
                                  className="job-obs-photo"
                                  eager
                                />
                              </div>

                              <figcaption
                                style={{
                                  marginTop: 4,
                                  fontSize: 10,
                                  lineHeight: 1.3,
                                  color:
                                    'var(--ink-faint)',
                                }}
                              >
                                {
                                  observation.meeting_title
                                }
                              </figcaption>
                            </figure>
                          ))}
                        </div>
                      )}

                      {audios.map((media) => (
                        <div
                          key={media.id}
                          style={{
                            marginTop: 8,
                          }}
                        >
                          <AudioNote
                            uri={
                              media.local_uri
                            }
                            storagePath={
                              media.storage_path
                            }
                            className="media-audio"
                          />

                          <div
                            style={{
                              marginTop: 3,
                              fontSize: 10,
                              color:
                                'var(--ink-faint)',
                            }}
                          >
                            {
                              observation.meeting_title
                            }
                          </div>
                        </div>
                      ))}

                      <div
                        style={{
                          display: 'flex',
                          alignItems:
                            'center',
                          justifyContent:
                            'space-between',
                          gap: 10,
                          marginTop: 12,
                          paddingTop: 10,
                          borderTop:
                            '1px solid var(--line)',
                        }}
                      >
                        <span
                          style={{
                            fontSize: 11,
                            color:
                              'var(--ink-faint)',
                          }}
                        >
                          From meeting ·{' '}
                          {
                            observation.meeting_title
                          }
                        </span>

                        <Link
                          href={`/meetings/${observation.meeting_id}`}
                          className="meeting-pill meeting-pill--quiet"
                          onClick={(event) =>
                            event.stopPropagation()
                          }
                        >
                          Open meeting
                        </Link>
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}
