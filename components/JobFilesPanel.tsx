'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { JobFolder, JobMedia } from '@/lib/jobMediaTypes';
import { jobMediaDisplayName } from '@/lib/jobMediaTypes';
import { useDeviceFileCapture, type CapturedFile } from '@/hooks/useDeviceFileCapture';
import { useSurfaceMode } from '@/hooks/useSurfaceMode';
import { syncJobMediaToCloud, deleteCloudMedia, resolveMediaBlob } from '@/lib/mediaCloud';
import { deleteMediaBlob } from '@/lib/mediaStore';
import { buildStorageQuota, formatStorageBytes, wouldExceedQuota } from '@/lib/storageQuota';
import { PhotoImage } from '@/components/MediaRender';

const UNFILED = '__unfiled__';

/**
 * Job-centric files with optional folders (Plans, Orders, …).
 * Meetings and Jobs both add here when a job is known.
 */
export default function JobFilesPanel(props: {
  jobId: string;
  userId: string;
  variant?: 'job' | 'meeting';
}) {
  const { jobId, userId, variant = 'job' } = props;
  const { isDesktop } = useSurfaceMode();
  const capture = useDeviceFileCapture();
  const [folders, setFolders] = useState<JobFolder[]>([]);
  const [files, setFiles] = useState<JobMedia[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null); // null = all, UNFILED = unfiled
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  /** Folder used for the next upload (defaults to active folder if a real folder). */
  const [uploadFolderId, setUploadFolderId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [foldersRes, filesRes] = await Promise.all([
      supabase
        .from('job_folders')
        .select('*')
        .eq('job_id', jobId)
        .eq('user_id', userId)
        .order('name', { ascending: true }),
      supabase
        .from('job_media')
        .select('*')
        .eq('job_id', jobId)
        .eq('user_id', userId)
        .order('captured_at', { ascending: false }),
    ]);

    if (foldersRes.error) setError(foldersRes.error.message);
    else setFolders((foldersRes.data as JobFolder[]) || []);

    if (filesRes.error) setError(filesRes.error.message);
    else setFiles((filesRes.data as JobMedia[]) || []);

    setLoading(false);
  }, [jobId, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleFiles = useMemo(() => {
    if (activeFolderId === null) return files;
    if (activeFolderId === UNFILED) return files.filter((f) => !f.folder_id);
    return files.filter((f) => f.folder_id === activeFolderId);
  }, [files, activeFolderId]);

  function countInFolder(folderId: string | null) {
    if (folderId === null) return files.length;
    if (folderId === UNFILED) return files.filter((f) => !f.folder_id).length;
    return files.filter((f) => f.folder_id === folderId).length;
  }

  async function createFolder() {
    const name = newFolderName.replace(/\s+/g, ' ').trim();
    if (!name) return;
    setSaving(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('job_folders')
      .insert({ user_id: userId, job_id: jobId, name })
      .select('*')
      .single();
    setSaving(false);
    if (err || !data) {
      setError(err?.message || 'Could not create folder');
      return;
    }
    setFolders((prev) => [...prev, data as JobFolder].sort((a, b) => a.name.localeCompare(b.name)));
    setNewFolderName('');
    setNewFolderOpen(false);
    setActiveFolderId(data.id);
    setUploadFolderId(data.id);
  }

  async function deleteFolder(folder: JobFolder) {
    if (!window.confirm(`Delete folder “${folder.name}”? Files move to Unfiled.`)) return;
    const { error: err } = await supabase
      .from('job_folders')
      .delete()
      .eq('id', folder.id)
      .eq('user_id', userId);
    if (err) {
      setError(err.message);
      return;
    }
    setFolders((prev) => prev.filter((f) => f.id !== folder.id));
    setFiles((prev) =>
      prev.map((f) => (f.folder_id === folder.id ? { ...f, folder_id: null } : f))
    );
    if (activeFolderId === folder.id) setActiveFolderId(null);
    if (uploadFolderId === folder.id) setUploadFolderId(null);
  }

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

    let folderId: string | null = uploadFolderId;
    if (activeFolderId && activeFolderId !== UNFILED && !uploadFolderId) {
      folderId = activeFolderId;
    }

    const { data: row, error: insErr } = await supabase
      .from('job_media')
      .insert({
        user_id: userId,
        job_id: jobId,
        folder_id: folderId,
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
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  const dropProps = isDesktop ? capture.bindDropTarget((m) => void addCaptured(m)) : {};

  return (
    <section
      className={variant === 'meeting' ? 'job-files-panel job-files-panel--meeting' : 'job-files-panel'}
      style={{ marginBottom: variant === 'job' ? 16 : 12 }}
      {...dropProps}
    >
      <div
        className="job-group-label"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
      >
        <span>
          {variant === 'meeting' ? 'Job files' : 'Files'} · {files.length}
        </span>
        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="meeting-pill"
            disabled={saving}
            onClick={() => setNewFolderOpen((v) => !v)}
          >
            New folder
          </button>
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
          Files belong to this job — use folders (Plans, Orders, …) to organise. Meeting observations
          stay on the meeting.
        </p>
      )}

      {newFolderOpen && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="e.g. Plans, Orders"
            style={{
              flex: 1,
              minWidth: 140,
              border: '1px solid var(--line-strong)',
              borderRadius: 'var(--radius-sm)',
              padding: '8px 10px',
              fontSize: 14,
              background: 'var(--paper)',
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void createFolder();
            }}
          />
          <button
            type="button"
            className="meeting-pill meeting-pill--primary"
            disabled={saving || !newFolderName.trim()}
            onClick={() => void createFolder()}
          >
            Create
          </button>
          <button type="button" className="meeting-pill" onClick={() => setNewFolderOpen(false)}>
            Cancel
          </button>
        </div>
      )}

      {/* Folder chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        <button
          type="button"
          className={activeFolderId === null ? 'meeting-pill meeting-pill--primary' : 'meeting-pill'}
          onClick={() => {
            setActiveFolderId(null);
            setUploadFolderId(null);
          }}
        >
          All ({countInFolder(null)})
        </button>
        <button
          type="button"
          className={activeFolderId === UNFILED ? 'meeting-pill meeting-pill--primary' : 'meeting-pill'}
          onClick={() => {
            setActiveFolderId(UNFILED);
            setUploadFolderId(null);
          }}
        >
          Unfiled ({countInFolder(UNFILED)})
        </button>
        {folders.map((folder) => (
          <span key={folder.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
            <button
              type="button"
              className={
                activeFolderId === folder.id ? 'meeting-pill meeting-pill--primary' : 'meeting-pill'
              }
              onClick={() => {
                setActiveFolderId(folder.id);
                setUploadFolderId(folder.id);
              }}
            >
              {folder.name} ({countInFolder(folder.id)})
            </button>
            <button
              type="button"
              className="meeting-pill meeting-pill--quiet"
              aria-label={`Delete folder ${folder.name}`}
              onClick={() => void deleteFolder(folder)}
              style={{ padding: '4px 8px' }}
            >
              ×
            </button>
          </span>
        ))}
      </div>

      {folders.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 8 }}>
          New uploads go to:{' '}
          <strong>
            {uploadFolderId
              ? folders.find((f) => f.id === uploadFolderId)?.name || 'Folder'
              : 'Unfiled'}
          </strong>
          {folders.length > 0 && (
            <select
              value={uploadFolderId || ''}
              onChange={(e) => setUploadFolderId(e.target.value || null)}
              style={{ marginLeft: 8, fontSize: 12 }}
            >
              <option value="">Unfiled</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          )}
        </div>
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
          Drag and drop into{' '}
          {uploadFolderId
            ? folders.find((f) => f.id === uploadFolderId)?.name || 'folder'
            : 'Unfiled'}
        </div>
      )}

      {(error || capture.error) && (
        <p className="meeting-capture-error" style={{ marginBottom: 8 }}>
          {error || capture.error}
        </p>
      )}

      {loading && <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Loading files…</p>}

      {!loading && visibleFiles.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--ink-faint)', margin: 0 }}>
          {activeFolderId && activeFolderId !== UNFILED
            ? 'This folder is empty — upload a file here.'
            : isDesktop
              ? 'No files yet — drop a file or use Upload.'
              : 'No files yet — add a photo or document for this job.'}
        </p>
      )}

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {visibleFiles.map((m) => (
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
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {jobMediaDisplayName(m)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>
                {m.size_bytes != null ? formatStorageBytes(m.size_bytes) : '—'}
                {m.folder_id
                  ? ` · ${folders.find((f) => f.id === m.folder_id)?.name || 'Folder'}`
                  : ' · Unfiled'}
                {m.sync_status === 'synced'
                  ? ' · synced'
                  : m.sync_status === 'failed'
                    ? ' · sync failed'
                    : ' · syncing…'}
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

      <input
        ref={capture.photoRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={capture.onPhotoChange}
      />
      <input
        ref={capture.fileRef}
        type="file"
        accept="image/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,application/pdf"
        style={{ display: 'none' }}
        onChange={capture.onFileChange}
      />
    </section>
  );
}
