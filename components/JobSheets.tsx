'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Job } from '@/lib/jobTypes';
import LocationAutocomplete from '@/components/LocationAutocomplete';
import { CloseIcon, TrashIcon } from '@/components/icons';
import { supabase } from '@/lib/supabaseClient';
import { useDialogA11y } from '@/hooks/useDialogA11y';
import {
  dayIndexOnTrip,
  daysBetweenInclusive,
  localDateStr,
  type ActiveTripSummary,
} from '@/lib/travelContext';

// New Job / Edit Job — a Job is name + optional client/location.
// Everything else on the detail card is derived context (tasks, meetings, travel).

type JobForm = {
  name: string;
  client: string;
  locationText: string;
  coords: { lat: number; lng: number } | null;
};

export type JobDetailContext = {
  openTasks: number;
  doneTasks: number;
  meetings: number;
  nextMeetingLabel?: string | null;
  userId?: string | null;
};

function useJobForm(job: Job | null): {
  form: JobForm;
  setForm: React.Dispatch<React.SetStateAction<JobForm>>;
} {
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
  onCreate: (
    name: string,
    client: string,
    locationText: string,
    lat: number | null,
    lng: number | null
  ) => void;
}) {
  const { saving, onClose, onCreate } = props;
  const dialogRef = useDialogA11y(onClose);
  const { form, setForm } = useJobForm(null);
  const [error, setError] = useState('');

  function submit() {
    const trimmed = form.name.trim();
    if (trimmed.length === 0) {
      setError('Give the job a name');
      return;
    }
    setError('');
    onCreate(
      trimmed,
      form.client.trim(),
      form.locationText.trim(),
      form.coords?.lat ?? null,
      form.coords?.lng ?? null
    );
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div ref={dialogRef} className="capture-sheet new-job-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="New job">
        <div className="task-detail-header" style={{ marginBottom: 0 }}>
          <div className="settings-panel-title">New job</div>
          <button className="gear-btn" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <p className="job-detail-kicker">Job</p>
        <p style={{ fontSize: 12, color: 'var(--ink-soft)', margin: '0 0 10px', lineHeight: 1.4 }}>
          A container for the work — tasks and evidence come next.
        </p>

        <label htmlFor="new-job-name" className="sr-only">
          Job name
        </label>
        <input
          id="new-job-name"
          type="text"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          placeholder="e.g. Angela Street remodel"
          autoFocus
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'new-job-error' : undefined}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label htmlFor="new-job-client" className="settings-label">Client</label>
          <input
            id="new-job-client"
            type="text"
            value={form.client}
            onChange={(e) => setForm((f) => ({ ...f, client: e.target.value }))}
            placeholder="Optional"
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label className="settings-label" id="new-job-location-label">Site / location</label>
          <LocationAutocomplete
            value={form.locationText}
            placeholder="Where is the work? (optional)"
            onChange={(text) => setForm((f) => ({ ...f, locationText: text }))}
            onPlaceSelected={(result) => {
              setForm((f) => ({
                ...f,
                locationText: result.formattedAddress,
                coords: { lat: result.lat, lng: result.lng },
              }));
            }}
          />
        </div>

        <div className="stop-context-strip" style={{ marginTop: 4 }}>
          <div className="stop-context-line">
            <span className="stop-context-kicker">Next</span>
            <span>Add tasks on the job — or link it as a work stop on a trip</span>
          </div>
        </div>

        {error && (
          <p id="new-job-error" role="alert" style={{ color: 'var(--hazard)', fontSize: 12, margin: 0 }}>
            {error}
          </p>
        )}
        <button className="btn btn-steel" onClick={submit} disabled={saving}>
          {saving ? 'Creating…' : 'Create job'}
        </button>
      </div>
    </div>
  );
}

/**
 * Job details card — identity you edit; progress & connections Dokkit surfaces.
 * Mobile-first sheet; desktop already centers sheets as cards.
 */
