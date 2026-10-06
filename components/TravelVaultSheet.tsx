'use client';

/**
 * Trip vault — store flights, bookings, tickets, emails, notes on a trip.
 * Work-oriented by default; independent travel evidence store.
 * Flights can auto-create an itinerary activity on a matching trip day.
 * Optional file attach → Supabase Storage (travel-docs).
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { CloseIcon, PlusIcon, TrashIcon } from '@/components/icons';
import {
  TRAVEL_DOC_TYPE_OPTIONS,
  buildFlightActivityDraft,
  docTypeLabel,
  extractFlightSchedule,
  interpretTravelPaste,
  matchTripDayForFlight,
  type TravelDocType,
  type TravelDocument,
  type TripDayRef,
} from '@/lib/travel/travelDocuments';
import {
  removeTravelVaultFile,
  signedUrlForTravelVaultFile,
  uploadTravelVaultFile,
} from '@/lib/travel/travelVaultStorage';

type Props = {
  tripId: string;
  tripName: string;
  userId: string;
  /** Trip days for matching flight date → itinerary day */
  tripDays?: TripDayRef[];
  onClose: () => void;
  /** Fired after a flight activity is created so the trip page can refresh */
  onItineraryChanged?: (info: {
    activityId: string;
    tripDayId: string;
    dayDate: string;
  }) => void;
};

