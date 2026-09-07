'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { groupMediaByObservation, fmtCapturedAt } from '@/lib/meetingCapture';
import { loadMediaBlob } from '@/lib/mediaStore';
import type {
  Meeting,
  MeetingAction,
  MeetingDecision,
  MeetingMedia,
  MeetingObservation,
  MeetingParticipant,
} from '@/lib/meetingTypes';
import {
  useMeetingExports,
  type MeetingExportRecordInput,
} from '@/hooks/useMeetingExports';
import {
  exportChangedSince,
  generateExport,
  inspectMissingMedia,
  latestFailed,
  latestSuccessful,
  maskCounts,
  seedReviewFromRecord,
  transcriptionProviders,
  type MeetingExportContent,
  type MeetingExportPlan,
  type MeetingExportRecord,
  type MeetingExportResult,
  type MeetingExportReviewState,
  type MissingMediaNotice,
} from '@/lib/meetingExport';
import { defaultReviewState, resolvePlanFromReview } from '@/lib/meetingExport';
import { optimiseMeetingPhoto } from '@/lib/meetingExport';
import MeetingExportReview from './MeetingExportReview';

// ── The meeting export surface ───────────────────────────────────────
// Lives on the meeting page: an "Export" action with change-detection
// marker + compact history. Flow: Export → Review → (missing media?)
// → Generate → Ready (Share / Save files). Everything generated is held in
// memory and delivered via Web Share or file downloads; the only Supabase
// write is the immutable ExportRecord.

type Props = {
  userId: string;
  meetingId: string;
  meeting: Meeting;
  jobName: string | null;
  participants: MeetingParticipant[];
  observations: MeetingObservation[];
  decisions: MeetingDecision[];
  actions: MeetingAction[];
  media: MeetingMedia[];
};

type Flow =
  | { kind: 'closed' }
  | { kind: 'review'; state: MeetingExportReviewState; source: 'prefs' | 'retry' }
  | { kind: 'missing'; plan: MeetingExportPlan; reviewState: MeetingExportReviewState; missing: MissingMediaNotice[] }
  | { kind: 'generating' }
  | { kind: 'ready'; result: MeetingExportResult; plan: MeetingExportPlan }
  | { kind: 'error'; message: string };

function fmtBytes(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  return `${Math.round(n / 1e3)} KB`;
}

function fmtExportTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const date = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const clock = fmtCapturedAt(iso);
  return `${date} · ${clock}`;
}

function downloadOne(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  console.warn('[meetingExport:download] download initiated', { fileName: file.name, sizeBytes: file.size });
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ── TEMPORARY DIAGNOSTICS (browser delivery/generation failures) ────
// Structured console detail so the actual exception for a real browser or
// device failure is observable without an ugly stack reaching the UI. The
// user-facing message stays generic. Remove after the failure is confirmed.
function describeError(e: unknown): Record<string, unknown> {
  const err = e as {
    name?: string;
    message?: string;
    code?: unknown;
    stack?: string;
    cause?: unknown;
    diagStage?: string;
  };
  return {
    name: err?.name,
    message: err?.message,
    code: err?.code,
    diagStage: err?.diagStage,
    stack: err?.stack,
    cause: err?.cause != null ? describeError(err.cause) : null,
  };
}

function exportFiles(plan: MeetingExportPlan, result: MeetingExportResult): File[] {
  const files: File[] = [];
  if (plan.exportType !== 'evidence_package') {
    files.push(new File([new Uint8Array(result.pdf)], result.pdfFileName || 'Meeting Record.pdf', { type: 'application/pdf' }));
  }
  if (plan.exportType !== 'pdf' && result.packageZip) {
    files.push(new File([new Uint8Array(result.packageZip)], `${result.packageFolderName || 'Meeting Record'}.zip`, { type: 'application/zip' }));
  }
  return files;
}

// True only when the platform can actually hand these files to the OS share
// sheet. Presence of navigator.share alone is NOT enough — on several
// desktop builds canShare(file) is false or can throw, and that must never
// prevent the download fallback.
function canShareFiles(files: File[]): boolean {
  if (files.length === 0) return false;
  try {
    return (
      typeof navigator !== 'undefined' &&
      typeof navigator.canShare === 'function' &&
      typeof navigator.share === 'function' &&
      (navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean }).canShare?.({ files }) === true
    );
  } catch (e) {
    console.warn('[meetingExport:share] navigator.canShare threw — falling back to download', e);
    return false;
  }
}

