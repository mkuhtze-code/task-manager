'use client';

import type { Task } from '@/lib/taskTypes';
import { fmtSurfaceDate } from '@/lib/timeFormat';
import { CloseIcon } from '@/components/icons';
import { useDialogA11y } from '@/hooks/useDialogA11y';

export function ScheduledSheet(props: {
  tasks: Task[];
  onClose: () => void;
  onOpenTask: (id: string) => void;
}) {
  const { tasks, onClose, onOpenTask } = props;
  const dialogRef = useDialogA11y(onClose);
  const sorted = [...tasks].sort((a, b) => (a.surface_date || '').localeCompare(b.surface_date || ''));

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div ref={dialogRef} className="capture-sheet task-detail-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Scheduled tasks">
        <div className="task-detail-header">
          <div className="settings-panel-title">Scheduled</div>
          <button className="gear-btn" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        {sorted.length === 0 ? (
          <p className="settings-help">Nothing scheduled for later.</p>
        ) : (
          sorted.map((t) => (
            <div key={t.id} className="scheduled-item">
              <span className="scheduled-item-text">{t.text}</span>
              <button
                className="tag-reminder tag"
                style={{ border: 'none', cursor: 'pointer' }}
                onClick={() => { onOpenTask(t.id); onClose(); }}
                aria-label="Edit reminder"
              >
                {t.surface_date ? fmtSurfaceDate(t.surface_date) : ''}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
