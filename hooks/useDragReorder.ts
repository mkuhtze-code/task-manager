'use client';

import { useRef, useState } from 'react';
import type { CSSProperties, Dispatch, PointerEvent, SetStateAction } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { ROW_GAP, type DragState, type Task } from '@/lib/taskTypes';

// Manual drag-to-reorder: tracks the in-flight drag gesture, keeps a ref
// to each row element (for measuring row height), and persists the new
// order to the server when the pointer lifts.
export function useDragReorder(setTasks: Dispatch<SetStateAction<Task[]>>) {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const rowElsRef = useRef<Record<string, HTMLDivElement | null>>({});

  function handleDragHandlePointerDown(e: PointerEvent, taskId: string, currentOrderIds: string[]) {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const originalIndex = currentOrderIds.indexOf(taskId);
    const rowEl = rowElsRef.current[taskId];
    const rect = rowEl?.getBoundingClientRect();
    const rowHeight = (rect?.height || 60) + ROW_GAP;
    setDragState({
      id: taskId,
      originalIndex,
      currentIndex: originalIndex,
      startY: e.clientY,
      offsetY: 0,
      rowHeight,
      orderSnapshot: currentOrderIds,
    });
  }

  function handleDragHandlePointerMove(e: PointerEvent) {
    setDragState((prev) => {
      if (!prev) return prev;
      const deltaY = e.clientY - prev.startY;
      const indexShift = Math.round(deltaY / prev.rowHeight);
      const maxIndex = prev.orderSnapshot.length - 1;
      const nextIndex = Math.min(Math.max(prev.originalIndex + indexShift, 0), maxIndex);
      return { ...prev, offsetY: deltaY, currentIndex: nextIndex };
    });
  }

  async function handleDragHandlePointerUp() {
    const finalState = dragState;
    setDragState(null);
    if (!finalState) return;
    const { id, originalIndex, currentIndex, orderSnapshot } = finalState;
    if (currentIndex === originalIndex) return;

    const newOrderIds = [...orderSnapshot];
    newOrderIds.splice(originalIndex, 1);
    newOrderIds.splice(currentIndex, 0, id);

    setTasks((prev) => {
      const byId: Record<string, Task> = {};
      prev.forEach((t) => (byId[t.id] = t));
      const reindexed = newOrderIds.filter((tid) => byId[tid]).map((tid, idx) => ({ ...byId[tid], order_index: idx }));
      const others = prev.filter((t) => !newOrderIds.includes(t.id));
      return [...reindexed, ...others];
    });

    await Promise.all(
      newOrderIds.map((tid, idx) => supabase.from('tasks').update({ order_index: idx }).eq('id', tid))
    );
  }

  // Row-style for a given list index during an active drag: lifts the
  // dragged row and slides its neighbors out of the way.
  function dragRowStyle(idx: number, taskId: string): CSSProperties {
    if (!dragState) return {};
    if (taskId === dragState.id) {
      return {
        transform: `translateY(${dragState.offsetY}px) scale(1.02)`,
        transition: 'none',
        zIndex: 30,
        position: 'relative',
        boxShadow: '0 10px 24px rgba(26,41,51,0.3)',
      };
    }
    const { originalIndex, currentIndex, rowHeight } = dragState;
    let shift = 0;
    if (originalIndex < currentIndex && idx > originalIndex && idx <= currentIndex) shift = -1;
    else if (originalIndex > currentIndex && idx >= currentIndex && idx < originalIndex) shift = 1;
    return {
      transform: `translateY(${shift * rowHeight}px)`,
      transition: 'transform 0.2s var(--ease)',
      position: 'relative',
      zIndex: 1,
    };
  }

  return {
    dragState,
    rowElsRef,
    handleDragHandlePointerDown,
    handleDragHandlePointerMove,
    handleDragHandlePointerUp,
    dragRowStyle,
  };
}
