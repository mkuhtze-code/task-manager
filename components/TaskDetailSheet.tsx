'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Subtask, Task, TaskContext } from '@/lib/taskTypes';
import type { Job } from '@/lib/jobTypes';
import { fmtMins, fmtSurfaceDate, parseMins } from '@/lib/timeFormat';
import {
  explainEstimate,
  type EstimateSuggestion,
} from '@/lib/taskIntelligence';
import { supabase } from '@/lib/supabaseClient';
import LocationAutocomplete from '@/components/LocationAutocomplete';
import MicButton from '@/components/MicButton';
import {
  CheckIcon,
  CloseIcon,
  PlayIcon,
  StopIcon,
} from '@/components/icons';
import { TaskInfo } from '@/components/TaskInfo';
import {
  TaskConnections,
  type SiblingTask,
  type ConnectedMeeting,
} from '@/components/TaskConnections';
import { TaskJobField } from '@/components/TaskJobField';
import { useDialogA11y } from '@/hooks/useDialogA11y';

type SubtaskFilter = 'all' | 'open' | 'done';
type SubtaskSort = 'original' | 'alpha' | 'time_asc' | 'time_desc';

export function TaskDetailSheet(props: {
  task: Task;
  subs: Subtask[];
  remainingForThis: number;
  liveLogged: number;
  anyActive: boolean;
  context: TaskContext;
  jobs: Job[];
  onClose: () => void;
  onSave: (
    id: string,
    text: string,
    mins: number,
    surfaceDate: string | null,
    locationText: string | null,
    lat: number | null,
    lng: number | null,
    requiresVisit?: boolean | null
  ) => void;
  onComplete: (id: string) => void;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onToggleDue: (id: string, current: boolean) => void;
  onAddSubtask: (id: string) => void;
  onToggleSubtaskDone: (
    subId: string,
    taskId: string,
    current: boolean
  ) => void;
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
  /** Travel override — only when Today sort mode is geo_aware. */
  showTravelPref?: boolean;
}) {
  const {
    task,
    subs,
    remainingForThis,
    liveLogged,
    anyActive,
    context,
    jobs,
    onClose,
    onSave,
    onComplete,
    onStart,
    onStop,
    onToggleDue,
    onAddSubtask,
    onToggleSubtaskDone,
    onDeleteSubtask,
    onDelete,
    onSaveInfo,
    onMoveToJob,
    subDraftText,
    subDraftTime,
    setSubDraftText,
    setSubDraftTime,
    presentation = 'sheet',
    meetings = [],
    siblingTasks = [],
    onOpenSibling,
    estimateSuggestion = null,
    showTravelPref = false,
  } = props;

  const [text, setText] = useState(task.text);
  const [timeStr, setTimeStr] = useState(
    fmtMins(task.estimate_mins)
  );
  const [surfaceDate, setSurfaceDate] = useState(
    task.surface_date || ''
  );
  const [locationText, setLocationText] = useState(
    task.location_text || ''
  );
  const [locationCoords, setLocationCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(
    task.lat != null && task.lng != null
      ? {
          lat: task.lat,
          lng: task.lng,
        }
      : null
  );
  /** null = auto; true = on route; false = place is context only */
  const [requiresVisit, setRequiresVisit] = useState<boolean | null>(
    task.requires_visit ?? null
  );

  const [showAddForm, setShowAddForm] = useState(false);
  const [error, setError] = useState('');

  /*
   * Sub-task workspace state.
   *
   * These are intentionally local to the detail surface:
   * - filtering never changes stored order
   * - sorting never changes stored order
   * - editing is committed directly to the existing row
   */
  const [subtaskFilter, setSubtaskFilter] =
    useState<SubtaskFilter>('all');

  const [subtaskSort, setSubtaskSort] =
    useState<SubtaskSort>('original');

  const [editingSubtaskId, setEditingSubtaskId] =
    useState<string | null>(null);

  const [editingSubtaskText, setEditingSubtaskText] =
    useState('');

  const [editingSubtaskTime, setEditingSubtaskTime] =
    useState('');

  const [subtaskError, setSubtaskError] =
    useState('');

  const [savingSubtaskId, setSavingSubtaskId] =
    useState<string | null>(null);

  /*
   * Keep a local representation so an edit is reflected immediately
   * without waiting for the parent Today/Jobs surface to refresh.
   */
  const [localSubs, setLocalSubs] =
    useState<Subtask[]>(subs);

  const estimateExplain = explainEstimate(
    estimateSuggestion,
    parseMins(timeStr) ?? task.estimate_mins
  );

  useEffect(() => {
    setText(task.text);
    setTimeStr(fmtMins(task.estimate_mins));
    setSurfaceDate(task.surface_date || '');
    setLocationText(task.location_text || '');
    setLocationCoords(
      task.lat != null && task.lng != null
        ? {
            lat: task.lat,
            lng: task.lng,
          }
        : null
    );
    setRequiresVisit(task.requires_visit ?? null);


    setShowAddForm(false);
    setError('');

    setEditingSubtaskId(null);
    setEditingSubtaskText('');
    setEditingSubtaskTime('');
    setSubtaskError('');
    setSavingSubtaskId(null);
    setSubtaskFilter('all');
    setSubtaskSort('original');
  }, [task.id]);

  useEffect(() => {
    setLocalSubs(subs);
  }, [subs]);

  function commit(visitOverride?: boolean | null) {
    const trimmed = text.trim();

    if (trimmed.length === 0) {
      setError('Name cannot be empty');
      return;
    }

    const mins = parseMins(timeStr);

    if (mins === null || mins < 0) {
      setError(
        'Could not read that time, try 15m, 1.5h, or 0m'
      );
      return;
    }

    setError('');

    const visit =
      visitOverride !== undefined ? visitOverride : requiresVisit;

    onSave(
      task.id,
      trimmed,
      mins,
      surfaceDate.length > 0 ? surfaceDate : null,
      locationText.trim().length > 0
        ? locationText.trim()
        : null,
      locationCoords?.lat ?? null,
      locationCoords?.lng ?? null,
      visit
    );
  }

  function handleClose() {
    commit();
    onClose();
  }

  const dialogRef = useDialogA11y(handleClose);

  const startDisabled =
    anyActive && task.status !== 'active';

  const isPane = presentation === 'pane';

  const linkedJob = task.job_id
    ? jobs.find((j) => j.id === task.job_id) ?? null
    : null;

  const jobName = linkedJob?.name ?? null;

  const progressPct =
    task.estimate_mins > 0
      ? Math.min(
          (1 -
            remainingForThis /
              Math.max(task.estimate_mins, 1)) *
            100,
          100
        )
      : 0;

  const completedSubtasks = localSubs.filter(
    (subtask) => subtask.done
  ).length;

  const visibleSubtasks = useMemo(() => {
    const filtered = localSubs.filter((subtask) => {
      if (subtaskFilter === 'open') {
        return !subtask.done;
      }

      if (subtaskFilter === 'done') {
        return subtask.done;
      }

      return true;
    });

    if (subtaskSort === 'original') {
      return filtered;
    }

    return [...filtered].sort((a, b) => {
      if (subtaskSort === 'alpha') {
        return a.text.localeCompare(
          b.text,
          undefined,
          {
            sensitivity: 'base',
          }
        );
      }

      if (subtaskSort === 'time_asc') {
        return a.mins - b.mins;
      }

      if (subtaskSort === 'time_desc') {
        return b.mins - a.mins;
      }

      return 0;
    });
  }, [
    localSubs,
    subtaskFilter,
    subtaskSort,
  ]);

  function beginEditSubtask(subtask: Subtask) {
    setEditingSubtaskId(subtask.id);
    setEditingSubtaskText(subtask.text);
    setEditingSubtaskTime(fmtMins(subtask.mins));
    setSubtaskError('');
  }

  function cancelEditSubtask() {
    setEditingSubtaskId(null);
    setEditingSubtaskText('');
    setEditingSubtaskTime('');
    setSubtaskError('');
  }

  async function saveSubtaskEdit(subtask: Subtask) {
    const nextText =
      editingSubtaskText.trim();

    if (nextText.length === 0) {
      setSubtaskError(
        'Sub-task name cannot be empty'
      );
      return;
    }

    const nextMins =
      parseMins(editingSubtaskTime);

    if (
      nextMins === null ||
      nextMins < 0
    ) {
      setSubtaskError(
        'Could not read that time, try 15m, 1.5h, or 0m'
      );
      return;
    }

    setSavingSubtaskId(subtask.id);
    setSubtaskError('');

    const { error: updateError } =
      await supabase
        .from('subtasks')
        .update({
          text: nextText,
          mins: nextMins,
        })
        .eq('id', subtask.id);

    if (updateError) {
      console.error(
        'Could not update sub-task:',
        updateError
      );

      setSubtaskError(
        'Could not save this sub-task'
      );
      setSavingSubtaskId(null);
      return;
    }

    setLocalSubs((current) =>
      current.map((item) =>
        item.id === subtask.id
          ? {
              ...item,
              text: nextText,
              mins: nextMins,
            }
          : item
      )
    );

    setSavingSubtaskId(null);
    cancelEditSubtask();
  }

  function handleSubtaskKeyDown(
    event: React.KeyboardEvent<HTMLInputElement>,
    subtask: Subtask
  ) {
    if (event.key === 'Enter') {
      event.preventDefault();
      void saveSubtaskEdit(subtask);
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      cancelEditSubtask();
    }
  }

  function handleSubtaskDelete(
    subtaskId: string,
    taskId: string
  ) {
    if (editingSubtaskId === subtaskId) {
      cancelEditSubtask();
    }

    setLocalSubs((current) =>
      current.filter(
        (item) => item.id !== subtaskId
      )
    );

    onDeleteSubtask(
      subtaskId,
      taskId
    );
  }

  function handleSubtaskToggle(
    subtask: Subtask
  ) {
    const nextDone = !subtask.done;

    setLocalSubs((current) =>
      current.map((item) =>
        item.id === subtask.id
          ? {
              ...item,
              done: nextDone,
            }
          : item
      )
    );

    onToggleSubtaskDone(
      subtask.id,
      task.id,
      subtask.done
    );
  }

  const subtasksBlock = (
    <div
      className={
        isPane
          ? 'desk-detail-panel'
          : 'subtask-panel'
      }
    >
      <div
        className={
          isPane
            ? 'desk-detail-panel-head'
            : 'subtask-header'
        }
      >
        <div
          className={
            isPane
              ? 'desk-detail-panel-title'
              : 'settings-panel-title'
          }
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            minWidth: 0,
          }}
        >
          <span>Sub-tasks</span>

          {localSubs.length > 0 && (
            <span className="mono desk-detail-count">
              {completedSubtasks}/{localSubs.length}
            </span>
          )}
        </div>

        <button
          type="button"
          className="subtask-add-btn"
          onClick={() =>
            setShowAddForm((current) => !current)
          }
          aria-expanded={showAddForm}
          aria-label={
            showAddForm
              ? 'Close sub-task form'
              : 'Add sub-task'
          }
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
            minHeight: 32,
            padding: '5px 11px',
            border:
              '1px solid var(--line-strong)',
            borderRadius: 999,
            background: showAddForm
              ? 'var(--wash)'
              : 'var(--paper)',
            color: 'var(--ink)',
            fontSize: 12,
            fontWeight: 600,
            lineHeight: 1,
            letterSpacing: '0.01em',
            whiteSpace: 'nowrap',
            cursor: 'pointer',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              fontSize: 16,
              fontWeight: 400,
              lineHeight: 0.8,
              marginTop: -1,
            }}
          >
            +
          </span>

          <span>
            {showAddForm
              ? 'Close'
              : 'Add'}
          </span>
        </button>
      </div>

      {showAddForm && (
        <div className="subtask-add-row">
          <input
            type="text"
            placeholder="Sub-task"
            value={subDraftText}
            onChange={(e) =>
              setSubDraftText(
                e.target.value
              )
            }
            autoFocus
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                subDraftText.trim().length > 0
              ) {
                event.preventDefault();
                onAddSubtask(task.id);
                setShowAddForm(false);
              }

              if (event.key === 'Escape') {
                event.preventDefault();
                setShowAddForm(false);
              }
            }}
          />

          <MicButton
            size="small"
            onResult={(spoken) =>
              setSubDraftText(
                subDraftText.trim().length > 0
                  ? `${subDraftText.trim()} ${spoken}`
                  : spoken
              )
            }
          />

          <input
            type="text"
            placeholder="15m"
            style={{ width: 60 }}
            value={subDraftTime}
            onChange={(e) =>
              setSubDraftTime(
                e.target.value
              )
            }
            aria-label="Sub-task estimate"
          />

          <button
            type="button"
            className="btn btn-ghost"
            style={{
              padding: '4px 10px',
              minHeight: 32,
              fontSize: 12,
            }}
            onClick={() => {
              onAddSubtask(task.id);
              setShowAddForm(false);
            }}
          >
            Add
          </button>
        </div>
      )}

      {localSubs.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            marginTop: 10,
            marginBottom: 8,
          }}
        >
          <div
            role="group"
            aria-label="Sub-task filter"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              padding: 3,
              border:
                '1px solid var(--line)',
              borderRadius: 999,
              background:
                'var(--surface-inset)',
            }}
          >
            {(
              [
                ['all', 'All'],
                ['open', 'Open'],
                ['done', 'Done'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() =>
                  setSubtaskFilter(value)
                }
                aria-pressed={
                  subtaskFilter === value
                }
                style={{
                  border: 0,
                  borderRadius: 999,
                  padding: '5px 9px',
                  background:
                    subtaskFilter === value
                      ? 'var(--paper-raised)'
                      : 'transparent',
                  color:
                    subtaskFilter === value
                      ? 'var(--ink)'
                      : 'var(--ink-faint)',
                  fontSize: 11,
                  fontWeight:
                    subtaskFilter === value
                      ? 650
                      : 550,
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <select
            value={subtaskSort}
            onChange={(event) =>
              setSubtaskSort(
                event.target.value as SubtaskSort
              )
            }
            aria-label="Order sub-tasks"
            style={{
              minHeight: 32,
              padding: '5px 9px',
              border:
                '1px solid var(--line)',
              borderRadius: 999,
              background:
                'var(--paper)',
              color:
                'var(--ink-soft)',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <option value="original">
              Order: Original
            </option>
            <option value="alpha">
              Order: A–Z
            </option>
            <option value="time_asc">
              Order: Shortest
            </option>
            <option value="time_desc">
              Order: Longest
            </option>
          </select>
        </div>
      )}

      {visibleSubtasks.map((s) => {
        const editing =
          editingSubtaskId === s.id;

        if (editing) {
          return (
            <div
              key={s.id}
              className="subtask-row"
              style={{
                alignItems: 'flex-start',
                padding:
                  '8px 0',
              }}
            >
              <button
                type="button"
                className={
                  s.done
                    ? 'subtask-check done'
                    : 'subtask-check'
                }
                onClick={() =>
                  handleSubtaskToggle(s)
                }
                aria-label={
                  s.done
                    ? `Mark "${s.text}" incomplete`
                    : `Complete "${s.text}"`
                }
              />

              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: 'flex',
                  flexDirection:
                    'column',
                  gap: 7,
                }}
              >
                <input
                  type="text"
                  value={
                    editingSubtaskText
                  }
                  onChange={(event) =>
                    setEditingSubtaskText(
                      event.target.value
                    )
                  }
                  autoFocus
                  aria-label="Sub-task name"
                  onKeyDown={(event) =>
                    handleSubtaskKeyDown(
                      event,
                      s
                    )
                  }
                  style={{
                    width: '100%',
                    boxSizing:
                      'border-box',
                    minHeight: 36,
                    padding:
                      '7px 9px',
                    border:
                      '1px solid var(--line-strong)',
                    borderRadius:
                      'var(--radius-sm)',
                    background:
                      'var(--paper)',
                    color:
                      'var(--ink)',
                    fontSize:
                      'var(--text-sm)',
                  }}
                />

                <div
                  style={{
                    display: 'flex',
                    alignItems:
                      'center',
                    gap: 7,
                    flexWrap:
                      'wrap',
                  }}
                >
                  <input
                    type="text"
                    value={
                      editingSubtaskTime
                    }
                    onChange={(event) =>
                      setEditingSubtaskTime(
                        event.target.value
                      )
                    }
                    aria-label="Sub-task estimate"
                    placeholder="15m"
                    onKeyDown={(event) =>
                      handleSubtaskKeyDown(
                        event,
                        s
                      )
                    }
                    style={{
                      width: 76,
                      minHeight: 32,
                      boxSizing:
                        'border-box',
                      padding:
                        '5px 8px',
                      border:
                        '1px solid var(--line)',
                      borderRadius:
                        'var(--radius-sm)',
                      background:
                        'var(--paper)',
                      color:
                        'var(--ink)',
                      fontSize: 12,
                    }}
                  />

                  <button
                    type="button"
                    className="btn btn-steel"
                    disabled={
                      savingSubtaskId ===
                      s.id
                    }
                    style={{
                      minHeight: 32,
                      padding:
                        '5px 10px',
                      fontSize: 12,
                    }}
                    onClick={() =>
                      void saveSubtaskEdit(
                        s
                      )
                    }
                  >
                    {savingSubtaskId ===
                    s.id
                      ? 'Saving…'
                      : 'Save'}
                  </button>

                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={
                      savingSubtaskId ===
                      s.id
                    }
                    style={{
                      minHeight: 32,
                      padding:
                        '5px 10px',
                      fontSize: 12,
                    }}
                    onClick={
                      cancelEditSubtask
                    }
                  >
                    Cancel
                  </button>
                </div>

                {subtaskError && (
                  <span
                    style={{
                      color:
                        'var(--hazard)',
                      fontSize: 11,
                    }}
                  >
                    {subtaskError}
                  </span>
                )}
              </div>
            </div>
          );
        }

        return (
          <div
            key={s.id}
            className="subtask-row"
            style={{
              minHeight: 36,
            }}
          >
            <button
              type="button"
              className={
                s.done
                  ? 'subtask-check done'
                  : 'subtask-check'
              }
              onClick={() =>
                handleSubtaskToggle(s)
              }
              aria-label={
                s.done
                  ? `Mark "${s.text}" incomplete`
                  : `Complete "${s.text}"`
              }
            />

            <button
              type="button"
              onClick={() =>
                beginEditSubtask(s)
              }
              aria-label={`Edit sub-task "${s.text}"`}
              style={{
                flex: 1,
                minWidth: 0,
                padding: '3px 0',
                border: 0,
                background:
                  'transparent',
                color: s.done
                  ? 'var(--ink-faint)'
                  : 'var(--ink)',
                textDecoration:
                  s.done
                    ? 'line-through'
                    : 'none',
                textAlign: 'left',
                fontSize:
                  'var(--text-sm)',
                lineHeight: 1.35,
                cursor: 'text',
              }}
            >
              {s.text}
            </button>

            <button
              type="button"
              onClick={() =>
                beginEditSubtask(s)
              }
              aria-label={`Edit estimate for "${s.text}"`}
              className="tag mono"
              style={{
                border: 0,
                cursor: 'pointer',
                background:
                  'var(--surface-inset)',
              }}
            >
              {fmtMins(s.mins)}
            </button>

            <button
              type="button"
              className="icon-btn"
              onClick={() =>
                handleSubtaskDelete(
                  s.id,
                  task.id
                )
              }
              aria-label={`Delete sub-task "${s.text}"`}
            >
              ×
            </button>
          </div>
        );
      })}

      {localSubs.length > 0 &&
        visibleSubtasks.length === 0 && (
          <div
            style={{
              padding:
                '14px 4px',
              color:
                'var(--ink-faint)',
              fontSize: 12,
            }}
          >
            {subtaskFilter === 'done'
              ? 'No completed sub-tasks.'
              : 'All sub-tasks are complete.'}
          </div>
        )}

      {localSubs.length === 0 &&
        !showAddForm &&
        isPane && (
          <p className="desk-detail-muted">
            Break this into steps if it helps.
          </p>
        )}
    </div>
  );

  if (isPane) {
    return (
      <div
        className="desk-pane-detail"
        ref={dialogRef}
        role="region"
        aria-label="Task detail"
      >
        <div className="desk-detail">
          <header className="desk-detail-toolbar">
            <div className="desk-detail-toolbar-left">
              <span className="desk-detail-kicker">
                Task
              </span>

              {task.due_today && (
                <span className="desk-detail-badge due">
                  Due today
                </span>
              )}

              {jobName && (
                <span className="desk-detail-badge">
                  {jobName}
                </span>
              )}
            </div>

            <button
              type="button"
              className="gear-btn"
              onClick={handleClose}
              aria-label="Close"
            >
              <CloseIcon />
            </button>
          </header>

          <input
            type="text"
            className="desk-detail-title"
            value={text}
            onChange={(e) =>
              setText(e.target.value)
            }
            onBlur={() => commit()}
            placeholder="Task name"
          />

          {task.estimate_mins > 0 && (
            <div className="desk-detail-progress">
              <div className="task-progress-track">
                <div
                  className="task-progress-fill"
                  style={{
                    width: `${progressPct}%`,
                  }}
                />
              </div>

              <div className="desk-detail-progress-meta mono">
                <span>
                  {fmtMins(remainingForThis)} left
                </span>

                {task.status === 'active' && (
                  <span className="desk-detail-live">
                    · {fmtMins(liveLogged)} logged
                  </span>
                )}
              </div>
            </div>
          )}

          {error && (
            <p className="desk-detail-error">
              {error}
            </p>
          )}

          <TaskConnections
            task={task}
            job={linkedJob}
            meetings={meetings}
            siblingTasks={siblingTasks}
            onOpenSibling={onOpenSibling}
          />

          {estimateExplain && (
            <p
              className="desk-detail-muted"
              style={{
                margin: '4px 0 8px',
              }}
            >
              {estimateExplain}
            </p>
          )}

          <div className="desk-detail-actions">
            {task.estimate_mins > 0 &&
              (task.status === 'active' ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() =>
                    onStop(task.id)
                  }
                >
                  <StopIcon />

                  Stop

                  <span
                    className="mono"
                    style={{
                      fontWeight: 600,
                    }}
                  >
                    {fmtMins(liveLogged)}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-steel"
                  disabled={startDisabled}
                  onClick={() =>
                    onStart(task.id)
                  }
                >
                  <PlayIcon />
                  Start
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
              <CheckIcon done />
              Done
            </button>

            <button
              type="button"
              className={
                task.due_today
                  ? 'btn btn-ghost active-due'
                  : 'btn btn-ghost'
              }
              onClick={() =>
                onToggleDue(
                  task.id,
                  !!task.due_today
                )
              }
            >
              {task.due_today
                ? 'Due today'
                : 'Mark due today'}
            </button>
          </div>

          <div className="desk-detail-grid">
            <section className="desk-detail-panel">
              <h3 className="desk-detail-panel-title">
                Schedule
              </h3>

              <label className="desk-detail-field">
                <span className="desk-detail-label">
                  Estimate
                </span>

                <input
                  type="text"
                  className="time-input desk-detail-input"
                  value={timeStr}
                  onChange={(e) =>
                    setTimeStr(e.target.value)
                  }
                  onBlur={() => commit()}
                  placeholder="15m"
                />
              </label>

              <label className="desk-detail-field">
                <span className="desk-detail-label">
                  {context === 'job'
                    ? 'When'
                    : 'Reminder'}
                </span>

                <div className="reminder-date-row">
                  <input
                    type="date"
                    className="desk-detail-input"
                    value={surfaceDate}
                    onChange={(e) =>
                      setSurfaceDate(
                        e.target.value
                      )
                    }
                    onBlur={() => commit()}
                  />

                  {surfaceDate.length > 0 && (
                    <button
                      type="button"
                      className="btn-text"
                      onClick={() => {
                        setSurfaceDate('');
                        commit();
                      }}
                    >
                      Clear
                    </button>
                  )}
                </div>

                {surfaceDate.length > 0 && (
                  <p className="desk-detail-muted">
                    Hidden until{' '}
                    {fmtSurfaceDate(
                      surfaceDate
                    )}
                    .
                  </p>
                )}
              </label>
            </section>

            <section className="desk-detail-panel">
              <h3 className="desk-detail-panel-title">
                Context
              </h3>

              <label className="desk-detail-field">
                <span className="desk-detail-label">
                  Location
                </span>

                <LocationAutocomplete
                  value={locationText}
                  placeholder="Where does this happen?"
                  onChange={setLocationText}
                  onPlaceSelected={(result) => {
                    setLocationText(
                      result.formattedAddress
                    );

                    setLocationCoords({
                      lat: result.lat,
                      lng: result.lng,
                    });
                  }}
                />

                {locationText.length > 0 &&
                  !locationCoords && (
                    <p className="desk-detail-muted">
                      Pick a suggestion for route-aware
                      capacity.
                    </p>
                  )}
              </label>

              {showTravelPref ? (
                <div className="desk-detail-field">
                  <span className="desk-detail-label">Travel</span>
                  <div className="day-toggle-row" role="group" aria-label="Travel">
                    <button
                      type="button"
                      className={
                        requiresVisit === null
                          ? 'day-toggle-btn pill active'
                          : 'day-toggle-btn pill'
                      }
                      aria-pressed={requiresVisit === null}
                      onClick={() => {
                        setRequiresVisit(null);
                        commit(null);
                      }}
                    >
                      Auto
                    </button>
                    <button
                      type="button"
                      className={
                        requiresVisit === true
                          ? 'day-toggle-btn pill active'
                          : 'day-toggle-btn pill'
                      }
                      aria-pressed={requiresVisit === true}
                      onClick={() => {
                        setRequiresVisit(true);
                        commit(true);
                      }}
                    >
                      On route
                    </button>
                    <button
                      type="button"
                      className={
                        requiresVisit === false
                          ? 'day-toggle-btn pill active'
                          : 'day-toggle-btn pill'
                      }
                      aria-pressed={requiresVisit === false}
                      onClick={() => {
                        setRequiresVisit(false);
                        commit(false);
                      }}
                    >
                      Not travel
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="desk-detail-field">
                <span className="desk-detail-label">
                  Job
                </span>

                <TaskJobField
                  jobs={jobs}
                  jobId={task.job_id}
                  onMoveToJob={(jobId) => {
                    onMoveToJob(
                      task.id,
                      jobId
                    );
                  }}
                />
              </div>
            </section>
          </div>

          <section className="desk-detail-panel desk-detail-panel-wide">
            <h3 className="desk-detail-panel-title">
              Notes
            </h3>

            <TaskInfo
              value={task.info || ''}
              onSave={(info) =>
                onSaveInfo(
                  task.id,
                  info
                )
              }
              surface="edit"
            />
          </section>

          {subtasksBlock}

          <footer className="desk-detail-footer">
            <button
              type="button"
              className="btn-text destructive"
              onClick={() => {
                if (
                  confirm(
                    `Delete "${task.text}"?`
                  )
                ) {
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
    <div
      className="sheet-backdrop"
      onClick={handleClose}
    >
      <div
        ref={dialogRef}
        className="capture-sheet task-detail-sheet"
        onClick={(e) =>
          e.stopPropagation()
        }
        role="dialog"
        aria-modal="true"
        aria-label="Task"
      >
        <div
          className="task-detail-header"
          style={{
            justifyContent: 'flex-end',
          }}
        >
          <button
            type="button"
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
          onChange={(e) =>
            setText(e.target.value)
          }
          onBlur={() => commit()}
        />

        {task.estimate_mins > 0 && (
          <div
            className="task-progress-row"
            style={{
              marginTop: 0,
            }}
          >
            <div className="task-progress-track">
              <div
                className="task-progress-fill"
                style={{
                  width: `${progressPct}%`,
                }}
              />
            </div>

            <span className="task-progress-label mono">
              {fmtMins(remainingForThis)} left
            </span>
          </div>
        )}

        <div className="capture-row">
          <button
            type="button"
            className={
              task.due_today
                ? 'btn-quiet active'
                : 'btn-quiet'
            }
            onClick={() =>
              onToggleDue(
                task.id,
                !!task.due_today
              )
            }
          >
            {task.due_today
              ? 'Due today'
              : 'Mark due today'}
          </button>

          <input
            type="text"
            className="time-input"
            value={timeStr}
            onChange={(e) =>
              setTimeStr(e.target.value)
            }
            onBlur={() => commit()}
            placeholder="15m"
            aria-label="Estimate"
          />
        </div>

        {error && (
          <p
            style={{
              color: 'var(--hazard)',
              fontSize: 12,
              margin: 0,
            }}
          >
            {error}
          </p>
        )}

        {estimateExplain && (
          <p
            className="settings-help"
            style={{
              margin: '2px 0 6px',
            }}
          >
            {estimateExplain}
          </p>
        )}

        <span className="settings-label">
          Location (optional)
        </span>

        <LocationAutocomplete
          value={locationText}
          placeholder="Where does this happen?"
          onChange={setLocationText}
          onPlaceSelected={(result) => {
            setLocationText(
              result.formattedAddress
            );

            setLocationCoords({
              lat: result.lat,
              lng: result.lng,
            });
          }}
        />

        {showTravelPref ? (
          <div>
            <span className="settings-label">Travel</span>
            <div className="day-toggle-row" role="group" aria-label="Travel">
              <button
                type="button"
                className={
                  requiresVisit === null
                    ? 'day-toggle-btn pill active'
                    : 'day-toggle-btn pill'
                }
                aria-pressed={requiresVisit === null}
                onClick={() => {
                  setRequiresVisit(null);
                  commit(null);
                }}
              >
                Auto
              </button>
              <button
                type="button"
                className={
                  requiresVisit === true
                    ? 'day-toggle-btn pill active'
                    : 'day-toggle-btn pill'
                }
                aria-pressed={requiresVisit === true}
                onClick={() => {
                  setRequiresVisit(true);
                  commit(true);
                }}
              >
                On route
              </button>
              <button
                type="button"
                className={
                  requiresVisit === false
                    ? 'day-toggle-btn pill active'
                    : 'day-toggle-btn pill'
                }
                aria-pressed={requiresVisit === false}
                onClick={() => {
                  setRequiresVisit(false);
                  commit(false);
                }}
              >
                Not travel
              </button>
            </div>
          </div>
        ) : null}


        <span className="settings-label">
          {context === 'job'
            ? 'When'
            : 'Reminder'}
        </span>

        <div className="reminder-date-row">
          <input
            type="date"
            value={surfaceDate}
            onChange={(e) =>
              setSurfaceDate(
                e.target.value
              )
            }
            onBlur={() => commit()}
          />

          {surfaceDate.length > 0 && (
            <button
              type="button"
              className="btn-text"
              onClick={() => {
                setSurfaceDate('');
                commit();
              }}
            >
              Clear
            </button>
          )}
        </div>

        <span className="settings-label">
          Information
        </span>

        <TaskInfo
          value={task.info || ''}
          onSave={(info) =>
            onSaveInfo(
              task.id,
              info
            )
          }
          surface="edit"
        />

        <div className="task-detail-job-section">
          <div className="task-detail-job-section-head">
            <span className="settings-label">
              Job
            </span>

            <span className="task-detail-job-section-hint">
              Optional
            </span>
          </div>

          <TaskJobField
            jobs={jobs}
            jobId={task.job_id}
            onMoveToJob={(jobId) => {
              onMoveToJob(
                task.id,
                jobId
              );
            }}
          />
        </div>

        <div className="task-detail-actions">
          {task.estimate_mins > 0 &&
            (task.status === 'active' ? (
              <button
                type="button"
                className="btn btn-ghost start-stop-btn"
                style={{ flex: 1 }}
                onClick={() =>
                  onStop(task.id)
                }
              >
                <StopIcon />

                Stop

                <span
                  className="mono"
                  style={{
                    fontWeight: 600,
                  }}
                >
                  {fmtMins(liveLogged)}
                </span>
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-steel start-stop-btn"
                style={{ flex: 1 }}
                disabled={startDisabled}
                onClick={() =>
                  onStart(task.id)
                }
              >
                <PlayIcon />
                Start
              </button>
            ))}

          <button
            type="button"
            className="btn btn-ghost"
            style={{ flex: 1 }}
            onClick={() => {
              onComplete(task.id);
              onClose();
            }}
          >
            <CheckIcon done />
            Done
          </button>
        </div>

        {subtasksBlock}

        <button
          type="button"
          className="btn btn-ghost danger-btn task-detail-delete"
          onClick={() => {
            if (
              confirm(
                `Delete "${task.text}"?`
              )
            ) {
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
