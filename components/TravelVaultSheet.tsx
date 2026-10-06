'use client';

/**
 * Trip vault — store flights, bookings, tickets, emails, notes on a trip.
 * Work-oriented by default; independent travel evidence store.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { CloseIcon, PlusIcon, TrashIcon } from '@/components/icons';
import {
  TRAVEL_DOC_TYPE_OPTIONS,
  docTypeLabel,
  interpretTravelPaste,
  type TravelDocType,
  type TravelDocument,
} from '@/lib/travel/travelDocuments';

type Props = {
  tripId: string;
  tripName: string;
  userId: string;
  onClose: () => void;
};

export default function TravelVaultSheet({ tripId, tripName, userId, onClose }: Props) {
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
  }

  async function saveDoc() {
    const t = title.trim() || (paste.trim() ? interpretTravelPaste(paste).title : '');
    if (!t) {
      setError('Give this a short title');
      return;
    }
    setSaving(true);
    setError('');
    const { error: err } = await supabase.from('travel_documents').insert({
      user_id: userId,
      trip_id: tripId,
      doc_type: docType,
      title: t,
      body: body.trim() || paste.trim() || null,
      reference_code: reference.trim() || null,
      carrier: carrier.trim() || null,
      source: paste.trim() ? 'paste' : 'manual',
    });
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setAdding(false);
    setPaste('');
    setTitle('');
    setBody('');
    setReference('');
    setCarrier('');
    setDocType('note');
    await load();
  }

  async function removeDoc(id: string, label: string) {
    if (!confirm(`Remove “${label}” from this trip vault?`)) return;
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

        {!adding ? (
          <button
            type="button"
            className="btn btn-steel"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 14 }}
            onClick={() => setAdding(true)}
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

            <label className="field-label">Type</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {TRAVEL_DOC_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={
                    docType === opt.value ? 'meeting-pill meeting-pill--primary' : 'meeting-pill'
                  }
                  onClick={() => setDocType(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>

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
            Nothing stored yet. Paste a booking confirmation or add a flight ref.
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
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{d.title}</div>
                    {d.carrier ? (
                      <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{d.carrier}</div>
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
                    onClick={() => removeDoc(d.id, d.title)}
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
