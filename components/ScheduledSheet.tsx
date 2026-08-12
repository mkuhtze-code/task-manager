'use client';

import type { Task } from '@/lib/taskTypes';
import { fmtSurfaceDate } from '@/lib/timeFormat';

export function ScheduledSheet(props: {
  tasks: Task[];
  onClose: () => void;
  onOpenTask: (id: string) => void;
}) {
  const { tasks, onClose, onOpenTask } = props;
  const sorted = [...tasks].sort((a, b) => (a.surface_date || '').localeCompare(b.surface_date || ''));

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="capture-sheet task-detail-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="task-detail-header">
          <div className="settings-panel-title">Scheduled</div>
          <button className="btn-text" onClick={onClose}>Close</button>
        </div>
        {sorted.length === 0 ? (
          <p style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Nothing scheduled for later.</p>
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
