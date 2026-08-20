'use client';

import { useEffect, useState } from 'react';
import type { Job } from '@/lib/jobTypes';
import LocationAutocomplete from '@/components/LocationAutocomplete';
import { CloseIcon, TrashIcon } from '@/components/icons';

// New Job / Edit Job — one quiet sheet, two modes. A Job is only its name
// plus optional client and location; nothing else lives on it. Everything
// else a Job shows is derived from its Tasks.

type JobForm = {
  name: string;
  client: string;
  locationText: string;
  coords: { lat: number; lng: number } | null;
};

function useJobForm(job: Job | null): { form: JobForm; setForm: React.Dispatch<React.SetStateAction<JobForm>> } {
  const [form, setForm] = useState<JobForm>({
    name: job?.name || '',
    client: job?.client || '',
    locationText: job?.location_text || '',
    coords: job?.lat != null && job?.lng != null ? { lat: job.lat, lng: job.lng } : null,
  });

  useEffect(() => {
    setForm({
      name: job?.name || '',
      client: job?.client || '',
      locationText: job?.location_text || '',
      coords: job?.lat != null && job?.lng != null ? { lat: job.lat, lng: job.lng } : null,
    });
  }, [job?.id]);

  return { form, setForm };
}

export function NewJobSheet(props: {
  saving: boolean;
  onClose: () => void;
  onCreate: (name: string, client: string, locationText: string, lat: number | null, lng: number | null) => void;
}) {
  const { saving, onClose, onCreate } = props;
  const { form, setForm } = useJobForm(null);
  const [error, setError] = useState('');

  function submit() {
    const trimmed = form.name.trim();
    if (trimmed.length === 0) {
      setError('Give the job a name');
      return;
    }
    setError('');
    onCreate(trimmed, form.client.trim(), form.locationText.trim(), form.coords?.lat ?? null, form.coords?.lng ?? null);
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="capture-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="task-detail-header" style={{ marginBottom: 0 }}>
          <div className="settings-panel-title">New job</div>
          <button className="gear-btn" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          placeholder="Job name (e.g. Replace warehouse roof)"
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="settings-label">Client (optional)</span>
          <input
            type="text"
            value={form.client}
            onChange={(e) => setForm((f) => ({ ...f, client: e.target.value }))}
            placeholder="e.g. Acme Roofing"
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="settings-label">Location (optional)</span>
          <LocationAutocomplete
            value={form.locationText}
            placeholder="Where is the work?"
            onChange={(text) => setForm((f) => ({ ...f, locationText: text }))}
            onPlaceSelected={(result) => {
              setForm((f) => ({ ...f, locationText: result.formattedAddress, coords: { lat: result.lat, lng: result.lng } }));
            }}
          />
        </div>

        {error && <p style={{ color: 'var(--hazard)', fontSize: 12, margin: 0 }}>{error}</p>}
        <button className="btn btn-steel" onClick={submit} disabled={saving}>
          {saving ? 'Creating…' : 'Create job'}
        </button>
      </div>
    </div>
  );
}

export function JobEditSheet(props: {
  job: Job;
  saving: boolean;
  onClose: () => void;
  onSave: (name: string, client: string, locationText: string, lat: number | null, lng: number | null) => void;
  onDelete: () => void;
}) {
  const { job, saving, onClose, onSave, onDelete } = props;
  const { form, setForm } = useJobForm(job);
  const [error, setError] = useState('');

  function commit() {
    const trimmed = form.name.trim();
    if (trimmed.length === 0) {
      setError('Give the job a name');
      return;
    }
    setError('');
    onSave(trimmed, form.client.trim(), form.locationText.trim(), form.coords?.lat ?? null, form.coords?.lng ?? null);
  }

  return (
    <div className="sheet-backdrop" onClick={() => { commit(); onClose(); }}>
      <div className="capture-sheet task-detail-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="task-detail-header" style={{ justifyContent: 'flex-end' }}>
          <button className="gear-btn" onClick={() => { commit(); onClose(); }} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <input
          type="text"
          className="task-detail-name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          onBlur={commit}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="settings-label">Client (optional)</span>
          <input
            type="text"
            value={form.client}
            onChange={(e) => setForm((f) => ({ ...f, client: e.target.value }))}
            onBlur={commit}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="settings-label">Location (optional)</span>
          <LocationAutocomplete
            value={form.locationText}
            placeholder="Where is the work?"
            onChange={(text) => setForm((f) => ({ ...f, locationText: text }))}
            onPlaceSelected={(result) => {
              setForm((f) => ({ ...f, locationText: result.formattedAddress, coords: { lat: result.lat, lng: result.lng } }));
              onSave(form.name.trim(), form.client.trim(), result.formattedAddress, result.lat, result.lng);
            }}
          />
        </div>

        {error && <p style={{ color: 'var(--hazard)', fontSize: 12, margin: 0 }}>{error}</p>}
        <button className="btn btn-steel" onClick={commit} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>

        <div className="detail-delete">
          <button
            className="btn-text"
            style={{ color: 'var(--danger-text, var(--danger))', display: 'inline-flex', alignItems: 'center', gap: 6, padding: 0 }}
            onClick={() => {
              if (confirm(`Delete "${job.name}"? Its tasks stay — they're just not in a job anymore.`)) {
                onDelete();
              }
            }}
          >
            <TrashIcon /> Delete job
          </button>
        </div>
      </div>
    </div>
  );
}
