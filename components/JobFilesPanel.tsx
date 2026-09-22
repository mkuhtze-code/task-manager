'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { JobMedia } from '@/lib/jobMediaTypes';
import { jobMediaDisplayName } from '@/lib/jobMediaTypes';
import { useDeviceFileCapture, type CapturedFile } from '@/hooks/useDeviceFileCapture';
import { useSurfaceMode } from '@/hooks/useSurfaceMode';
import { syncJobMediaToCloud, deleteCloudMedia, resolveMediaBlob } from '@/lib/mediaCloud';
import { deleteMediaBlob } from '@/lib/mediaStore';
import { buildStorageQuota, formatStorageBytes, wouldExceedQuota } from '@/lib/storageQuota';
import { PhotoImage } from '@/components/MediaRender';

/**
 * Job-centric files. Meetings and Jobs both add here when a job is known.
 * Observations stay on the meeting; documents live on the job.
 */
export default function JobFilesPanel(props: {
  jobId: string;
  userId: string;
  /** Compact strip for meeting context vs full section on job page */
  variant?: 'job' | 'meeting';
}) {
  const { jobId, userId, variant = 'job' } = props;
  const { isDesktop } = useSurfaceMode();
  const capture = useDeviceFileCapture();
  const [files, setFiles] = useState<JobMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('job_media')
      .select('*')
      .eq('job_id', jobId)
      .eq('user_id', userId)
      .order('captured_at', { ascending: false });
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    setFiles((data as JobMedia[]) || []);
    setLoading(false);
  }, [jobId, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addCaptured(m: CapturedFile) {
    setSaving(true);
    setError(null);

    const { data: settings } = await supabase
      .from('user_settings')
      .select('storage_used_bytes, storage_limit_bytes')
      .eq('user_id', userId)
      .maybeSingle();
    const quota = buildStorageQuota(
      Number(settings?.storage_used_bytes ?? 0),
      Number(settings?.storage_limit_bytes ?? 0)
    );
    if (wouldExceedQuota(quota, m.size || 0)) {
      setError('Storage is full. Free space in Account before adding more files.');
      setSaving(false);
      return;
    }

    const { data: row, error: insErr } = await supabase
      .from('job_media')
      .insert({
        user_id: userId,
        job_id: jobId,
        media_type: m.mediaType,
        local_uri: m.uri,
        mime_type: m.mime,
        size_bytes: m.size,
        original_name: m.originalName ?? null,
        caption: null,
        sync_status: 'local_only',
        captured_at: m.capturedAt,
      })
      .select('*')
      .single();

    if (insErr || !row) {
      setError(insErr?.message || 'Could not save file');
      setSaving(false);
      return;
    }

    void syncJobMediaToCloud({
      userId,
      jobId,
      mediaId: row.id,
      localUri: m.uri,
      mimeType: m.mime,
    }).then(() => load());

    setFiles((prev) => [row as JobMedia, ...prev]);
    setSaving(false);
  }

  async function removeFile(m: JobMedia) {
    setError(null);
    const { error: delErr } = await supabase
      .from('job_media')
      .delete()
      .eq('id', m.id)
      .eq('user_id', userId);
    if (delErr) {
      setError(delErr.message);
      return;
    }
    if (m.local_uri) void deleteMediaBlob(m.local_uri);
    if (m.storage_path) void deleteCloudMedia(m.storage_path);
    setFiles((prev) => prev.filter((x) => x.id !== m.id));
  }

  async function openFile(m: JobMedia) {
    const blob = await resolveMediaBlob(m.local_uri, m.storage_path);
    if (!blob) {
      setError('File unavailable on this device yet — try again in a moment.');
      return;
    }
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    // Revoke after a delay so the tab can load.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  const dropProps = isDesktop ? capture.bindDropTarget((m) => void addCaptured(m)) : {};

  return (
    <section
      className={variant === 'meeting' ? 'job-files-panel job-files-panel--meeting' : 'job-files-panel'}
      style={{ marginBottom: variant === 'job' ? 16 : 12 }}
      {...dropProps}
    >
      <div className="job-group-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span>
          {variant === 'meeting' ? 'Job files' : 'Files'} · {files.length}
        </span>
        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {!isDesktop && (
            <button
              type="button"
              className="meeting-pill"
              disabled={saving || capture.busy}
              onClick={() => capture.pickPhoto((m) => void addCaptured(m))}
            >
              Photo
            </button>
          )}
          <button
            type="button"
            className="meeting-pill"
            disabled={saving || capture.busy}
            onClick={() => capture.pickFile((m) => void addCaptured(m))}
          >
            {isDesktop ? 'Upload file' : 'File'}
          </button>
        </span>
      </div>

      {variant === 'meeting' && (
        <p style={{ fontSize: 12, color: 'var(--ink-soft)', margin: '0 0 8px', lineHeight: 1.4 }}>
          Files belong to this job — visible from the job and any meeting linked to it. Meeting
          observations stay separate.
        </p>
      )}

      {isDesktop && (
        <div
          className={capture.dragOver ? 'job-files-drop is-dragover' : 'job-files-drop'}
          style={{
            border: '1px dashed var(--line-strong)',
            borderRadius: 'var(--radius-sm)',
            padding: '16px 12px',
            textAlign: 'center',
            fontSize: 13,
            color: 'var(--ink-soft)',
            marginBottom: 10,
            background: capture.dragOver ? 'var(--paper-2, rgba(0,0,0,0.03))' : 'transparent',
          }}
        >
          Drag and drop a PDF, photo, or document here
        </div>
      )}

      {(error || capture.error) && (
        <p className="meeting-capture-error" style={{ marginBottom: 8 }}>
          {error || capture.error}
        </p>
      )}

      {loading && <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Loading files…</p>}

      {!loading && files.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--ink-faint)', margin: 0 }}>
          {isDesktop
            ? 'No files yet — drop a file or use Upload.'
            : 'No files yet — add a photo or document for this job.'}
        </p>
      )}

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {files.map((m) => (
          <li
            key={m.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 10px',
              border: '1px solid var(--line)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--paper)',
            }}
          >
            {m.media_type === 'photo' ? (
              <div style={{ width: 44, height: 44, borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
                <PhotoImage
                  uri={m.local_uri || ''}
                  storagePath={m.storage_path}
                  alt=""
                  className="job-file-thumb"
                />
              </div>
            ) : (
              <span
                style={{
                  width: 44,
                  height: 44,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--ink-soft)',
                  background: 'var(--line)',
                  borderRadius: 6,
                  flexShrink: 0,
                }}
              >
                {m.mime_type?.includes('pdf') ? 'PDF' : m.media_type === 'audio' ? 'AUD' : 'FILE'}
              </span>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {jobMediaDisplayName(m)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>
                {m.size_bytes != null ? formatStorageBytes(m.size_bytes) : '—'}
                {m.sync_status === 'synced' ? ' · synced' : m.sync_status === 'failed' ? ' · sync failed' : ' · syncing…'}
              </div>
            </div>
            <button type="button" className="meeting-pill meeting-pill--quiet" onClick={() => void openFile(m)}>
              Open
            </button>
            <button type="button" className="meeting-pill meeting-pill--quiet" onClick={() => void removeFile(m)}>
              Remove
            </button>
          </li>
        ))}
      </ul>

      {capture.hiddenInputs}
    </section>
  );
}