export function JobEditSheet(props: {
  job: Job;
  saving: boolean;
  context?: JobDetailContext;
  onClose: () => void;
  onSave: (
    name: string,
    client: string,
    locationText: string,
    lat: number | null,
    lng: number | null
  ) => void;
  onDelete: () => void;
}) {
  const { job, saving, context, onClose, onSave, onDelete } = props;
  const dialogRef = useDialogA11y(onClose);
  const { form, setForm } = useJobForm(job);
  const [error, setError] = useState('');
  const [trip, setTrip] = useState<ActiveTripSummary | null>(null);
  const [tripDayIndex, setTripDayIndex] = useState(0);
  const [tripTotalDays, setTripTotalDays] = useState(0);

  useEffect(() => {
    const uid = context?.userId;
    if (!uid) {
      setTrip(null);
      return;
    }
    const todayStr = localDateStr();
    void (async () => {
      const { data } = await supabase
        .from('trips')
        .select('id, name, start_date, end_date')
        .eq('user_id', uid)
        .lte('start_date', todayStr)
        .gte('end_date', todayStr)
        .order('start_date', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!data) {
        setTrip(null);
        return;
      }
      const t = data as ActiveTripSummary;
      setTrip(t);
      setTripDayIndex(dayIndexOnTrip(t.start_date, todayStr));
      setTripTotalDays(daysBetweenInclusive(t.start_date, t.end_date));
    })();
  }, [context?.userId]);

  function commit() {
    const trimmed = form.name.trim();
    if (trimmed.length === 0) {
      setError('Give the job a name');
      return;
    }
    setError('');
    onSave(
      trimmed,
      form.client.trim(),
      form.locationText.trim(),
      form.coords?.lat ?? null,
      form.coords?.lng ?? null
    );
  }

  const openTasks = context?.openTasks ?? 0;
  const doneTasks = context?.doneTasks ?? 0;
  const totalTasks = openTasks + doneTasks;
  const meetings = context?.meetings ?? 0;
  const progressPct =
    totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : null;

  return (
    <div
      className="sheet-backdrop"
      onClick={() => {
        commit();
        onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="capture-sheet task-detail-sheet job-detail-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Job"
      >
        <div className="task-detail-header" style={{ justifyContent: 'flex-end' }}>
          <button
            className="gear-btn"
            onClick={() => {
              commit();
              onClose();
            }}
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        <p className="job-detail-kicker">Job</p>

        <label htmlFor="edit-job-name" className="sr-only">
          Job name
        </label>
        <input
          id="edit-job-name"
          type="text"
          className="task-detail-name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          onBlur={commit}
          placeholder="Job name"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'edit-job-error' : undefined}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label htmlFor="edit-job-client" className="settings-label">Client</label>
          <input
            id="edit-job-client"
            type="text"
            value={form.client}
            onChange={(e) => setForm((f) => ({ ...f, client: e.target.value }))}
            onBlur={commit}
            placeholder="Optional"
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label className="settings-label" id="edit-job-location-label">Site / location</label>
          <LocationAutocomplete
            value={form.locationText}
            placeholder="Where is the work?"
            onChange={(text) => setForm((f) => ({ ...f, locationText: text }))}
            onPlaceSelected={(result) => {
              setForm((f) => ({
                ...f,
                locationText: result.formattedAddress,
                coords: { lat: result.lat, lng: result.lng },
              }));
              onSave(
                form.name.trim(),
                form.client.trim(),
                result.formattedAddress,
                result.lat,
                result.lng
              );
            }}
          />
          <p style={{ fontSize: 11, color: 'var(--ink-faint)', margin: 0 }}>
            {form.coords
              ? 'Mapped — useful for travel and site days'
              : 'Not mapped yet — pick a place suggestion'}
          </p>
        </div>

        <div className="stop-context-strip job-context-strip">
          <div className="stop-context-line">
            <span className="stop-context-kicker">Work</span>
            <span>
              {totalTasks === 0
                ? 'No tasks yet'
                : `${openTasks} open · ${doneTasks} done`}
              {progressPct != null ? ` · ${progressPct}%` : ''}
            </span>
          </div>
          {meetings > 0 && (
            <div className="stop-context-line">
              <span className="stop-context-kicker">Meetings</span>
              <span>
                {meetings} linked
                {context?.nextMeetingLabel ? ` · ${context.nextMeetingLabel}` : ''}
              </span>
            </div>
          )}
          {trip && (
            <div className="stop-context-line">
              <span className="stop-context-kicker">Travel</span>
              <span>
                On {trip.name} · Day {tripDayIndex} of {tripTotalDays}
              </span>
            </div>
          )}
          {!trip && meetings === 0 && totalTasks === 0 && (
            <div className="stop-context-line">
              <span className="stop-context-kicker">Hint</span>
              <span>Add tasks, link meetings, or plan a site trip from Travel</span>
            </div>
          )}
        </div>

        <div className="job-detail-links">
          {meetings > 0 && (
            <Link
              href="/meetings"
              className="meeting-pill"
              style={{ textDecoration: 'none' }}
              onClick={(e) => e.stopPropagation()}
            >
              Meetings
            </Link>
          )}
          {trip && (
            <Link
              href={`/travel/${trip.id}`}
              className="meeting-pill"
              style={{ textDecoration: 'none' }}
              onClick={(e) => e.stopPropagation()}
            >
              Open trip →
            </Link>
          )}
        </div>

        {error && (
          <p id="edit-job-error" role="alert" style={{ color: 'var(--hazard)', fontSize: 12, margin: 0 }}>
            {error}
          </p>
        )}

        <button className="btn btn-steel" onClick={commit} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>

        <div className="detail-delete">
          <button
            className="btn-text"
            style={{
              color: 'var(--danger-text, var(--danger))',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: 0,
            }}
            onClick={() => {
              if (
                confirm(
                  `Delete "${job.name}"? Its tasks stay — they're just not in a job anymore.`
                )
              ) {
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
