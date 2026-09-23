'use client';

import { useEffect, useState } from 'react';
import type { Subtask, Task, TaskContext } from '@/lib/taskTypes';
import type { Job } from '@/lib/jobTypes';
import { fmtMins, fmtSurfaceDate, parseMins } from '@/lib/timeFormat';
import { explainEstimate, type EstimateSuggestion } from '@/lib/taskIntelligence';
import LocationAutocomplete from '@/components/LocationAutocomplete';
import MicButton from '@/components/MicButton';
import { CheckIcon, ChevronIcon, CloseIcon, PlayIcon, StopIcon } from '@/components/icons';
import { TaskInfo } from '@/components/TaskInfo';
import { TaskConnections, type SiblingTask, type ConnectedMeeting } from '@/components/TaskConnections';

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
  presentation?: 'sheet' | 'pane';
  meetings?: ConnectedMeeting[];
  siblingTasks?: SiblingTask[];
  onOpenSibling?: (taskId: string) => void;
  /** Learned estimate basis — same path as capture/capacity. */
  estimateSuggestion?: EstimateSuggestion | null;
}) {
  const {
    task, subs, remainingForThis, liveLogged, anyActive, context, jobs, onClose, onSave,
    onComplete, onStart, onStop, onToggleDue, onAddSubtask, onToggleSubtaskDone, onDeleteSubtask,
    onDelete, onSaveInfo, onMoveToJob,
    subDraftText, subDraftTime, setSubDraftText, setSubDraftTime,
    presentation = 'sheet',
    meetings = [],
    siblingTasks = [],
    onOpenSibling,
    estimateSuggestion = null,
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

  const estimateExplain = explainEstimate(
    estimateSuggestion,
    parseMins(timeStr) ?? task.estimate_mins
  );

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
  const isPane = presentation === 'pane';
  const linkedJob = task.job_id ? jobs.find((j) => j.id === task.job_id) ?? null : null;
  const jobName = linkedJob?.name ?? null;
  const progressPct =
    task.estimate_mins > 0
      ? Math.min((1 - remainingForThis / Math.max(task.estimate_mins, 1)) * 100, 100)
      : 0;

  const subtasksBlock = (
    <div className={isPane ? 'desk-detail-panel' : 'subtask-panel'}>
      <div className={isPane ? 'desk-detail-panel-head' : 'subtask-header'}>
        <div className={isPane ? 'desk-detail-panel-title' : 'settings-panel-title'}>
          Sub-tasks
          {subs.length > 0 && (
            <span className="mono desk-detail-count">
              {subs.filter((s) => s.done).length}/{subs.length}
            </span>
          )}
        </div>
        <button type="button" className="subtask-add-btn" onClick={() => setShowAddForm(!showAddForm)}>
          +
        </button>
      </div>
      {showAddForm && (
        <div className="subtask-add-row">
          <input type="text" placeholder="Sub-task" value={subDraftText} onChange={(e) => setSubDraftText(e.target.value)} />
          <MicButton
            size="small"
            onResult={(spoken) =>
              setSubDraftText(subDraftText.trim().length > 0 ? `${subDraftText.trim()} ${spoken}` : spoken)
            }
          />
          <input type="text" placeholder="15m" style={{ width: 60 }} value={subDraftTime} onChange={(e) => setSubDraftTime(e.target.value)} />
          <button
            className="btn btn-ghost"
            style={{ padding: '4px 10px', minHeight: 32, fontSize: 12 }}
            onClick={() => {
              onAddSubtask(task.id);
              setShowAddForm(false);
            }}
          >
            add
          </button>
        </div>
      )}
      {subs.map((s) => (
        <div key={s.id} className="subtask-row">
          <button
            className={s.done ? 'subtask-check done' : 'subtask-check'}
            onClick={() => onToggleSubtaskDone(s.id, task.id, s.done)}
            aria-label="Complete sub-task"
          />
          <span className={s.done ? 'subtask-text done' : 'subtask-text'}>{s.text}</span>
          <span className="tag mono">{fmtMins(s.mins)}</span>
          <button className="icon-btn" onClick={() => onDeleteSubtask(s.id, task.id)} aria-label="Delete sub-task">
            ×
          </button>
        </div>
      ))}
      {subs.length === 0 && !showAddForm && isPane && (
        <p className="desk-detail-muted">Break this into steps if it helps.</p>
      )}
    </div>
  );

  if (isPane) {
    return (
      <div className="desk-pane-detail">
        <div className="desk-detail">
          <header className="desk-detail-toolbar">
            <div className="desk-detail-toolbar-left">
              <span className="desk-detail-kicker">Task</span>
              {task.due_today && <span className="desk-detail-badge due">Due today</span>}
              {jobName && <span className="desk-detail-badge">{jobName}</span>}
            </div>
            <button type="button" className="gear-btn" onClick={handleClose} aria-label="Close">
              <CloseIcon />
            </button>
          </header>

          <input
            type="text"
            className="desk-detail-title"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            placeholder="Task name"
          />

          {task.estimate_mins > 0 && (
            <div className="desk-detail-progress">
              <div className="task-progress-track">
                <div className="task-progress-fill" style={{ width: `${progressPct}%` }} />
              </div>
              <div className="desk-detail-progress-meta mono">
                <span>{fmtMins(remainingForThis)} left</span>
                {task.status === 'active' && (
                  <span className="desk-detail-live">· {fmtMins(liveLogged)} logged</span>
                )}
              </div>
            </div>
          )}

          {error && <p className="desk-detail-error">{error}</p>}

          <TaskConnections
            task={task}
            job={linkedJob}
            meetings={meetings}
            siblingTasks={siblingTasks}
            onOpenSibling={onOpenSibling}
          />

          {estimateExplain && (
            <p className="desk-detail-muted" style={{ margin: '4px 0 8px' }}>
              {estimateExplain}
            </p>
          )}

          <div className="desk-detail-actions">
            {task.estimate_mins > 0 &&
              (task.status === 'active' ? (
                <button type="button" className="btn btn-ghost" onClick={() => onStop(task.id)}>
                  <StopIcon /> Stop
                  <span className="mono" style={{ fontWeight: 600 }}>{fmtMins(liveLogged)}</span>
                </button>
              ) : (
                <button type="button" className="btn btn-steel" disabled={startDisabled} onClick={() => onStart(task.id)}>
                  <PlayIcon /> Start
                </button>
              ))}
            <button
              type="button"
              className="btn btn-steel"
              onClick={() => {
                onComplete(task.id);
                onClose();
              }}
            >
              <CheckIcon done /> Done
            </button>
            <button
              type="button"
              className={task.due_today ? 'btn btn-ghost active-due' : 'btn btn-ghost'}
              onClick={() => onToggleDue(task.id, !!task.due_today)}
            >
              {task.due_today ? 'Due today' : 'Mark due today'}
            </button>
          </div>

          <div className="desk-detail-grid">
            <section className="desk-detail-panel">
              <h3 className="desk-detail-panel-title">Schedule</h3>
              <label className="desk-detail-field">
                <span className="desk-detail-label">Estimate</span>
                <input
                  type="text"
                  className="time-input desk-detail-input"
                  value={timeStr}
                  onChange={(e) => setTimeStr(e.target.value)}
                  onBlur={commit}
                  placeholder="15m"
                />
              </label>
              <label className="desk-detail-field">
                <span className="desk-detail-label">{context === 'job' ? 'When' : 'Reminder'}</span>
                <div className="reminder-date-row">
                  <input
                    type="date"
                    className="desk-detail-input"
                    value={surfaceDate}
                    onChange={(e) => setSurfaceDate(e.target.value)}
                    onBlur={commit}
                  />
                  {surfaceDate.length > 0 && (
                    <button type="button" className="btn-text" onClick={() => { setSurfaceDate(''); commit(); }}>
                      Clear
                    </button>
                  )}
                </div>
                {surfaceDate.length > 0 && (
                  <p className="desk-detail-muted">Hidden until {fmtSurfaceDate(surfaceDate)}.</p>
                )}
              </label>
            </section>

            <section className="desk-detail-panel">
              <h3 className="desk-detail-panel-title">Context</h3>
              <label className="desk-detail-field">
                <span className="desk-detail-label">Location</span>
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
                  <p className="desk-detail-muted">Pick a suggestion for route-aware capacity.</p>
                )}
              </label>
              <div className="desk-detail-field">
                <span className="desk-detail-label">Job</span>
                <button
                  type="button"
                  className={jobMoveOpen ? 'detail-reveal active desk-detail-job-btn' : 'detail-reveal desk-detail-job-btn'}
                  onClick={() => setJobMoveOpen((o) => !o)}
                >
                  <span>{jobName || 'No job'}</span>
                  <ChevronIcon size={14} />
                </button>
                {jobMoveOpen && (
                  <div className="move-day-list desk-detail-job-list">
                    <button type="button" className="move-day-option" onClick={() => { onMoveToJob(task.id, null); setJobMoveOpen(false); }}>
                      No job
                    </button>
                    {jobs.map((j) => (
                      <button
                        key={j.id}
                        type="button"
                        className="move-day-option"
                        onClick={() => { onMoveToJob(task.id, j.id); setJobMoveOpen(false); }}
                      >
                        {j.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>

          <section className="desk-detail-panel desk-detail-panel-wide">
            <h3 className="desk-detail-panel-title">Notes</h3>
            <TaskInfo value={task.info || ''} onSave={(info) => onSaveInfo(task.id, info)} surface="edit" />
          </section>

          {subtasksBlock}

          <footer className="desk-detail-footer">
            <button
              type="button"
              className="btn-text destructive"
              onClick={() => {
                if (confirm(`Delete "${task.text}"?`)) {
                  onDelete(task.id);
                  onClose();
                }
              }}
            >
              Delete task
            </button>
          </footer>
        </div>
      </div>
    );
  }

  return (
    <div className="sheet-backdrop" onClick={handleClose}>
      <div className="capture-sheet task-detail-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="task-detail-header" style={{ justifyContent: 'flex-end' }}>
          <button className="gear-btn" onClick={handleClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <input type="text" className="task-detail-name" value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} />

        {task.estimate_mins > 0 && (
          <div className="task-progress-row" style={{ marginTop: 0 }}>
            <div className="task-progress-track">
              <div className="task-progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
            <span className="task-progress-label mono">{fmtMins(remainingForThis)} left</span>
          </div>
        )}

        <div className="capture-row">
          <button
            type="button"
            className={task.due_today ? 'btn-quiet active' : 'btn-quiet'}
            onClick={() => onToggleDue(task.id, !!task.due_today)}
          >
            {task.due_today ? 'Due today' : 'Mark due today'}
          </button>
          <input
            type="text"
            className="time-input"
            value={timeStr}
            onChange={(e) => setTimeStr(e.target.value)}
            onBlur={commit}
            placeholder="15m"
            aria-label="Estimate"
          />
        </div>

        {error && <p style={{ color: 'var(--hazard)', fontSize: 12, margin: 0 }}>{error}</p>}

        {estimateExplain && (
          <p className="settings-help" style={{ margin: '2px 0 6px' }}>
            {estimateExplain}
          </p>
        )}

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

        <span className="settings-label">{context === 'job' ? 'When' : 'Reminder'}</span>
        <div className="reminder-date-row">
          <input type="date" value={surfaceDate} onChange={(e) => setSurfaceDate(e.target.value)} onBlur={commit} />
          {surfaceDate.length > 0 && (
            <button className="btn-text" onClick={() => { setSurfaceDate(''); commit(); }}>
              Clear
            </button>
          )}
        </div>

        <span className="settings-label">Information</span>
        <TaskInfo value={task.info || ''} onSave={(info) => onSaveInfo(task.id, info)} surface="edit" />

        <button
          type="button"
          className={jobMoveOpen ? 'detail-reveal active' : 'detail-reveal'}
          onClick={() => setJobMoveOpen((o) => !o)}
        >
          <span>{task.job_id ? 'Filed under a job' : 'Add to a job'}</span>
          <ChevronIcon size={14} />
        </button>
        {jobMoveOpen && (
          <div className="move-day-list">
            <button type="button" className="move-day-option" onClick={() => onMoveToJob(task.id, null)}>
              No job
            </button>
            {jobs.map((j) => (
              <button key={j.id} type="button" className="move-day-option" onClick={() => onMoveToJob(task.id, j.id)}>
                {j.name}
              </button>
            ))}
          </div>
        )}

        <div className="task-detail-actions">
          {task.estimate_mins > 0 &&
            (task.status === 'active' ? (
              <button className="btn btn-ghost start-stop-btn" style={{ flex: 1 }} onClick={() => onStop(task.id)}>
                <StopIcon /> Stop <span className="mono" style={{ fontWeight: 600 }}>{fmtMins(liveLogged)}</span>
              </button>
            ) : (
              <button className="btn btn-steel start-stop-btn" style={{ flex: 1 }} disabled={startDisabled} onClick={() => onStart(task.id)}>
                <PlayIcon /> Start
              </button>
            ))}
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { onComplete(task.id); onClose(); }}>
            <CheckIcon done /> Done
          </button>
        </div>

        {subtasksBlock}

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