export default function MeetingExport(props: Props) {
  const { meetingId, userId, meeting } = props;
  const { records, prefs, refresh, persistRecord } = useMeetingExports(meetingId, userId);

  const [flow, setFlow] = useState<Flow>({ kind: 'closed' });
  const [historyOpen, setHistoryOpen] = useState(false);
  const lastPlanRef = useRef<MeetingExportPlan | null>(null);

  // Linked actions carry the text of their promoted task (drawn from the
  // task row, since a linked action IS that task). Fetched once when the
  // set of linked ids changes.
  const [taskTexts, setTaskTexts] = useState<Record<string, string>>({});
  const actionTaskIds = useMemo(
    () => [...new Set(props.actions.map((a) => a.task_id).filter((t): t is string => Boolean(t)))],
    [props.actions]
  );
  useEffect(() => {
    if (actionTaskIds.length === 0) {
      setTaskTexts({});
      return;
    }
    let cancelled = false;
    supabase
      .from('tasks')
      .select('id, text')
      .in('id', actionTaskIds)
      .then(({ data }) => {
        if (cancelled) return;
        setTaskTexts(Object.fromEntries((data ?? []).map((t) => [t.id, t.text])));
      });
    return () => {
      cancelled = true;
    };
  }, [actionTaskIds]);

  // The full exportable state of the meeting, in recorded order.
  const content = useMemo<MeetingExportContent | null>(() => {
    if (!meeting) return null;
    const mediaByObs = groupMediaByObservation(props.media);
    const observations = props.observations
      .map((o) => ({ observation: o, media: mediaByObs.get(o.id) ?? [] }))
      .sort((a, b) => a.observation.captured_at.localeCompare(b.observation.captured_at) || a.observation.id.localeCompare(b.observation.id));
    const decisions = [...props.decisions].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
    const actions = [...props.actions]
      .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
      .map((a) => ({
        action: a,
        task: a.task_id ? { id: a.task_id, text: taskTexts[a.task_id] ?? '' } : null,
      }));
    return {
      meeting,
      job: meeting.job_id ? { id: meeting.job_id, name: props.jobName ?? '' } : null,
      participants: props.participants,
      observations,
      decisions,
      actions,
    };
  }, [meeting, props.participants, props.observations, props.media, props.decisions, props.actions, props.jobName, taskTexts]);

  const deps = useMemo(
    () => ({
      loadMedia: (ref: string) => loadMediaBlob(ref),
      optimisePhoto: optimiseMeetingPhoto,
      providers: transcriptionProviders(),
      now: () => new Date(),
    }),
    []
  );

  const latestSuccess = latestSuccessful(records);
  const latestFailedRecord = latestFailed(records);

  const change = useMemo(() => {
    if (!content || !latestSuccess?.selected_sections) return { changed: false, summary: null };
    const counts = maskCounts(content, latestSuccess.selected_sections.mask);
    return exportChangedSince(latestSuccess, content, counts);
  }, [content, latestSuccess]);

  function openExport() {
    if (!content) return;
    setFlow({ kind: 'review', state: defaultReviewState(content, prefs), source: 'prefs' });
    setHistoryOpen(false);
  }

  function retryRecord(record: MeetingExportRecord) {
    if (!content) return;
    setFlow({ kind: 'review', state: seedReviewFromRecord(content, prefs, record), source: 'retry' });
  }

  async function runGenerate(plan: MeetingExportPlan) {
    if (!content) return;
    lastPlanRef.current = plan;
    setFlow({ kind: 'generating' });
    console.warn('[meetingExport:runGenerate] start', {
      exportType: plan.exportType,
      pdfQuality: plan.pdfQuality,
      transcribe: plan.transcribe,
      providers: transcriptionProviders().length,
      selectedObservations: plan.observations.length,
      selectedMediaIds: plan.observations.reduce((n, o) => n + o.mediaIds.length, 0),
    });
    try {
      let result: MeetingExportResult;
      try {
        result = await generateExport({ content, plan, deps });
      } catch (e1) {
        const stage = (e1 as { diagStage?: string })?.diagStage ?? 'unknown';
        console.error(`[meetingExport:runGenerate] generateExport FAILED at stage "${stage}"`, describeError(e1));
        throw e1;
      }
      console.warn('[meetingExport:runGenerate] generated', {
        pdfFileName: result.pdfFileName,
        packageFolderName: result.packageFolderName,
        pdfBytes: result.pdf.byteLength,
        zipBytes: result.packageZip?.byteLength ?? null,
        missing: result.missing.length,
        transcriptionStatus: result.transcriptionStatus,
        fileSize: result.fileSize,
      });

      const recordInput: MeetingExportRecordInput = {
        status: 'successful',
        exportType: plan.exportType,
        fingerprint: result.fingerprint,
        sections: result.sections,
        counts: result.counts,
        transcriptionRequested: plan.transcribe,
        transcriptionStatus: result.transcriptionStatus,
        missingMediaCount: result.missing.length,
        fileSize: result.fileSize,
        errorReason: null,
      };
      try {
        await persistRecord(recordInput);
      } catch (e2) {
        console.error('[meetingExport:runGenerate] persistRecord FAILED — the artifact is still fine but the history row was not saved', describeError(e2));
        throw e2;
      }

      setFlow({ kind: 'ready', result, plan });
      console.warn('[meetingExport:runGenerate] ready — artifacts held in memory; delivering via Share / Save to files', {
        shareViable: canShareFiles(exportFiles(plan, result)),
      });
    } catch (e) {
      console.error('[meetingExport:runGenerate] FAILED — showing the error sheet (user message stays generic)', describeError(e));
      setFlow({ kind: 'error', message: 'Could not generate the export.' });
    }
  }

  async function onGenerate(state: MeetingExportReviewState) {
    if (!content) return;
    const plan = resolvePlanFromReview(content, state);
    let report: { ok: boolean; missing: MissingMediaNotice[] };
    try {
      report = await inspectMissingMedia(content, plan, deps);
      console.warn('[meetingExport:onGenerate] missing-media inspection', { ok: report.ok, missingCount: report.missing.length });
    } catch (e) {
      console.error('[meetingExport:onGenerate] inspectMissingMedia FAILED — continuing without the warning, generation re-checks per media', describeError(e));
      report = { ok: true, missing: [] };
    }
    if (!report.ok) {
      setFlow({ kind: 'missing', plan, reviewState: state, missing: report.missing });
      return;
    }
    await runGenerate(plan);
  }

  function closeFlow() {
    setFlow({ kind: 'closed' });
    void refresh();
  }

  async function shareFiles(plan: MeetingExportPlan, result: MeetingExportResult) {
    const files = exportFiles(plan, result);
    if (canShareFiles(files)) {
      try {
        await navigator.share({ files, title: result.baseName });
        console.warn('[meetingExport:share] share sheet completed — delivery is now owned by the OS', {
          fileName: files.map((f) => f.name),
        });
        closeFlow();
        return;
      } catch (e) {
        // Any failure — including the user dismissing the sheet (AbortError)
        // — falls through to the download path so a generated artifact is
        // never silently left behind.
        console.warn('[meetingExport:share] share did not complete — falling back to file download', e);
      }
    } else {
      console.warn('[meetingExport:share] file sharing unavailable here — downloading directly', {
        files: files.map((f) => `${f.name} (${f.size} bytes)`),
      });
    }
    saveFiles(plan, result);
  }

  function saveFiles(plan: MeetingExportPlan, result: MeetingExportResult) {
    const files = exportFiles(plan, result);
    if (files.length === 0) {
      console.warn('[meetingExport:saveFiles] nothing to save', { exportType: plan.exportType, hasZip: Boolean(result.packageZip) });
      closeFlow();
      return;
    }
    for (const file of files) downloadOne(file);
    closeFlow();
  }

  function retryError() {
    if (lastPlanRef.current) void runGenerate(lastPlanRef.current);
    else openExport();
  }

  const showMarker = latestSuccess !== null || latestFailedRecord !== null;

  return (
    <section className="detail-section">
      <div className="detail-section-title-row">
        <div className="detail-section-title">Export</div>
        <button type="button" className="btn btn-ghost btn--compact" onClick={openExport}>
          Export
        </button>
      </div>

      {content === null ? (
        <p className="meeting-empty">Preparing export…</p>
      ) : (
        <>
          {showMarker && (
            <div className="export-marker-row">
              {latestSuccess && !change.changed && (
                <div className="export-marker">Exported · {fmtExportTime(latestSuccess.created_at)}</div>
              )}
              {latestSuccess && change.changed && (
                <div className="export-marker export-marker--changed">
                  Changed since export · {change.summary ?? 'Meeting updated'}
                  <span className="export-marker-sub">Last exported {fmtExportTime(latestSuccess.created_at)}</span>
                </div>
              )}
              {!latestSuccess && latestFailedRecord && (
                <div className="export-marker export-marker--failed">
                  Last export didn't finish · {fmtExportTime(latestFailedRecord.created_at)}
                </div>
              )}
            </div>
          )}

          {records.length > 0 && (
            <button
              type="button"
              className="meeting-export-history-toggle"
              onClick={() => setHistoryOpen((o) => !o)}
              aria-expanded={historyOpen}
            >
              History {historyOpen ? '—' : '+'}
            </button>
          )}

          {historyOpen && records.length > 0 && (
            <div className="export-history">
              {records.map((r) => (
                <div key={r.id} className="export-history-row">
                  {r.status === 'successful' ? (
                    <span>
                      Exported{r.status === 'successful' ? ' · ' + r.export_type.replace('_', ' ') : ''} · {fmtExportTime(r.created_at)}
                      {r.file_size ? <span className="export-history-size"> · {fmtBytes(r.file_size)}</span> : null}
                    </span>
                  ) : (
                    <span className="export-history-failed">
                      Export failed · {fmtExportTime(r.created_at)}
                      <button type="button" className="btn-text" onClick={() => retryRecord(r)}>
                        Try again
                      </button>
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {flow.kind === 'review' && content && (
        <MeetingExportReview
          state={flow.state}
          content={content}
          transcriptProviderAvailable={transcriptionProviders().length > 0}
          onChange={(next) => setFlow({ kind: 'review', state: next, source: flow.source })}
          onCancel={() => setFlow({ kind: 'closed' })}
          onGenerate={onGenerate}
        />
      )}

      {flow.kind === 'missing' && (
        <div className="sheet-backdrop">
          <div className="meeting-export-sheet" role="dialog" aria-label="Missing media">
            <div className="capture-sheet-header">
              <div>
                <div className="capture-sheet-title">Some evidence is missing</div>
                <div className="capture-sheet-hint">
                  These couldn't be found on this device, so they won't be in the export. Whatever is missing is noted in the record.
                </div>
              </div>
            </div>
            <ul className="export-missing-list">
              {flow.missing.map((m) => (
                <li key={m.mediaId}>{m.label}</li>
              ))}
            </ul>
            <div className="export-review-buttons">
              <button className="btn btn-ghost" onClick={() => setFlow({ kind: 'review', state: flow.reviewState, source: 'prefs' })}>
                Cancel
              </button>
              <button className="btn btn-steel" onClick={() => void runGenerate(flow.plan)}>
                Continue without them
              </button>
            </div>
          </div>
        </div>
      )}

      {flow.kind === 'generating' && (
        <div className="sheet-backdrop">
          <div className="meeting-export-sheet" role="status" aria-label="Generating export">
            <div className="capture-sheet-title">Generating export…</div>
            <div className="capture-sheet-hint">Building the record and packaging the original media.</div>
          </div>
        </div>
      )}

      {flow.kind === 'ready' && (
        <div className="sheet-backdrop">
          <div className="meeting-export-sheet" role="dialog" aria-label="Export ready">
            <div className="capture-sheet-header">
              <div>
                <div className="capture-sheet-title">Export ready</div>
                <div className="capture-sheet-hint">{fileSummary(flow.plan.exportType, flow.result)}</div>
              </div>
            </div>
            <div className="export-summary-line">
              {fmtBytes(flow.result.fileSize)}
              {flow.result.missing.length > 0 && (
                <span className="export-marker--changed"> · {flow.result.missing.length} missing</span>
              )}
            </div>
            <div className="export-review-buttons">
              <button className="btn btn-ghost" onClick={closeFlow}>
                Done
              </button>
              <button className="btn btn-steel" onClick={() => void shareFiles(flow.plan, flow.result)}>
                Share
              </button>
            </div>
            <button className="btn-text export-save-files" onClick={() => saveFiles(flow.plan, flow.result)}>
                Save to files
              </button>
          </div>
        </div>
      )}

      {flow.kind === 'error' && (
        <div className="sheet-backdrop">
          <div className="meeting-export-sheet" role="alert" aria-label="Export failed">
            <div className="capture-sheet-title">{flow.message}</div>
            <div className="capture-sheet-hint">Nothing was saved — you can try again.</div>
            <div className="export-review-buttons">
              <button className="btn btn-ghost" onClick={closeFlow}>
                Close
              </button>
              <button className="btn btn-steel" onClick={retryError}>
                Try again
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function fileSummary(exportType: string, result: MeetingExportResult): string {
  const files: string[] = [];
  if (exportType !== 'evidence_package') files.push(result.pdfFileName);
  if (exportType !== 'pdf' && result.packageZip) files.push(`${result.packageFolderName}.zip`);
  return `Share or save ${files.join(', ')}.`;
}