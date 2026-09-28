import type { SortMode, Task } from '@/lib/taskTypes';

/**
 * Order tasks for display.
 *
 * capacity_first: due-today first, then fit timed work into remaining capacity.
 * Optional preferredOrderIds (from planCapacitySequence) aligns list order with
 * the same urgency/fit ranking used for overflow/carry — so the day rail and
 * auto-carry share one pressure model.
 */
export function sortTasks(
  list: Task[],
  mode: SortMode,
  remainingForTaskFn?: (t: Task) => number,
  taskCapacity?: number,
  preferredOrderIds?: string[] | null
): Task[] {
  const arr = [...list];

  if (mode === 'manual') {
    arr.sort((a, b) => a.order_index - b.order_index);
    return arr;
  }
  if (mode === 'oldest_first') {
    arr.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    return arr;
  }
  if (mode === 'newest_first') {
    arr.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return arr;
  }

  arr.sort((a, b) => {
    const aKey = a.due_today ? 0 : 1;
    const bKey = b.due_today ? 0 : 1;
    if (aKey !== bKey) return aKey - bKey;
    return a.order_index - b.order_index;
  });

  if (mode === 'capacity_first' && remainingForTaskFn && taskCapacity !== undefined) {
    // List items (no time estimate) never compete in the time-based fit
    // calculation — there's no clock pressure to weigh them against, so
    // they'd trivially "fit" and skew the ordering. They get their own
    // calm lane at the bottom instead, in the same due-today/order_index
    // sequence as everything else.
    const timed = arr.filter((t) => t.estimate_mins > 0);
    const listItems = arr.filter((t) => t.estimate_mins <= 0);

    let orderedTimed = timed;
    if (preferredOrderIds && preferredOrderIds.length > 0) {
      const rank = new Map(preferredOrderIds.map((id, i) => [id, i]));
      const fallback = preferredOrderIds.length;
      orderedTimed = [...timed].sort((a, b) => {
        const ra = rank.has(a.id) ? (rank.get(a.id) as number) : fallback + a.order_index;
        const rb = rank.has(b.id) ? (rank.get(b.id) as number) : fallback + b.order_index;
        if (ra !== rb) return ra - rb;
        return a.order_index - b.order_index;
      });
    }

    let cumulative = 0;
    const fits: Task[] = [];
    const overflow: Task[] = [];
    for (const t of orderedTimed) {
      cumulative += remainingForTaskFn(t);
      if (cumulative <= taskCapacity) {
        fits.push(t);
      } else {
        overflow.push(t);
      }
    }
    return [...fits, ...overflow, ...listItems];
  }

  return arr;
}
