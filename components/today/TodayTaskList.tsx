'use client';

import type { ComponentProps } from 'react';
import { PostStopPrompt, type PostStopPromptState } from '@/components/PostStopPrompt';
import { TodayTaskRows } from '@/components/today/TodayTaskRows';

type TodayTaskListProps = {
  taskLoadError: string | null;
  openCount: number;
  isDesktop: boolean;
  emptyTitle: string;
  emptySub: string;
  showRealityCheck: boolean;
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
  openCount,
  isDesktop,
  emptyTitle,
  emptySub,
  showRealityCheck,
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
      {!isDesktop ? (
        <header className="experience-work-list-heading">
          <div className="experience-work-list-heading__identity">
            <h2 id="experience-work-heading">Tasks</h2>
          </div>
          <p className="experience-work-list-heading__measure" aria-label={`${openCount} open tasks`}>
            <strong>{openCount}</strong>
            <span>{openCount === 1 ? "open task" : "open tasks"}</span>
          </p>
        </header>
      ) : null}
      {postStopPrompt && (
        <PostStopPrompt
          prompt={postStopPrompt}
          busy={postStopBusy}
          onDone={onPostStopDone}
          onStillGoing={onPostStopStillGoing}
        />
      )}

      <section className="experience-work-stream" aria-labelledby={isDesktop ? undefined : 'experience-work-heading'} aria-label={isDesktop ? 'Tasks for today' : undefined}>
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
      </section>

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
