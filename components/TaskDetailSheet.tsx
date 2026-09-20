'use client';

import { useEffect, useState } from 'react';
import type { Subtask, Task, TaskContext } from '@/lib/taskTypes';
import type { Job } from '@/lib/jobTypes';
import { fmtMins, fmtSurfaceDate, parseMins } from '@/lib/timeFormat';
import LocationAutocomplete from '@/components/LocationAutocomplete';
import MicButton from '@/components/MicButton';
import { CheckIcon, ChevronIcon, CloseIcon, PlayIcon, StopIcon } from '@/components/icons';
import { TaskInfo } from '@/components/TaskInfo';

export function TaskDetailSheet(props: {
  task: Task;
  subs: Subtask[];
  remainingForThis: number;
  liveLogged: number;
  anyActive: boolean;
  context: TaskContext;
  jobs: Job[];
  onClose: () => void;
  onSave: (id: string, text: string, mins: number, surfaceDate: string | null, locationText: string | null, lat: number | null, lng: number | null) => void;
  onComplete: (id: string) => void;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onToggleDue: (id: string, current: boolean) => void;
  onAddSubtask: (id: string) => void;
  onToggleSubtaskDone: (subId: string, taskId: string, current: boolean) => void;
  onDeleteSubtask: (subId: string, taskId: string) => void;
  onDelete: (id: string) => void;
  onSaveInfo: (id: string, info: string) => void;
  onMoveToJob: (id: string, jobId: string | null) => void;
  subDraftText: string;
  subDraftTime: string;
  setSubDraftText: (v: string) => void;
  setSubDraftTime: (v: string) => void;
  /** Desktop dashboard: render as main-pane detail instead of bottom sheet. */
  presentation?: 'sheet' | 'pane';
}) {
  const {
    task, subs, remainingForThis, liveLogged, anyActive, context, jobs, onClose, onSave,
    onComplete, onStart, onStop, onToggleDue, onAddSubtask, onToggleSubtaskDone, onDeleteSubtask,
    onDelete, onSaveInfo, onMoveToJob,
    subDraftText, subDraftTime, setSubDraftText, setSubDraftTime,
    presentation = 'sheet',
  } = props;

  const [text, setText] = useState(task.text);
  const [timeStr, setTimeStr] = useState(fmtMins(task.estimate_mins));
  const [surfaceDate, setSurfaceDate] = useState(task.surface_date || '');
  const [locationText, setLocationText] = useState(task.location_text || '');
  const [locationCoords, setLocationCoords] = useState<{ lat: number; lng: number } | null>(
    task.lat != null && task.lng != null ? { lat: task.lat, lng: task.lng } : null
  );
  const [jobMoveOpen, setJobMoveOpen] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setText(task.text);
    setTimeStr(fmtMins(task.estimate_mins));
    setSurfaceDate(task.surface_date || '');
    setLocationText(task.location_text || '');
    setLocationCoords(task.lat != null && task.lng != null ? { lat: task.lat, lng: task.lng } : null);
    setJobMoveOpen(false);
    setError('');
  }, [task.id]);

  function commit() {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      setError('Name cannot be empty');
      return;
    }
    const mins = parseMins(timeStr);
    if (mins === null || mins < 0) {
      setError('Could not read that time, try 15m, 1.5h, or 0m');
      return;
    }
    setError('');
    onSave(
      task.id,
      trimmed,
      mins,
      surfaceDate || null,
      locationText.trim() || null,
      locationCoords?.lat ?? null,
      locationCoords?.lng ?? null
    );
  }

  function handleClose() {
    commit();
    onClose();
  }

  const startDisabled = anyActive && task.status !== 'active';
  const isPane = presentation === 'pane';

  return (
    <div
      className={isPane ? 'desk-pane-detail' : 'sheet-backdrop'}
      onClick={isPane ? undefined : handleClose}
    >
      <div
        className={isPane ? 'task-detail-sheet desk-pane-detail-inner' : 'capture-sheet task-detail-sheet'}
        onClick={isPane ? undefined : (e) => e.stopPropagation()}
      >
        <div className="task-detail-header" style={{ justifyContent: 'flex-end' }}>
          <button
            className="gear-btn"
            onClick={handleClose}
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        <input
          type="text"
          className="task-detail-name"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
        />

        {task.estimate_mins > 0 && (
          <div className="task-progress-row" style={{ marginTop: 0 }}>
            <div className="task-progress-track">
              <div
                className="task-progress-fill"
                style={{ width: `${Math.min((1 - remainingForThis / Math.max(task.estimate_mins, 1)) * 100, 100)}%` }}
              />
            </div>
            <span className="task-progress-label mono">{fmtMins(remainingForThis)} left</span>
          </div>
        )}

        <div className="capture-row">
          <button
            type="button"
            className={task.due_today ? 'btn-quiet active' : 'btn-quiet'}
            onClick={() => onToggleDue(task.id, task.due_today)}
          >
            {task.due_today ? 'Due today' : 'Not due today'}
          </button>
        </div>

        <span className="settings-label">Location (optional)</span>
        <LocationAutocomplete
          value={locationText}
          onChange={(v, coords) => {
            setLocationText(v);
            setLocationCoords(coords);
          }}
          onBlur={commit}
        />

        <span className="settings-label">{context === 'job' ? 'When' : 'Reminder'}</span>
        <div className="reminder-date-row">
          <input
            type="date"
            value={surfaceDate}
            onChange={(e) => setSurfaceDate(e.target.value)}
            onBlur={commit}
          />
          {surfaceDate && (
            <button className="btn-text" onClick={() => { setSurfaceDate(''); commit(); }}>
              Clear
            </button>
          )}
        </div>

        <span className="settings-label">Estimate</span>
        <div className="capture-row">
          <input
            type="text"
            className="time-input"
            value={timeStr}
            onChange={(e) => setTimeStr(e.target.value)}
            onBlur={commit}
            placeholder="15m"
          />
          <MicButton onResult={(v) => setTimeStr(v)} />
        </div>

        <span className="settings-label">Information</span>
        <TaskInfo value={task.info || ''} onSave={(info) => onSaveInfo(task.id, info)} surface="paper" />

        <button
          type="button"
          className={jobMoveOpen ? 'detail-reveal active' : 'detail-reveal'}
          onClick={() => setJobMoveOpen((v) => !v)}
        >
          {task.job_id ? 'Move to another job' : 'Add to a job'}
          <ChevronIcon size={14} />
        </button>
        {jobMoveOpen && (
          <div className="move-day-list">
            <button
              className="move-day-option"
              onClick={() => { onMoveToJob(task.id, null); setJobMoveOpen(false); }}
            >
              No job
            </button>
            {jobs.map((j) => (
              <button
                key={j.id}
                className="move-day-option"
                onClick={() => { onMoveToJob(task.id, j.id); setJobMoveOpen(false); }}
              >
                {j.name}
              </button>
            ))}
          </div>
        )}

        {error && <div className="settings-help" style={{ color: 'var(--danger)' }}>{error}</div>}

        <div className="task-detail-actions">
          {task.estimate_mins > 0 && (
            task.status === 'active' ? (
              <button className="btn btn-ghost start-stop-btn" style={{ flex: 1 }} onClick={() => onStop(task.id)}>
                <StopIcon /> Stop <span className="mono" style={{ fontWeight: 600 }}>{fmtMins(liveLogged)}</span>
              </button>
            ) : (
              <button className="btn btn-steel start-stop-btn" style={{ flex: 1 }} disabled={startDisabled} onClick={() => onStart(task.id)}>
                <PlayIcon /> Start
              </button>
            )
          )}
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { onComplete(task.id); onClose(); }}>
            <CheckIcon done /> Done
          </button>
        </div>

        <div className="subtask-panel">
          <div className="subtask-header">
            <div className="settings-panel-title">Sub-tasks</div>
            <button
              className="subtask-add-btn"
              onClick={() => setShowAddForm((v) => !v)}
            >
              Add
            </button>
          </div>
          {showAddForm && (
            <div className="subtask-add-row">
              <input
                type="text"
                value={subDraftText}
                onChange={(e) => setSubDraftText(e.target.value)}
                placeholder="Sub-task"
              />
              <input
                type="text"
                className="time-input"
                value={subDraftTime}
                onChange={(e) => setSubDraftTime(e.target.value)}
                placeholder="0m"
              />
              <button className="btn btn-steel" onClick={() => onAddSubtask(task.id)}>Add</button>
            </div>
          )}
          {subs.map((s) => (
            <div key={s.id} className="subtask-row">
              <button
                className={s.done ? 'subtask-check done' : 'subtask-check'}
                onClick={() => onToggleSubtaskDone(s.id, task.id, s.done)}
                aria-label="Toggle sub-task"
              />
              <span className={s.done ? 'subtask-text done' : 'subtask-text'}>{s.text}</span>
              <button className="icon-btn" onClick={() => onDeleteSubtask(s.id, task.id)} aria-label="Delete sub-task">×</button>
            </div>
          ))}
        </div>

        <button
          className="btn btn-ghost danger-btn task-detail-delete"
          onClick={() => {
            if (confirm(`Delete "${task.text}"?`)) {
              onDelete(task.id);
              onClose();
            }
          }}
        >
          Delete task
        </button>
      </div>
    </div>
  );
}
