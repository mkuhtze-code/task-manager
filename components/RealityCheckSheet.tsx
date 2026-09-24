'use client';

import { useMemo, useState } from 'react';
import type { Task } from '@/lib/taskTypes';
import { fmtMins } from '@/lib/timeFormat';
import {
  type RealityOutcome,
  type RealityUpdate,
  buildRealityPrefillMaps,
} from '@/lib/realityCapture';
import { CloseIcon } from '@/components/icons';
import { useDialogA11y } from '@/hooks/useDialogA11y';

type Props = {
  tasks: Task[];
  onClose: () => void;
  onReshape: (updates: RealityUpdate[]) => void | Promise<void>;
  busy?: boolean;
};

const OUTCOMES: { key: RealityOutcome; label: string }[] = [
  { key: 'done', label: 'Done' },
  { key: 'partial', label: 'Partial' },
  { key: 'carried', label: 'Carry' },
  { key: 'skipped', label: 'Skip' },
];

/**
 * Reality Check — confirmation over data entry.
 * Prefills Done + minutes only when Dokkit already has recorded time.
 * Everything else stays Carry. Quiet language; user can change any row.
 */
export function RealityCheckSheet({ tasks, onClose, onReshape, busy }: Props) {
  const dialogRef = useDialogA11y(onClose);

  const prefill = useMemo(() => buildRealityPrefillMaps(tasks), [tasks]);

  const [outcomes, setOutcomes] = useState<Record<string, RealityOutcome>>(
    () => prefill.outcomes
  );
  const [actualMins, setActualMins] = useState<Record<string, number | undefined>>(
    () => prefill.actualMins
  );

  const suggestedCount = useMemo(
    () => tasks.filter((t) => prefill.outcomes[t.id] === 'done').length,
    [tasks, prefill.outcomes]
  );

  function setOutcome(taskId: string, outcome: RealityOutcome) {
    setOutcomes((prev) => ({ ...prev, [taskId]: outcome }));
  }

  function handleReshape() {
    const updates: RealityUpdate[] = tasks.map((t) => {
      const outcome = outcomes[t.id] ?? 'carried';
      const userActual = actualMins[t.id];
      const logged = t.logged_mins > 0 ? Math.round(t.logged_mins) : null;
      return {
        taskId: t.id,
        outcome,
        actualMins:
          outcome === 'done' || outcome === 'partial'
            ? userActual ?? logged ?? null
            : null,
        remainingMins:
          outcome === 'partial'
            ? Math.max(5, Math.round(t.estimate_mins / 2))
            : null,
      };
    });
    void onReshape(updates);
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="capture-sheet task-detail-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reality-check-title"
      >
        <div className="task-detail-header">
          <div className="settings-panel-title" id="reality-check-title">
            Reality check
          </div>
          <button className="gear-btn" onClick={onClose} aria-label="Close" type="button">
            <CloseIcon />
          </button>
        </div>

        <p className="settings-help" style={{ margin: '0 0 var(--space-3)' }}>
          {suggestedCount > 0
            ? 'A few rows reflect time already recorded. Change anything that isn’t right.'
            : 'Mark what happened when you know. Carry is fine when you’re not sure.'}
        </p>

        {tasks.length === 0 ? (
          <p className="settings-help">Nothing needed a check today.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {tasks.map((task) => {
              const outcome = outcomes[task.id] ?? 'carried';
              const sourceLabel = prefill.sourceLabels[task.id];
              return (
                <div
                  key={task.id}
                  className="reality-task-row"
                  style={{
                    background: 'var(--paper)',
                    borderRadius: 14,
                    padding: '12px',
                  }}
                >
                  <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{task.text}</div>
                  <div
                    className="mono"
                    style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 2 }}
                  >
                    {fmtMins(task.estimate_mins)}
                    {sourceLabel && outcome === 'done' && actualMins[task.id] != null
                      ? ` · ${sourceLabel.toLowerCase()} (${fmtMins(actualMins[task.id]!)})`
                      : ''}
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(4, 1fr)',
                      gap: 6,
                      marginTop: 10,
                    }}
                  >
                    {OUTCOMES.map(({ key, label }) => {
                      const selected = outcome === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          className={selected ? 'segmented-btn active' : 'segmented-btn'}
                          style={{ minHeight: 36, fontSize: 12 }}
                          aria-pressed={selected}
                          onClick={() => setOutcome(task.id, key)}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>

                  {(outcome === 'done' || outcome === 'partial') && (
                    <div style={{ marginTop: 10 }}>
                      <div className="settings-help" style={{ marginBottom: 6 }}>
                        {outcome === 'done' ? 'Time taken' : 'Time spent so far'}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {(outcome === 'done'
                          ? [
                              {
                                label: 'Less',
                                mins: Math.max(5, Math.round(task.estimate_mins * 0.7)),
                              },
                              {
                                label:
                                  actualMins[task.id] != null
                                    ? fmtMins(actualMins[task.id]!)
                                    : 'About right',
                                mins:
                                  actualMins[task.id] ??
                                  (task.logged_mins > 0
                                    ? Math.round(task.logged_mins)
                                    : task.estimate_mins),
                              },
                              {
                                label: 'Longer',
                                mins: Math.round(task.estimate_mins * 1.4),
                              },
                            ]
                          : [
                              {
                                label: 'Less',
                                mins: Math.max(5, Math.round(task.estimate_mins * 0.3)),
                              },
                              {
                                label: 'Half',
                                mins: Math.max(5, Math.round(task.estimate_mins * 0.5)),
                              },
                              {
                                label: 'More',
                                mins: Math.max(5, Math.round(task.estimate_mins * 0.7)),
                              },
                            ]
                        ).map(({ label, mins }) => {
                          const selected = actualMins[task.id] === mins;
                          return (
                            <button
                              key={label + String(mins)}
                              type="button"
                              className={
                                selected ? 'estimate-suggestion-chip' : 'move-day-option'
                              }
                              onClick={() =>
                                setActualMins((prev) => ({ ...prev, [task.id]: mins }))
                              }
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div
          style={{
            marginTop: 'var(--space-4)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <button
            type="button"
            className="btn btn-steel"
            style={{ width: '100%' }}
            disabled={busy || tasks.length === 0}
            onClick={handleReshape}
          >
            {busy ? 'Updating…' : 'Apply what happened'}
          </button>
          <button type="button" className="btn-text" onClick={onClose}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
