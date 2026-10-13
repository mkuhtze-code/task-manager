'use client';

import type { ComponentProps } from 'react';
import { PlusIcon } from '@/components/icons';
import { PostStopPrompt, type PostStopPromptState } from '@/components/PostStopPrompt';
import { TodayTaskRows } from '@/components/today/TodayTaskRows';

type TodayTaskListProps = {
  taskLoadError: string | null;
  emptyTitle: string;
  emptySub: string;
  showRealityCheck: boolean;
  onAdd: () => void;
  onRealityCheck: () => void;
  postStopPrompt: PostStopPromptState | null;
  postStopBusy: boolean;
  onPostStopDone: () => void;
  onPostStopStillGoing: () => void;
  scheduledCount: number;
  onOpenScheduled: () => void;
  rowProps: ComponentProps<typeof TodayTaskRows>;
};

export function TodayTaskList({
  taskLoadError,
  emptyTitle,
  emptySub,
  showRealityCheck,
  onAdd,
  onRealityCheck,
  postStopPrompt,
  postStopBusy,
  onPostStopDone,
  onPostStopStillGoing,
  scheduledCount,
  onOpenScheduled,
  rowProps,
}: TodayTaskListProps) {
  return (
    <div className="task-list">
      {postStopPrompt && (
        <PostStopPrompt
          prompt={postStopPrompt}
          busy={postStopBusy}
          onDone={onPostStopDone}
          onStillGoing={onPostStopStillGoing}
        />
      )}

      {taskLoadError ? (
        <div className="empty-state">
          <div className="empty-state-title">Couldn't load your tasks.</div>
          <div className="empty-state-sub">{taskLoadError}</div>
        </div>
      ) : (
        rowProps.rows.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-title">{emptyTitle}</div>
            <div className="empty-state-sub">{emptySub}</div>
            <div className="empty-state-actions">
              <button type="button" className="btn btn-steel" onClick={onAdd}>
                <PlusIcon size={16} /> Add
              </button>
              {showRealityCheck ? (
                <button type="button" className="btn-text" onClick={onRealityCheck}>
                  Reality check
                </button>
              ) : null}
            </div>
          </div>
        )
      )}

      <TodayTaskRows {...rowProps} />

      {scheduledCount > 0 && (
        <div className="scheduled-link-row">
          <button className="btn-text" onClick={onOpenScheduled}>
            {scheduledCount} scheduled for later
          </button>
        </div>
      )}
    </div>
  );
}