export default function TravelVaultSheet({
  tripId,
  tripName,
  userId,
  tripDays = [],
  onClose,
  onItineraryChanged,
}: Props) {
  const [docs, setDocs] = useState<TravelDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [paste, setPaste] = useState('');
  const [docType, setDocType] = useState<TravelDocType>('note');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [reference, setReference] = useState('');
  const [carrier, setCarrier] = useState('');
  const [saving, setSaving] = useState(false);
  /** Default on for flights — put a stop on the itinerary */
  const [addToItinerary, setAddToItinerary] = useState(true);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('travel_documents')
      .select('*')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: false });
    if (err) {
      setError(err.message);
      setDocs([]);
    } else {
      setError('');
      setDocs((data as TravelDocument[]) || []);
    }
    setLoading(false);
  }, [tripId]);

  useEffect(() => {
    load();
  }, [load]);

  function applyPaste() {
    const parsed = interpretTravelPaste(paste);
    setDocType(parsed.doc_type);
    setTitle(parsed.title);
    setBody(parsed.body || paste);
    if (parsed.reference_code) setReference(parsed.reference_code);
    if (parsed.carrier) setCarrier(parsed.carrier);
    if (parsed.doc_type === 'flight') setAddToItinerary(true);
  }

  function resetForm() {
    setPaste('');
    setTitle('');
    setBody('');
    setReference('');
    setCarrier('');
    setDocType('note');
    setAddToItinerary(true);
    setFile(null);
  }

  async function saveDoc() {
    const t =
      title.trim() ||
      (paste.trim() ? interpretTravelPaste(paste).title : '') ||
      (file ? file.name.replace(/\.[^.]+$/, '') : '');
    if (!t) {
      setError('Give this a short title (or attach a file)');
      return;
    }
    setSaving(true);
    setError('');
    setStatusMsg(null);

    const bodyText = body.trim() || paste.trim() || null;
    const scheduleSource = bodyText || t;
    const schedule =
      docType === 'flight'
        ? extractFlightSchedule(scheduleSource, {
            tripDays,
            todayYmd: new Date().toISOString().slice(0, 10),
          })
        : null;

    const location_text =
      schedule?.origin && schedule?.destination
        ? `${schedule.origin} → ${schedule.destination}`
        : null;

    let activityId: string | null = null;
    let tripDayId: string | null = null;
    let matchedDay: TripDayRef | null = null;

    if (docType === 'flight' && addToItinerary && tripDays.length > 0) {
      matchedDay = matchTripDayForFlight(tripDays, schedule?.dateYmd ?? null);
      if (matchedDay) {
        const draft = buildFlightActivityDraft(t, schedule!, {
          carrier: carrier.trim() || null,
          reference: reference.trim() || null,
        });

        const { data: existingActs } = await supabase
          .from('activities')
          .select('order_index')
          .eq('trip_day_id', matchedDay.id)
          .order('order_index', { ascending: false })
          .limit(1);
        const maxOrder =
          existingActs && existingActs.length > 0
            ? (existingActs[0] as { order_index: number }).order_index
            : 0;

        const { data: actRow, error: actErr } = await supabase
          .from('activities')
          .insert({
            user_id: userId,
            trip_day_id: matchedDay.id,
            text: draft.text,
            activity_type: draft.activity_type,
            estimate_mins: draft.estimate_mins,
            drive_mins_to_next: draft.drive_mins_to_next,
            location_text: draft.location_text,
            order_index: maxOrder + 1,
            time_type: draft.time_type,
            fixed_time: draft.fixed_time,
            stop_kind: draft.stop_kind,
            presence: draft.presence,
            status: draft.status,
          })
          .select('id')
          .single();

        if (actErr) {
          setSaving(false);
          setError(`Vault save blocked: could not add flight to itinerary — ${actErr.message}`);
          return;
        }
        activityId = (actRow as { id: string }).id;
        tripDayId = matchedDay.id;
      }
    }

    let storagePath: string | null = null;
    let originalFilename: string | null = null;
    if (file) {
      const up = await uploadTravelVaultFile(supabase, {
        userId,
        tripId,
        file,
      });
      if (!up.ok) {
        setSaving(false);
        setError(up.error);
        return;
      }
      storagePath = up.storagePath;
      originalFilename = up.originalFilename;
    }

    const source = file
      ? 'upload'
      : paste.trim()
        ? 'paste'
        : 'manual';

    const { error: err } = await supabase.from('travel_documents').insert({
      user_id: userId,
      trip_id: tripId,
      doc_type: docType,
      title: t,
      body: bodyText,
      reference_code: reference.trim() || null,
      carrier: carrier.trim() || null,
      location_text,
      starts_at: null,
      trip_day_id: tripDayId,
      activity_id: activityId,
      storage_path: storagePath,
      original_filename: originalFilename,
      source,
    });

    setSaving(false);
    if (err) {
      if (storagePath) await removeTravelVaultFile(supabase, storagePath);
      setError(err.message);
      return;
    }

    const bits: string[] = [];
    if (activityId && matchedDay) {
      bits.push(
        `Flight on itinerary · ${matchedDay.date}${
          schedule?.departTime ? ` at ${schedule.departTime}` : ''
        }`
      );
      onItineraryChanged?.({
        activityId,
        tripDayId: matchedDay.id,
        dayDate: matchedDay.date,
      });
    } else if (docType === 'flight' && addToItinerary && tripDays.length === 0) {
      bits.push('Saved — no trip days yet, so nothing on the itinerary');
    }
    if (storagePath) bits.push(`File attached: ${originalFilename}`);
    if (bits.length) setStatusMsg(bits.join(' · '));

    setAdding(false);
    resetForm();
    await load();
  }

  async function openAttachment(doc: TravelDocument) {
    if (!doc.storage_path) return;
    const url = await signedUrlForTravelVaultFile(supabase, doc.storage_path);
    if (!url) {
      setError('Could not open file — try again or re-upload');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function removeDoc(
    id: string,
    label: string,
    linkedActivityId: string | null,
    storagePath: string | null
  ) {
    const msg = linkedActivityId
      ? `Remove “${label}” from the vault? The itinerary flight stop will stay unless you delete it separately.`
      : `Remove “${label}” from this trip vault?`;
    if (!confirm(msg)) return;
    if (storagePath) await removeTravelVaultFile(supabase, storagePath);
    await supabase.from('travel_documents').delete().eq('id', id);
    setDocs((prev) => prev.filter((d) => d.id !== id));
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="capture-sheet task-detail-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Trip vault"
      >
        <div className="task-detail-header">
          <div className="settings-panel-title">Vault</div>
          <button type="button" className="gear-btn" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '0 0 12px', lineHeight: 1.4 }}>
          Flights, bookings, tickets, emails for <strong>{tripName}</strong>. Evidence for the
          trip — not a second task list.
        </p>

        {error ? (
          <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 8 }}>{error}</p>
        ) : null}
        {statusMsg ? (
          <p style={{ color: 'var(--ink)', fontSize: 13, marginBottom: 8, lineHeight: 1.35 }}>
            {statusMsg}
          </p>
        ) : null}

        {!adding ? (
          <button
            type="button"
            className="btn btn-steel"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 14 }}
            onClick={() => {
              setAdding(true);
              setStatusMsg(null);
              setError('');
            }}
          >
            <PlusIcon /> Add to vault
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            <label className="field-label">Paste confirmation / email / speech</label>
            <textarea
              className="field-input"
              rows={4}
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder="e.g. NZ512 AKL→WLG 07:00 Mon · PNR ABC123"
            />
            {paste.trim() ? (
              <button type="button" className="btn-text" onClick={applyPaste}>
                Read paste into fields
              </button>
            ) : null}

            <label className="field-label">Attach file (optional)</label>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.txt,.eml,.doc,.docx,application/pdf,image/*"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (f && !title.trim()) {
                  setTitle(f.name.replace(/\.[^.]+$/, '').slice(0, 80));
                }
              }}
            />
            {file ? (
              <p style={{ fontSize: 12, color: 'var(--ink-soft)', margin: 0 }}>
                {file.name} · {(file.size / 1024).toFixed(0)} KB
                <button
                  type="button"
                  className="btn-text"
                  style={{ marginLeft: 8 }}
                  onClick={() => setFile(null)}
                >
                  Clear
                </button>
              </p>
            ) : (
              <p style={{ fontSize: 11, color: 'var(--ink-faint)', margin: 0 }}>
                PDF, image, text, or Word · max 10 MB
              </p>
            )}

            <label className="field-label">Type</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {TRAVEL_DOC_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={
                    docType === opt.value ? 'meeting-pill meeting-pill--primary' : 'meeting-pill'
                  }
                  onClick={() => {
                    setDocType(opt.value);
                    if (opt.value === 'flight') setAddToItinerary(true);
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {docType === 'flight' ? (
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 13,
                  color: 'var(--ink)',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={addToItinerary}
                  onChange={(e) => setAddToItinerary(e.target.checked)}
                />
                Add as flight on the itinerary
                {tripDays.length === 0 ? (
                  <span style={{ color: 'var(--ink-faint)', fontSize: 12 }}>
                    (needs trip days)
                  </span>
                ) : null}
              </label>
            ) : null}

            <label className="field-label">Title</label>
            <input
              className="field-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Flight NZ512"
            />

            <label className="field-label">Reference</label>
            <input
              className="field-input"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="PNR / booking ref"
            />

            <label className="field-label">Carrier / provider</label>
            <input
              className="field-input"
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              placeholder="Air New Zealand"
            />

            <label className="field-label">Notes / full text</label>
            <textarea
              className="field-input"
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Optional detail"
            />

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn btn-steel"
                disabled={saving}
                onClick={saveDoc}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                className="btn-text"
                onClick={() => {
                  setAdding(false);
                  setError('');
                  resetForm();
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Loading…</p>
        ) : docs.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.4 }}>
            Nothing stored yet. Paste a confirmation, attach a PDF, or add a flight ref.
          </p>
        ) : (
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {docs.map((d) => (
              <li
                key={d.id}
                style={{
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '10px 12px',
                  background: 'var(--paper-raised, var(--paper))',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginBottom: 2 }}>
                      {docTypeLabel(d.doc_type)}
                      {d.reference_code ? ` · ${d.reference_code}` : ''}
                      {d.activity_id ? ' · on itinerary' : ''}
                      {d.storage_path ? ' · file' : ''}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{d.title}</div>
                    {d.carrier ? (
                      <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{d.carrier}</div>
                    ) : null}
                    {d.location_text ? (
                      <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                        {d.location_text}
                      </div>
                    ) : null}
                    {d.original_filename ? (
                      <button
                        type="button"
                        className="btn-text"
                        style={{ fontSize: 12, marginTop: 4, padding: 0 }}
                        onClick={() => openAttachment(d)}
                      >
                        Open {d.original_filename}
                      </button>
                    ) : null}
                    {d.body ? (
                      <div
                        style={{
                          fontSize: 12,
                          color: 'var(--ink-soft)',
                          marginTop: 4,
                          lineHeight: 1.35,
                          maxHeight: 48,
                          overflow: 'hidden',
                        }}
                      >
                        {d.body}
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="gear-btn"
                    aria-label={`Remove ${d.title}`}
                    onClick={() =>
                      removeDoc(d.id, d.title, d.activity_id, d.storage_path)
                    }
                  >
                    <TrashIcon />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
