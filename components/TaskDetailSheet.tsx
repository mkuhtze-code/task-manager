'use client';

import { useEffect, useState } from 'react';
import type { Subtask, Task } from '@/lib/taskTypes';
import { fmtMins, fmtSurfaceDate, parseMins } from '@/lib/timeFormat';
import LocationAutocomplete from '@/components/LocationAutocomplete';
import MicButton from '@/components/MicButton';
import { CloseIcon, PlayIcon, StopIcon } from '@/components/icons';
import { TaskInfo } from '@/components/TaskInfo';

export function TaskDetailSheet(props: {
  task: Task;
  subs: Subtask[];
  remainingForThis: number;
  liveLogged: number;
  anyActive: boolean;
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
  subDraftText: string;
  subDraftTime: string;
  setSubDraftText: (v: string) => void;
  setSubDraftTime: (v: string) => void;
}) {
  const {
    task, subs, remainingForThis, liveLogged, anyActive, onClose, onSave,
    onComplete, onStart, onStop, onToggleDue, onAddSubtask, onToggleSubtaskDone, onDeleteSubtask,
    onDelete, onSaveInfo,
    subDraftText, subDraftTime, setSubDraftText, setSubDraftTime,
  } = props;

  const [text, setText] = useState(task.text);
  const [timeStr, setTimeStr] = useState(fmtMins(task.estimate_mins));
  const [surfaceDate, setSurfaceDate] = useState(task.surface_date || '');
  const [locationText, setLocationText] = useState(task.location_text || '');
  const [locationCoords, setLocationCoords] = useState<{ lat: number; lng: number } | null>(
    task.lat != null && task.lng != null ? { lat: task.lat, lng: task.lng } : null
  );
  const [error, setError] = useState('');

  useEffect(() => {
    setText(task.text);
    setTimeStr(fmtMins(task.estimate_mins));
    setSurfaceDate(task.surface_date || '');
    setLocationText(task.location_text || '');
    setLocationCoords(task.lat != null && task.lng != null ? { lat: task.lat, lng: task.lng } : null);
    setError('');
  }, [task.id]);

  function commit() {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      setError('Name cannot be empty');
      return;
    }
    const mins = parseMins(timeStr);
    // 0 is valid — that's what makes this a list item / reminder rather
    // than a timed task. Only reject unparseable or negative input.
    if (mins === null || mins < 0) {
      setError('Could not read that time, try 15m, 1.5h, or 0m');
      return;
    }
    setError('');
    onSave(
      task.id,
      trimmed,
      mins,
      surfaceDate.length > 0 ? surfaceDate : null,
      locationText.trim().length > 0 ? locationText.trim() : null,
      locationCoords?.lat ?? null,
      locationCoords?.lng ?? null
    );
  }

  function handleClose() {
    commit();
    onClose();
  }

  const startDisabled = anyActive && task.status !== 'active';

  return (
    <div className="sheet-backdrop" onClick={handleClose}>
      <div className="capture-sheet task-detail-sheet" onClick={(e) => e.stopPropagation()}>
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
          <input type="text" value={timeStr} onChange={(e) => setTimeStr(e.target.value)} onBlur={commit} style={{ width: 90 }} />
          <button
            className={task.due_today ? 'btn btn-steel' : 'btn btn-ghost'}
            style={{ flex: 1 }}
            onClick={() => onToggleDue(task.id, task.due_today)}
          >
            {task.due_today ? '✓ Due today' : 'Due today'}
          </button>
        </div>
        {error && <p style={{ color: 'var(--hazard)', fontSize: 12, margin: 0 }}>{error}</p>}

        <span className="settings-label">Location (optional)</span>
        <LocationAutocomplete
          value={locationText}
          placeholder="Where does this happen?"
          onChange={setLocationText}
          onPlaceSelected={(result) => {
            setLocationText(result.formattedAddress);
            setLocationCoords({ lat: result.lat, lng: result.lng });
          }}
        />
        {locationText.length > 0 && !locationCoords && (
          <p style={{ fontSize: 11, color: 'var(--ink-faint)', margin: 0 }}>
            Pick a suggestion from the list so this can factor into route-aware capacity.
          </p>
        )}

        <div className="reminder-date-row">
          <input
            type="date"
            value={surfaceDate}
            onChange={(e) => setSurfaceDate(e.target.value)}
            onBlur={commit}
          />
          {surfaceDate.length > 0 && (
            <button className="btn-text" onClick={() => { setSurfaceDate(''); commit(); }}>
              Clear
            </button>
          )}
        </div>
        {surfaceDate.length > 0 && (
          <p style={{ color: 'var(--ink-soft)', fontSize: 12, margin: 0 }}>
            Hidden from your list until {fmtSurfaceDate(surfaceDate)}.
          </p>
        )}

        <span className="settings-label">Information</span>
        <TaskInfo
          value={task.info || ''}
          onSave={(info) => onSaveInfo(task.id, info)}
          surface="edit"
        />

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
            Complete
          </button>
        </div>

        <div className="subtask-panel">
          <div className="settings-panel-title">Sub-tasks</div>
          {subs.map((s) => (
            <div key={s.id} className="subtask-row">
              <button
                className={s.done ? 'subtask-check done' : 'subtask-check'}
                onClick={() => onToggleSubtaskDone(s.id, task.id, s.done)}
                aria-label="Complete sub-task"
              />
              <span className={s.done ? 'subtask-text done' : 'subtask-text'}>{s.text}</span>
              <span className="tag mono">{fmtMins(s.mins)}</span>
              <button className="icon-btn" onClick={() => onDeleteSubtask(s.id, task.id)} aria-label="Delete sub-task">×</button>
            </div>
          ))}
          <div className="subtask-add-row">
            <input
              type="text"
              placeholder="Sub-task"
              value={subDraftText}
              onChange={(e) => setSubDraftText(e.target.value)}
            />
            <MicButton
              size="small"
              onResult={(text) =>
                setSubDraftText(subDraftText.trim().length > 0 ? `${subDraftText.trim()} ${text}` : text)
              }
            />
            <input
              type="text"
              placeholder="15m"
              style={{ width: 60 }}
              value={subDraftTime}
              onChange={(e) => setSubDraftTime(e.target.value)}
            />
            <button className="btn btn-ghost" style={{ padding: '4px 10px', minHeight: 32, fontSize: 12 }} onClick={() => onAddSubtask(task.id)}>add</button>
          </div>
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
