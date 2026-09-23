'use client';

import { useMemo } from 'react';
import type { MeetingExportContent, MeetingExportPlan } from '@/lib/meetingExport';
import type {
  MeetingExportReviewState,
  MeetingExportReviewItem,
  MeetingExportReviewObservation,
} from '@/lib/meetingExport';
import { planCounts, resolvePlanFromReview } from '@/lib/meetingExport';
import { useDialogA11y } from '@/hooks/useDialogA11y';

// ── Export review ────────────────────────────────────────────────────
// The per-export surface: what goes in, adjusted once, for THIS export
// only. Nothing here ever mutates Preferences — the choices shown start
// from Preferences + the meeting's real content and finish as the submitted
// plan. Sections are toggleable wholesale; observations, decisions and
// actions fine-tune individually; each observation's photos and voice notes
// have their own per-type toggles.

type Props = {
  state: MeetingExportReviewState;
  content: MeetingExportContent;
  transcriptProviderAvailable: boolean;
  onChange: (next: MeetingExportReviewState) => void;
  onCancel: () => void;
  onGenerate: (state: MeetingExportReviewState) => void;
  generating?: boolean;
};

function Check({ on, label }: { on: boolean; label: string }) {
  return (
    <span className="export-check" role="checkbox" aria-checked={on} aria-label={label}>
      {on && (
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
          <path d="M1.5 5.5l2.5 2.5L9.5 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

export default function MeetingExportReview(props: Props) {
  const dialogRef = useDialogA11y(onCancel);
  const { state, content, transcriptProviderAvailable, onChange, onCancel, onGenerate, generating } = props;

  const plan: MeetingExportPlan = useMemo(() => resolvePlanFromReview(content, state), [content, state]);
  const counts = useMemo(() => planCounts(content, plan), [content, plan]);

  const summaryBits = [
    counts.observations > 0 ? `${counts.observations} observation${counts.observations === 1 ? '' : 's'}` : null,
    counts.photos > 0 ? `${counts.photos} photo${counts.photos === 1 ? '' : 's'}` : null,
    counts.audio > 0 ? `${counts.audio} voice note${counts.audio === 1 ? '' : 's'}` : null,
    counts.decisions > 0 ? `${counts.decisions} decision${counts.decisions === 1 ? '' : 's'}` : null,
    counts.actions > 0 ? `${counts.actions} action${counts.actions === 1 ? '' : 's'}` : null,
    counts.participants > 0 ? `${counts.participants} participant${counts.participants === 1 ? '' : 's'}` : null,
  ].filter((s): s is string => Boolean(s));
  const hasAudio = content.observations.some((o) => o.media.some((m) => m.media_type === 'audio'));

  function toggleSection(key: 'participants' | 'notes' | 'observationsOn' | 'decisionsOn' | 'actionsOn') {
    onChange({ ...state, [key]: !state[key] });
  }

  function toggleObservation(id: string) {
    onChange({
      ...state,
      observations: state.observations.map((o) =>
        o.id === id ? { ...o, selected: !o.selected } : o
      ),
    });
  }

  function toggleMediaType(obsId: string, type: 'photo' | 'audio') {
    onChange({
      ...state,
      observations: state.observations.map((o) => {
        if (o.id !== obsId) return o;
        return {
          ...o,
          media: o.media.map((m) => (m.mediaType === type ? { ...m, selected: !m.selected } : m)),
        };
      }),
    });
  }

  function toggleItem(list: 'decisions' | 'actions', item: MeetingExportReviewItem) {
    onChange({ ...state, [list]: state[list].map((it) => (it.id === item.id ? { ...it, selected: !it.selected } : it)) });
  }

  function mediaSummary(obs: MeetingExportReviewObservation): { photos: number; audio: number } {
    const photos = obs.media.filter((m) => m.mediaType === 'photo').length;
    const audio = obs.media.filter((m) => m.mediaType === 'audio').length;
    return { photos, audio };
  }

  const typeOptions = [
    { value: 'pdf' as const, label: 'PDF' },
    { value: 'evidence_package' as const, label: 'Evidence package' },
    { value: 'both' as const, label: 'Both' },
  ];
  const qualityOptions = [
    { value: 'standard' as const, label: 'Standard' },
    { value: 'compact' as const, label: 'Compact' },
    { value: 'keep_quality' as const, label: 'Keep quality' },
  ];

  return (
    <div className="sheet-backdrop" onClick={onCancel}>
      <div ref={dialogRef} className="meeting-export-sheet" role="dialog" aria-modal="true" aria-label="Review export" onClick={(e) => e.stopPropagation()}>
        <div className="capture-sheet-header">
          <div>
            <div className="capture-sheet-title">Review export</div>
            <div className="capture-sheet-hint">
              What this export contains. This applies to this export only — your Preferences stay the same.
            </div>
          </div>
        </div>

        <div className="export-review-group">
          <div className="export-review-label">Export type</div>
          <div className="segmented">
            {typeOptions.map((opt) => (
              <button
                key={opt.value}
                className={state.exportType === opt.value ? 'segmented-btn active' : 'segmented-btn'}
                onClick={() => onChange({ ...state, exportType: opt.value })}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="export-review-group">
          <div className="export-review-label">What's included</div>

          <div className="export-review-section">
            <button className="export-select-row" onClick={() => toggleSection('participants')} aria-pressed={state.participants}>
              <Check on={state.participants} label="Participants" />
              <span className="export-select-label">Participants</span>
              <span className="export-select-meta">
                {content.participants.length === 0 ? 'none' : `${content.participants.length}`}
              </span>
            </button>
          </div>

          <div className="export-review-section">
            <button className="export-select-row" onClick={() => toggleSection('notes')} aria-pressed={state.notes}>
              <Check on={state.notes} label="Notes" />
              <span className="export-select-label">Notes (raw capture)</span>
              <span className="export-select-meta">{content.meeting.notes?.trim() ? 'included' : 'none'}</span>
            </button>
          </div>

          <div className="export-review-section">
            <button className="export-select-row" onClick={() => toggleSection('observationsOn')} aria-pressed={state.observationsOn}>
              <Check on={state.observationsOn} label="Observations" />
              <span className="export-select-label">Observations</span>
              <span className="export-select-meta">
                {content.observations.length === 0 ? 'none recorded' : `${content.observations.length}`}
              </span>
            </button>
            {state.observationsOn &&
              state.observations.map((obs) => {
                const { photos, audio } = mediaSummary(obs);
                return (
                  <div key={obs.id} className="export-review-sub">
                    <button className="export-select-row export-select-row--sub" onClick={() => toggleObservation(obs.id)} aria-pressed={obs.selected}>
                      <Check on={obs.selected} label="Observation" />
                      <span className="export-select-label export-select-label--wrap">{obs.text || 'Photo / voice only'}</span>
                    </button>
                    {obs.selected && (photos > 0 || audio > 0) && (
                      <div className="export-media-chips">
                        {photos > 0 && (
                          <button
                            className={obs.media.filter((m) => m.mediaType === 'photo').every((m) => m.selected) ? 'export-chip active' : 'export-chip'}
                            onClick={() => toggleMediaType(obs.id, 'photo')}
                            aria-pressed={obs.media.filter((m) => m.mediaType === 'photo').every((m) => m.selected)}
                          >
                            {photos} photo{photos === 1 ? '' : 's'}
                          </button>
                        )}
                        {audio > 0 && (
                          <button
                            className={obs.media.filter((m) => m.mediaType === 'audio').every((m) => m.selected) ? 'export-chip active' : 'export-chip'}
                            onClick={() => toggleMediaType(obs.id, 'audio')}
                            aria-pressed={obs.media.filter((m) => m.mediaType === 'audio').every((m) => m.selected)}
                          >
                            {audio} voice note{audio === 1 ? '' : 's'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>

          <div className="export-review-section">
            <button className="export-select-row" onClick={() => toggleSection('decisionsOn')} aria-pressed={state.decisionsOn}>
              <Check on={state.decisionsOn} label="Decisions" />
              <span className="export-select-label">Decisions</span>
              <span className="export-select-meta">
                {content.decisions.length === 0 ? 'none recorded' : `${content.decisions.length}`}
              </span>
            </button>
            {state.decisionsOn &&
              state.decisions.map((d) => (
                <div key={d.id} className="export-review-sub">
                  <button className="export-select-row export-select-row--sub" onClick={() => toggleItem('decisions', d)} aria-pressed={d.selected}>
                    <Check on={d.selected} label="Decision" />
                    <span className="export-select-label export-select-label--wrap">{d.text}</span>
                  </button>
                </div>
              ))}
          </div>

          <div className="export-review-section">
            <button className="export-select-row" onClick={() => toggleSection('actionsOn')} aria-pressed={state.actionsOn}>
              <Check on={state.actionsOn} label="Actions" />
              <span className="export-select-label">Actions</span>
              <span className="export-select-meta">
                {content.actions.length === 0 ? 'none recorded' : `${content.actions.length}`}
              </span>
            </button>
            {state.actionsOn &&
              state.actions.map((a) => (
                <div key={a.id} className="export-review-sub">
                  <button className="export-select-row export-select-row--sub" onClick={() => toggleItem('actions', a)} aria-pressed={a.selected}>
                    <Check on={a.selected} label="Action" />
                    <span className="export-select-label export-select-label--wrap">{a.text}</span>
                  </button>
                </div>
              ))}
          </div>
        </div>

        <div className="export-review-group">
          <button className="export-select-row" onClick={() => onChange({ ...state, transcribe: !state.transcribe })} aria-pressed={state.transcribe} disabled={!hasAudio}>
            <Check on={hasAudio && state.transcribe} label="Transcribe voice notes" />
            <span className="export-select-label">Transcripts of voice notes</span>
            <span className="export-select-meta">{hasAudio ? (state.transcribe ? 'on' : 'off') : 'no audio'}</span>
          </button>
          <p className="settings-hint">
            {transcriptProviderAvailable
              ? 'Transcripts are written by the connected transcription provider.'
              : 'No transcription provider is set up yet — transcripts will be marked unavailable, with the original recordings included.'}
          </p>
        </div>

        {state.exportType !== 'evidence_package' && (
          <div className="export-review-group">
            <div className="export-review-label">Photo quality in the PDF</div>
            <div className="segmented">
              {qualityOptions.map((opt) => (
                <button
                  key={opt.value}
                  className={state.pdfQuality === opt.value ? 'segmented-btn active' : 'segmented-btn'}
                  onClick={() => onChange({ ...state, pdfQuality: opt.value })}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="settings-hint">Photos in the record are re-encoded for the PDF; the Evidence Package always keeps your originals.</p>
          </div>
        )}

        <div className="export-review-actions">
          <div className="export-review-summary">
            {summaryBits.length > 0 ? `Includes ${summaryBits.join(' · ')}` : 'Nothing selected yet'}
          </div>
          <div className="export-review-buttons">
            <button className="btn btn-ghost" onClick={onCancel} disabled={generating}>
              Cancel
            </button>
            <button className="btn btn-steel" onClick={() => onGenerate(state)} disabled={generating || summaryBits.length === 0}>
              {generating ? 'Generating…' : 'Generate export'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
