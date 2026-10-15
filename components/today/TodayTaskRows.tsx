'use client';

import { Fragment, type ComponentProps, type MutableRefObject } from 'react';
import { TaskCard } from '@/components/TaskCard';
import { TravelLeg } from '@/components/TravelLeg';
import { fmtMins } from '@/lib/timeFormat';
import type { Task } from '@/lib/taskTypes';

type TaskCardActions = Pick<
  ComponentProps<typeof TaskCard>,
  'onComplete' | 'onStart' | 'onStop' | 'onToggleSubtaskDone' | 'onSaveInfo'
> & {
  onToggleExpand: (taskId: string) => void;
  onOpenDetails: (taskId: string) => void;
};

export type TodayTaskRowModel = {
  task: Task;
  index: number;
  remainingForThis: number;
  liveLogged: number;
  overCap: boolean;
  fitLabel: string | null;
  fitReason: string | null;
  anyActive: boolean;
  subs: ComponentProps<typeof TaskCard>['subs'];
  learnedHint: string | null;
  jobLabel: string | null;
  expanded: boolean;
  isLocated: boolean;
  locatedIdx: number;
};

type TodayTaskRowsProps = TaskCardActions & {
  rows: TodayTaskRowModel[];
  geoAware: boolean;
  driveFromBaseMins: number;
  originLabel: string;
  returnLabel: string | null;
  locatedInOrder: Task[];
  orderedIds: string[];
  sortMode: string;
  rowElsRef: MutableRefObject<Record<string, HTMLDivElement | null>>;
  dragRowStyle: (index: number, taskId: string) => React.CSSProperties;
  handleDragHandlePointerDown: (event: React.PointerEvent, taskId: string, orderedIds: string[]) => void;
  handleDragHandlePointerMove: (event: React.PointerEvent) => void;
  handleDragHandlePointerUp: () => void;
};

export function TodayTaskRows({
  rows,
  geoAware,
  driveFromBaseMins,
  originLabel,
  returnLabel,
  locatedInOrder,
  orderedIds,
  sortMode,
  rowElsRef,
  dragRowStyle,
  handleDragHandlePointerDown,
  handleDragHandlePointerMove,
  handleDragHandlePointerUp,
  onToggleExpand,
  onOpenDetails,
  onComplete,
  onStart,
  onStop,
  onToggleSubtaskDone,
  onSaveInfo,
}: TodayTaskRowsProps) {
  return (
    <>
      {rows.map((row) => {
        const { task, index, isLocated, locatedIdx } = row;
        return (
          <Fragment key={task.id}>
            {geoAware && isLocated && locatedIdx === 0 && driveFromBaseMins > 0 && (
              <TravelLeg
                label={fmtMins(driveFromBaseMins)}
                detail={`Drive from ${originLabel}`}
              />
            )}
            <div
              className="experience-work-stream__item"
              data-work-state={task.status === 'active' ? 'active' : task.status === 'done' ? 'complete' : 'open'}
              ref={(element) => { rowElsRef.current[task.id] = element; }}
              style={dragRowStyle(index, task.id)}
            >
              <TaskCard
                task={task}
                remainingForThis={row.remainingForThis}
                liveLogged={row.liveLogged}
                overCap={row.overCap}
                fitLabel={row.fitLabel}
                fitReason={row.fitReason}
                anyActive={row.anyActive}
                subs={row.subs}
                learnedHint={row.learnedHint}
                jobLabel={row.jobLabel}
                expanded={row.expanded}
                onToggleExpand={() => onToggleExpand(task.id)}
                onOpenDetails={() => onOpenDetails(task.id)}
                onComplete={onComplete}
                onStart={onStart}
                onStop={onStop}
                onToggleSubtaskDone={onToggleSubtaskDone}
                onSaveInfo={onSaveInfo}
                dragHandleProps={
                  sortMode === 'manual'
                    ? {
                        onPointerDown: (event) => handleDragHandlePointerDown(event, task.id, orderedIds),
                        onPointerMove: handleDragHandlePointerMove,
                        onPointerUp: handleDragHandlePointerUp,
                      }
                    : undefined
                }
              />
            </div>
            {geoAware && isLocated && task.drive_mins_to_next > 0 && (
              <TravelLeg
                label={fmtMins(task.drive_mins_to_next)}
                detail={
                  locatedIdx === locatedInOrder.length - 1
                    ? `Back to ${returnLabel ?? originLabel}`
                    : locatedInOrder[locatedIdx + 1]
                      ? `To ${locatedInOrder[locatedIdx + 1].text}`
                      : 'To next stop'
                }
              />
            )}
          </Fragment>
        );
      })}
    </>
  );
}
